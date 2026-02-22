import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Plus, Square, Trash2 } from 'lucide-react';
import { codeWorkspace } from '../../services/codeWorkspace';

// ─── .ipynb types ────────────────────────────────────────────────────────────

interface NbOutput {
  output_type: 'stream' | 'execute_result' | 'display_data' | 'error';
  name?: string; // 'stdout' | 'stderr'
  text?: string | string[];
  traceback?: string[];
  data?: Record<string, unknown>;
  execution_count?: number | null;
}

interface NbCell {
  id: string;
  cell_type: 'code' | 'markdown' | 'raw';
  source: string | string[];
  outputs: NbOutput[];
  execution_count: number | null;
  metadata: Record<string, unknown>;
}

interface Notebook {
  nbformat: number;
  nbformat_minor: number;
  metadata: Record<string, unknown>;
  cells: NbCell[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const srcString = (src: string | string[]): string =>
  Array.isArray(src) ? src.join('') : (src || '');

const srcLines = (code: string): string[] =>
  code === '' ? [] : code.split('\n').map((l, i, arr) => (i < arr.length - 1 ? `${l}\n` : l));

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export const buildDefaultNotebook = (title: string): string =>
  JSON.stringify(
    {
      nbformat: 4,
      nbformat_minor: 5,
      metadata: { kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' } },
      cells: [
        {
          id: makeId(),
          cell_type: 'code',
          source: [`# ${title}\n`],
          outputs: [],
          execution_count: null,
          metadata: {},
        },
      ],
    },
    null,
    2
  );

const outputText = (outputs: NbOutput[]): string =>
  outputs
    .map((o) => {
      if (
        o.output_type === 'stream' ||
        o.output_type === 'execute_result' ||
        o.output_type === 'display_data'
      ) {
        const t = o.text;
        if (Array.isArray(t)) return t.join('');
        if (typeof t === 'string') return t;
        const plain = (o.data as Record<string, unknown>)?.['text/plain'];
        return typeof plain === 'string' ? plain : '';
      }
      if (o.output_type === 'error') {
        return (o.traceback || []).join('\n');
      }
      return '';
    })
    .join('');

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  chapterId: string;
  filename: string;
  chapterTitle?: string;
  onSendToTutor?: (msg: string) => void;
}

const NotebookEditor: React.FC<Props> = ({ chapterId, filename, chapterTitle, onSendToTutor }) => {
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [loadError, setLoadError] = useState('');
  const [runningId, setRunningId] = useState<string | null>(null);
  const [liveOut, setLiveOut] = useState<Record<string, string>>({});

  // Refs for stable access inside IPC callbacks
  const notebookRef = useRef<Notebook | null>(null);
  const runningIdRef = useRef<string | null>(null);
  const liveOutRef = useRef<Record<string, string>>({});
  const execCountRef = useRef(0);
  const saveTimer = useRef<number | null>(null);

  notebookRef.current = notebook;
  runningIdRef.current = runningId;
  liveOutRef.current = liveOut;

  // ── Load ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setLoadError('');
    setNotebook(null);
    setRunningId(null);
    setLiveOut({});
    execCountRef.current = 0;

    (async () => {
      try {
        const result = await window.tutorApp!.readCodeFile({ chapterId, filename });
        if (cancelled) return;
        const nb: Notebook = JSON.parse(result.content);
        setNotebook(nb);
      } catch {
        if (cancelled) return;
        // File missing or corrupted — bootstrap a fresh notebook
        const nb: Notebook = JSON.parse(buildDefaultNotebook(chapterTitle || filename));
        try {
          await window.tutorApp!.writeCodeFile({
            chapterId,
            filename,
            content: JSON.stringify(nb, null, 2),
          });
        } catch {
          /* ignore */
        }
        if (!cancelled) setNotebook(nb);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chapterId, filename, chapterTitle]);

  // ── Save ─────────────────────────────────────────────────────────────────

  const scheduleSave = useCallback(
    (nb: Notebook) => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        window.tutorApp
          ?.writeCodeFile({ chapterId, filename, content: JSON.stringify(nb, null, 2) })
          .catch(() => {});
      }, 800);
    },
    [chapterId, filename]
  );

