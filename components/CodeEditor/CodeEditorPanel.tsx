import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CodeWorkspaceFile } from '../../types';
import { codeWorkspace } from '../../services/codeWorkspace';
import { getWorkspaceUploadUrl, confirmWorkspaceUpload } from '../../services/backendClient';
import CodeEditorToolbar, { EditorMode } from './CodeEditorToolbar';
import OutputPanel, { OutputChunk } from './OutputPanel';
import NotebookEditor, { buildDefaultNotebook } from './NotebookEditor';
import WorkspaceFileSidebar from './WorkspaceFileSidebar';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vs } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface CodeInjection {
  id: number;
  code: string;
  language?: string;
}

interface CodeEditorPanelProps {
  chapterId: string;
  chapterTitle?: string;
  visible: boolean;
  codeInjection?: CodeInjection | null;
  initialActiveFile?: string | null;
  initialOutputChunks?: OutputChunk[];
  onActiveFileChange?: (filename: string) => void;
  onOutputChange?: (chunks: OutputChunk[]) => void;
  onOutputGenerated?: (output: string) => void;
  onCodeInjectionHandled?: (injectionId: number) => void;
  onSendToTutor?: (message: string) => void;
  onSendOutputToChatInput?: (message: string) => void;
}

type MonacoEditorProps = {
  value?: string;
  onChange?: (value: string | undefined) => void;
  language?: string;
  theme?: string;
  loading?: React.ReactNode;
  options?: Record<string, unknown>;
};

type MonacoEditorComponent = React.ComponentType<MonacoEditorProps>;

const getLanguageFromFilename = (filename: string) => {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.md')) return 'markdown';
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'yaml';
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return 'plaintext';
  return 'plaintext';
};

const buildDefaultScript = (chapterId: string, chapterTitle?: string) => {
  const title = chapterTitle?.trim() || chapterId;
  return `# ${title}\n# Local coding workspace\n\nif __name__ == "__main__":\n    print("Hello from ${title}")\n`;
};