  // ── IPC output listeners ──────────────────────────────────────────────────

  useEffect(() => {
    const offOut = codeWorkspace.onOutput((evt) => {
      if (evt.chapterId !== chapterId) return;
      const id = runningIdRef.current;
      if (!id) return;
      const next = { ...liveOutRef.current, [id]: (liveOutRef.current[id] || '') + evt.data };
      liveOutRef.current = next;
      setLiveOut(next);
    });

    const offExit = codeWorkspace.onExit((evt) => {
      if (evt.chapterId !== chapterId) return;
      const id = runningIdRef.current;
      if (!id) return;

      execCountRef.current += 1;
      const captured = liveOutRef.current[id] || '';
      const nb = notebookRef.current;
      if (!nb) return;

      const updated: Notebook = {
        ...nb,
        cells: nb.cells.map((c) => {
          if (c.id !== id) return c;
          const outputs: NbOutput[] = captured
            ? [{ output_type: 'stream', name: 'stdout', text: captured }]
            : [];
          return { ...c, outputs, execution_count: execCountRef.current };
        }),
      };
      notebookRef.current = updated;
      setNotebook(updated);
      scheduleSave(updated);

      runningIdRef.current = null;
      setRunningId(null);
      const newLive = { ...liveOutRef.current };
      delete newLive[id];
      liveOutRef.current = newLive;
      setLiveOut(newLive);
    });

    return () => {
      offOut();
      offExit();
    };
  }, [chapterId, scheduleSave]);

  // ── Cell operations ───────────────────────────────────────────────────────

  const runCell = async (cellId: string) => {
    if (runningIdRef.current) {
      await codeWorkspace.kill(chapterId);
    }
    const nb = notebookRef.current;
    if (!nb) return;
    const cell = nb.cells.find((c) => c.id === cellId);
    if (!cell || cell.cell_type !== 'code') return;

    const newLive = { ...liveOutRef.current, [cellId]: '' };
    liveOutRef.current = newLive;
    setLiveOut(newLive);

    runningIdRef.current = cellId;
    setRunningId(cellId);

    try {
      await codeWorkspace.execute(chapterId, srcString(cell.source), {
        filename: `__nb_${cellId.slice(0, 8)}.py`,
        timeoutMs: 60_000,
      });
    } catch {
      runningIdRef.current = null;
      setRunningId(null);
    }
  };

  const stopCell = async () => {
    await codeWorkspace.kill(chapterId);
  };

  const updateSource = (cellId: string, code: string) => {
    setNotebook((prev) => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        cells: prev.cells.map((c) => (c.id === cellId ? { ...c, source: srcLines(code) } : c)),
      };
      scheduleSave(updated);
      return updated;
    });
  };

  const addCellAfter = (afterId: string | null) => {
    const newCell: NbCell = {
      id: makeId(),
      cell_type: 'code',
      source: [],
      outputs: [],
      execution_count: null,
      metadata: {},
    };
    setNotebook((prev) => {
      if (!prev) return prev;
      let cells: NbCell[];
      if (!afterId) {
        cells = [...prev.cells, newCell];
      } else {
        const idx = prev.cells.findIndex((c) => c.id === afterId);
        cells = [...prev.cells.slice(0, idx + 1), newCell, ...prev.cells.slice(idx + 1)];
      }
      const updated = { ...prev, cells };
      scheduleSave(updated);
      return updated;
    });
  };

  const deleteCell = (cellId: string) => {
    setNotebook((prev) => {
      if (!prev || prev.cells.length <= 1) return prev;
      const updated = { ...prev, cells: prev.cells.filter((c) => c.id !== cellId) };
      scheduleSave(updated);
      return updated;
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loadError) {
    return <div className="p-4 text-sm text-red-600">{loadError}</div>;
  }

  if (!notebook) {
    return <div className="p-4 text-sm text-gray-400">Loading notebook…</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      <div className="max-w-3xl mx-auto py-4 px-2 space-y-2">
        {notebook.cells.map((cell) => {
          const isRunning = runningId === cell.id;
          const live = liveOut[cell.id];
          const out = isRunning ? (live ?? '') : outputText(cell.outputs);
          const hasOut = isRunning || out !== '';

          return (
            <div key={cell.id} className="group flex gap-2">
              {/* Gutter */}
              <div className="w-14 shrink-0 text-right pt-3 select-none">
                <span className="text-[11px] font-mono text-blue-700/80 font-semibold">
                  In [{isRunning ? '*' : (cell.execution_count ?? ' ')}]:
                </span>
              </div>

              {/* Cell body */}
              <div className="flex-1 min-w-0">
                {/* Toolbar (show on hover) */}
                {cell.cell_type === 'code' && (
                  <div className="flex items-center gap-0.5 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => (isRunning ? stopCell() : runCell(cell.id))}
                      disabled={!!runningId && !isRunning}
                      className="p-1 rounded text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 disabled:opacity-30"
                      title={isRunning ? 'Stop (⌘⏎)' : 'Run cell (⌘⏎)'}
                    >
                      {isRunning ? <Square size={13} className="text-red-500" /> : <Play size={13} />}
                    </button>
                    <button
                      onClick={() => addCellAfter(cell.id)}
                      className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                      title="Insert cell below"
                    >
                      <Plus size={13} />
                    </button>
                    {notebook.cells.length > 1 && (
                      <button
                        onClick={() => deleteCell(cell.id)}
                        className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
                        title="Delete cell"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                )}

                {/* Code editor */}
                <div
                  className={`rounded-sm border ${
                    isRunning
                      ? 'border-blue-400 shadow-[0_0_0_1px_rgba(96,165,250,0.4)]'
                      : 'border-gray-200 focus-within:border-blue-300'
                  } bg-[#f7f7f7] overflow-hidden`}
                >
                  <textarea
                    value={srcString(cell.source)}
                    onChange={(e) => updateSource(cell.id, e.target.value)}
                    rows={Math.max(2, srcString(cell.source).split('\n').length)}
                    className="w-full px-3 py-2.5 text-[13px] leading-6 font-mono bg-transparent resize-none outline-none border-0"
                    spellCheck={false}
                    onKeyDown={(e) => {
                      if (e.key === 'Tab') {
                        e.preventDefault();
                        const el = e.currentTarget;
                        const s = el.selectionStart;
                        const end = el.selectionEnd;
                        const val = el.value;
                        updateSource(cell.id, `${val.slice(0, s)}    ${val.slice(end)}`);
                        window.setTimeout(() => {
                          el.selectionStart = el.selectionEnd = s + 4;
                        }, 0);
                      }
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        e.preventDefault();
                        if (isRunning) stopCell();
                        else runCell(cell.id);
                      }
                    }}
                  />
                </div>

                {/* Output */}
                {hasOut && (
                  <div className="mt-1 flex gap-2">
                    <div className="w-14 shrink-0 text-right pt-0.5 select-none">
                      <span className="text-[11px] font-mono text-orange-600/80">
                        Out [{cell.execution_count ?? ''}]:
                      </span>
                    </div>
                    <pre className="flex-1 text-[12px] font-mono text-gray-800 bg-white border-l-2 border-gray-200 px-2 py-1 whitespace-pre-wrap break-all overflow-x-auto">
                      {out || (isRunning ? '…' : '')}
                    </pre>
                  </div>
                )}

                {/* Send to tutor (visible after output) */}
                {hasOut && !isRunning && onSendToTutor && (
                  <div className="mt-1 flex justify-end">
                    <button
                      onClick={() =>
                        onSendToTutor(
                          `Here is my notebook cell output:\n\`\`\`\n${out}\n\`\`\``
                        )
                      }
                      className="text-[11px] text-gray-400 hover:text-gray-700 px-1.5 py-0.5"
                    >
                      Send to tutor ↑
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Add cell at bottom */}
        <div className="flex gap-2">
          <div className="w-14 shrink-0" />
          <button
            onClick={() =>
              addCellAfter(notebook.cells[notebook.cells.length - 1]?.id ?? null)
            }
            className="flex-1 text-xs text-gray-400 hover:text-gray-600 border border-dashed border-gray-200 rounded py-2 hover:border-gray-300 flex items-center justify-center gap-1"
          >
            <Plus size={12} />
            Add cell
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotebookEditor;