const CodeEditorPanel: React.FC<CodeEditorPanelProps> = ({
  chapterId,
  chapterTitle,
  visible,
  codeInjection,
  initialActiveFile,
  initialOutputChunks,
  onActiveFileChange,
  onOutputChange,
  onOutputGenerated,
  onCodeInjectionHandled,
  onSendToTutor,
  onSendOutputToChatInput,
}) => {
  const [mode, setMode] = useState<EditorMode>('notebook');
  const [files, setFiles] = useState<CodeWorkspaceFile[]>([]);
  const [activeFile, setActiveFile] = useState('');
  const [activeNotebook, setActiveNotebook] = useState('');
  // Tracks which chapterId the current activeNotebook/files were loaded for.
  // NotebookEditor is only rendered when this matches the current chapterId prop,
  // preventing a stale activeNotebook from a previous chapter being read in the wrong workspace.
  const [bootedForChapterId, setBootedForChapterId] = useState(chapterId);
  const [chapterDir, setChapterDir] = useState('');
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [outputChunks, setOutputChunks] = useState<OutputChunk[]>(initialOutputChunks || []);
  const [loadError, setLoadError] = useState('');
  const [didCopy, setDidCopy] = useState(false);
  const [monacoEditor, setMonacoEditor] = useState<MonacoEditorComponent | null>(null);
  const [monacoLoadDone, setMonacoLoadDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);
  const fallbackEditorRef = useRef<HTMLTextAreaElement>(null);
  const fallbackHighlightRef = useRef<HTMLDivElement>(null);

  const skipAutosaveRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const loadTokenRef = useRef(0);
  const latestDocRef = useRef({ chapterId, activeFile, code });
  const lastAppliedInjectionRef = useRef<number | null>(null);
  // Always holds the latest chapterId so async callbacks can guard stale state updates
  const currentChapterIdRef = useRef(chapterId);
  currentChapterIdRef.current = chapterId;

  // Callback refs: always point to the latest prop without being useEffect deps.
  // This prevents infinite loops when parent passes inline arrow functions.
  const onOutputChangeRef = useRef(onOutputChange);
  onOutputChangeRef.current = onOutputChange;
  const onOutputGeneratedRef = useRef(onOutputGenerated);
  onOutputGeneratedRef.current = onOutputGenerated;

  const outputText = useMemo(() => outputChunks.map((chunk) => chunk.data).join(''), [outputChunks]);

  const appendOutput = (stream: 'stdout' | 'stderr', data: string) => {
    const next: OutputChunk = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      stream,
      data,
    };
    setOutputChunks((prev) => [...prev, next]);
  };

  const syncFallbackScroll = () => {
    const editorNode = fallbackEditorRef.current;
    const highlightNode = fallbackHighlightRef.current;
    if (!editorNode || !highlightNode) {
      return;
    }
    highlightNode.scrollTop = editorNode.scrollTop;
    highlightNode.scrollLeft = editorNode.scrollLeft;
  };

  const handleFallbackKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Tab') {
      return;
    }
    event.preventDefault();
    const node = event.currentTarget;
    const start = node.selectionStart || 0;
    const end = node.selectionEnd || 0;
    const next = `${code.slice(0, start)}\t${code.slice(end)}`;
    setCode(next);
    window.setTimeout(() => {
      node.selectionStart = node.selectionEnd = start + 1;
    }, 0);
  };

  const flushPendingSave = () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const current = latestDocRef.current;
    if (!current.activeFile || skipAutosaveRef.current) {
      return;
    }
    codeWorkspace.writeFile(current.chapterId, current.activeFile, current.code).catch(() => {});
  };

  const readFileIntoEditor = async (filename: string) => {
    setIsLoading(true);
    setLoadError('');
    const currentToken = loadTokenRef.current;
    try {
      const content = await codeWorkspace.readFile(chapterId, filename);
      if (currentToken !== loadTokenRef.current) {
        return;
      }
      skipAutosaveRef.current = true;
      setCode(content);
      window.setTimeout(() => {
        skipAutosaveRef.current = false;
      }, 0);
    } catch (error) {
      if (currentToken !== loadTokenRef.current) {
        return;
      }
      setLoadError(error instanceof Error ? error.message : 'Failed to read file');
      skipAutosaveRef.current = true;
      setCode('');
      window.setTimeout(() => {
        skipAutosaveRef.current = false;
      }, 0);
    } finally {
      if (currentToken === loadTokenRef.current) {
        setIsLoading(false);
      }
    }
  };

  const handleSelectFile = async (filename: string) => {
    flushPendingSave();
    setActiveFile(filename);
    onActiveFileChange?.(filename);
    loadTokenRef.current += 1;
    await readFileIntoEditor(filename);
  };

  useEffect(() => {
    let cancelled = false;

    const loadOptionalMonaco = async () => {
      try {
        const imported = await import('@monaco-editor/react');
        if (cancelled) return;
        if (imported?.default) {
          setMonacoEditor(() => imported.default as MonacoEditorComponent);
        }
      } catch {
        if (cancelled) return;
        setMonacoEditor(null);
      } finally {
        if (!cancelled) {
          setMonacoLoadDone(true);
        }
      }
    };

    loadOptionalMonaco();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      setLoadError('');
      setIsLoading(true);
      setIsRunning(false);
      setActiveNotebook('');
      setActiveFile('');
      setFiles([]);
      setBootedForChapterId(''); // invalidate until boot completes for new chapterId
      loadTokenRef.current += 1;

      try {
        let listed = await codeWorkspace.listFiles(chapterId);
        if (!listed.length) {
          // Default: create a .py script (no kernel started until user explicitly opens a .ipynb)
          const chapterCode = chapterId.includes('/')
            ? chapterId.split('/').pop() || chapterId
            : chapterId;
          const pyName = `${chapterCode.replace(/[^\w\-.]/g, '_')}.py`;
          await codeWorkspace.createFile(
            chapterId,
            pyName,
            buildDefaultScript(chapterId, chapterTitle)
          );
          listed = await codeWorkspace.listFiles(chapterId);
        }

        if (cancelled) return;

        setFiles(listed);
        codeWorkspace.getWorkspaceDir(chapterId).then((dir) => {
          if (!cancelled) setChapterDir(dir);
        }).catch(() => {});

        const ipynbFiles = listed.filter((f) => f.name.toLowerCase().endsWith('.ipynb'));
        const pyFiles = listed.filter((f) => f.name.toLowerCase().endsWith('.py'));

        // Only auto-open a notebook (and start kernel) if:
        // 1. The user previously had a specific .ipynb open (initialActiveFile), OR
        // 2. There are no .py files — notebook is the only option
        const preferredNb =
          (initialActiveFile && ipynbFiles.find((f) => f.name === initialActiveFile)?.name) ||
          (pyFiles.length === 0 ? ipynbFiles[0]?.name : '') ||
          '';

        const detectedMode: EditorMode = preferredNb ? 'notebook' : 'script';
        setMode(detectedMode);
        setActiveNotebook(preferredNb);
        setBootedForChapterId(chapterId); // state is now consistent for this chapter

        const preferred =
          (initialActiveFile && listed.find((file) => file.name === initialActiveFile)?.name) ||
          listed.find((file) => file.name.toLowerCase().endsWith('.py'))?.name ||
          listed[0]?.name ||
          '';
        setActiveFile(preferred);
        onActiveFileChange?.(preferred);
        loadTokenRef.current += 1;
        await readFileIntoEditor(preferred);
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : 'Failed to load workspace');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    setOutputChunks(initialOutputChunks || []);
    lastAppliedInjectionRef.current = null;
    boot();

    return () => {
      cancelled = true;
      codeWorkspace.kill(chapterId).catch(() => {});
      flushPendingSave();
    };
  }, [chapterId]);

  useEffect(() => {
    latestDocRef.current = { chapterId, activeFile, code };
  }, [chapterId, activeFile, code]);

  useEffect(() => {
    return () => {
      flushPendingSave();
    };
  }, []);

  useEffect(() => {
    onOutputChangeRef.current?.(outputChunks);
    onOutputGeneratedRef.current?.(outputText);
  }, [outputChunks, outputText]);

  useEffect(() => {
    const offOutput = codeWorkspace.onOutput((event) => {
      if (event.chapterId !== chapterId) return;
      appendOutput(event.stream, event.data);
    });

    const offExit = codeWorkspace.onExit((event) => {
      if (event.chapterId !== chapterId) return;
      setIsRunning(false);
      if (event.timedOut) {
        appendOutput('stderr', '[Execution stopped: timeout]\n');
      }
    });

    return () => {
      offOutput();
      offExit();
    };
  }, [chapterId]);

  useEffect(() => {
    if (!activeFile || skipAutosaveRef.current) {
      return;
    }
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      codeWorkspace.writeFile(chapterId, activeFile, code).catch(() => {});
      saveTimerRef.current = null;
    }, 1000);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [chapterId, activeFile, code]);

  useEffect(() => {
    if (!codeInjection?.id || !activeFile) {
      return;
    }
    if (lastAppliedInjectionRef.current === codeInjection.id) {
      return;
    }

    lastAppliedInjectionRef.current = codeInjection.id;
    skipAutosaveRef.current = true;
    setCode(codeInjection.code);
    window.setTimeout(() => {
      skipAutosaveRef.current = false;
    }, 0);
    codeWorkspace
      .writeFile(chapterId, activeFile, codeInjection.code)
      .catch(() => {})
      .finally(() => {
        onCodeInjectionHandled?.(codeInjection.id);
      });
  }, [codeInjection?.id, activeFile, chapterId, onCodeInjectionHandled]);

  const handleRun = async () => {
    if (!activeFile) return;
    try {
      await codeWorkspace.writeFile(chapterId, activeFile, code);
      appendOutput('stdout', `\n$ python ${activeFile}\n`);
      setIsRunning(true);
      await codeWorkspace.execute(chapterId, code, { filename: activeFile, timeoutMs: 60_000 });
    } catch (error) {
      setIsRunning(false);
      appendOutput('stderr', `[run failed] ${error instanceof Error ? error.message : 'unknown error'}\n`);
    }
  };

  const handleStop = async () => {
    try {
      await codeWorkspace.kill(chapterId);
    } finally {
      setIsRunning(false);
    }
  };

  const handleClearOutput = () => {
    setOutputChunks([]);
  };

  const handleCopyOutput = async () => {
    try {
      await navigator.clipboard.writeText(outputText);
      setDidCopy(true);
      window.setTimeout(() => setDidCopy(false), 1200);
    } catch {
      // Ignore clipboard failures.
    }
  };

  const handleSendToTutor = () => {
    if (!outputText.trim()) return;
    onSendToTutor?.(`Here is my code output:\n\`\`\`\n${outputText}\n\`\`\``);
  };

  const handleSendToChatInput = () => {
    if (!outputText.trim()) return;
    onSendOutputToChatInput?.(`\`\`\`\n${outputText}\n\`\`\``);
  };

  const handleOpenFolder = () => {
    if (chapterDir) {
      codeWorkspace.openPath(chapterDir).catch(() => {});
    }
  };

  const handleOpenJupyter = async () => {
    const result = await codeWorkspace.openJupyter(chapterId);
    if (!result.started) {
      appendOutput('stderr', `[Jupyter] ${result.reason || 'Failed to start'}\n`);
    }
  };

  const refreshFiles = async () => {
    const forChapterId = chapterId; // capture at call time (closure may be from old render)
    const listed = await codeWorkspace.listFiles(forChapterId).catch(() => [] as CodeWorkspaceFile[]);
    // Guard: only update state if we're still on the same chapter
    if (currentChapterIdRef.current === forChapterId) {
      setFiles(listed);
    }
  };

  const handleNewFile = async (filename: string) => {
    const isNotebook = filename.toLowerCase().endsWith('.ipynb');
    const defaultContent = isNotebook
      ? buildDefaultNotebook(chapterTitle || filename)
      : buildDefaultScript(chapterId, filename.replace(/\.[^.]+$/, ''));
    await codeWorkspace.createFile(chapterId, filename, defaultContent);
    await refreshFiles();
    if (isNotebook) {
      setActiveNotebook(filename);
      setMode('notebook');
    } else {
      flushPendingSave();
      setActiveFile(filename);
      onActiveFileChange?.(filename);
      loadTokenRef.current += 1;
      setMode('script');
      await readFileIntoEditor(filename);
    }
  };

  const handleDeleteFile = async (filename: string) => {
    await codeWorkspace.deleteFile(chapterId, filename);
    await refreshFiles();
    // If the deleted file was active, pick another
    setFiles((prev) => {
      const remaining = prev.filter((f) => f.name !== filename);
      if (filename === activeFile && remaining.length > 0) {
        const next = remaining[0].name;
        setActiveFile(next);
        onActiveFileChange?.(next);
        loadTokenRef.current += 1;
        readFileIntoEditor(next);
      }
      if (filename === activeNotebook) {
        const nextNb = remaining.find((f) => f.name.toLowerCase().endsWith('.ipynb'));
        setActiveNotebook(nextNb?.name || '');
      }
      return remaining;
    });
  };

  const handleSidebarSelectFile = (filename: string) => {
    const isNotebook = filename.toLowerCase().endsWith('.ipynb');
    if (isNotebook) {
      setActiveNotebook(filename);
      setMode('notebook');
    } else {
      flushPendingSave();
      setMode('script');
      handleSelectFile(filename);
    }
  };

  const handleSubmit = async () => {
    const filename = mode === 'notebook' ? activeNotebook : activeFile;
    if (!filename || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitDone(false);
    try {
      // Read current file content from disk
      let content: string;
      try {
        content = await codeWorkspace.readFile(chapterId, filename);
      } catch {
        content = code;
      }

      const blob = new Blob([content], { type: 'text/plain' });
      const fileSizeBytes = blob.size;

      const { presigned_url, oss_key } = await getWorkspaceUploadUrl({
        chapterId,
        filename,
        fileSizeBytes,
      });

      // Direct PUT to OSS
      const ossResponse = await fetch(presigned_url, { method: 'PUT', body: blob });
      if (!ossResponse.ok) {
        throw new Error(`OSS upload failed: ${ossResponse.status}`);
      }

      // Confirm with backend
      await confirmWorkspaceUpload({ ossKey: oss_key, filename, chapterId, fileSizeBytes });

      setSubmitDone(true);
      window.setTimeout(() => setSubmitDone(false), 2000);
    } catch (err: unknown) {
      console.warn('[CodeEditor] File submit failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const editorLanguage = getLanguageFromFilename(activeFile);
  const highlightedLanguage = editorLanguage === 'plaintext' ? 'text' : editorLanguage;

  // The active file shown in the sidebar is the notebook (in notebook mode) or the script file
  const sidebarActiveFile = mode === 'notebook' ? activeNotebook : activeFile;

  return (
    <div className={`h-full flex flex-col bg-white min-w-0 ${visible ? 'border-l border-gray-200' : 'border-l-0'}`}>
      <CodeEditorToolbar
        mode={mode}
        isRunning={isRunning}
        hasOutput={outputChunks.length > 0}
        onRun={handleRun}
        onStop={handleStop}
        onCopyOutput={handleCopyOutput}
        onSendToTutor={handleSendToTutor}
        onOpenJupyter={handleOpenJupyter}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        submitDone={submitDone}
      />

      {/* ── Body: sidebar + editor side-by-side ── */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <WorkspaceFileSidebar
          files={files}
          activeFile={sidebarActiveFile}
          chapterDir={chapterDir}
          onSelectFile={handleSidebarSelectFile}
          onNewFile={handleNewFile}
          onDeleteFile={handleDeleteFile}
          onOpenFolder={chapterDir ? handleOpenFolder : undefined}
          onRefresh={refreshFiles}
        />

        {/* ── Right: editor area ── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {mode === 'notebook' ? (
            /* ── Notebook mode ───────────────────────────────────── */
            bootedForChapterId === chapterId && activeNotebook ? (
              <NotebookEditor
                chapterId={chapterId}
                filename={activeNotebook}
                chapterTitle={chapterTitle}
                onSendToTutor={onSendToTutor}
              />
            ) : bootedForChapterId !== chapterId ? (
              <div className="flex-1 flex items-center justify-center text-gray-300 text-sm">
                Loading workspace…
              </div>
            ) : (
              <div className="p-4 text-sm text-gray-400">
                No notebook found.{' '}
                <button
                  className="underline text-blue-500"
                  onClick={() => handleNewFile(`${chapterId.split('/').pop() || 'notebook'}.ipynb`)}
                >
                  Create one
                </button>
              </div>
            )
          ) : (
            /* ── Script mode ─────────────────────────────────────── */
            <>
              <div className="flex-1 min-h-[240px] relative">
                {loadError && (
                  <div className="absolute z-20 top-2 right-2 bg-red-50 text-red-600 border border-red-200 text-xs px-2 py-1 rounded">
                    {loadError}
                  </div>
                )}

                {monacoEditor ? (
                  React.createElement(monacoEditor, {
                    value: code,
                    onChange: (value: string | undefined) => setCode(value || ''),
                    language: editorLanguage,
                    theme: 'vs-light',
                    loading: <div className="text-xs text-gray-500 p-3">Loading editor...</div>,
                    options: {
                      automaticLayout: true,
                      minimap: { enabled: false },
                      fontSize: 13,
                      lineNumbersMinChars: 3,
                      wordWrap: 'on',
                      tabSize: 4,
                      scrollBeyondLastLine: false,
                    },
                  })
                ) : (
                  <div className="absolute inset-0 bg-white">
                    <div ref={fallbackHighlightRef} aria-hidden className="absolute inset-0 overflow-auto pointer-events-none">
                      <SyntaxHighlighter
                        language={highlightedLanguage}
                        style={vs}
                        PreTag="div"
                        customStyle={{
                          margin: 0,
                          borderRadius: 0,
                          background: 'transparent',
                          minHeight: '100%',
                          padding: '12px',
                          fontSize: '13px',
                          lineHeight: '1.5rem',
                        }}
                      >
                        {code || ' '}
                      </SyntaxHighlighter>
                    </div>
                    <textarea
                      ref={fallbackEditorRef}
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      onKeyDown={handleFallbackKeyDown}
                      onScroll={syncFallbackScroll}
                      className="absolute inset-0 p-3 resize-none border-0 outline-none bg-transparent font-mono text-[13px] leading-6 text-transparent caret-black selection:bg-blue-200/70 overflow-auto"
                      spellCheck={false}
                    />
                  </div>
                )}
                {!monacoLoadDone && (
                  <div className="absolute top-2 left-3 text-xs text-gray-500 bg-white/85 px-2 py-0.5 rounded">Loading editor module...</div>
                )}
                {isLoading && <div className="absolute left-3 top-3 text-xs text-gray-500">Loading file...</div>}
                {didCopy && <div className="absolute top-2 right-2 text-[11px] text-emerald-600">Copied</div>}
              </div>

              <div className="h-56 shrink-0">
                <OutputPanel chunks={outputChunks} onClear={handleClearOutput} onSendToChatInput={handleSendToChatInput} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CodeEditorPanel;
