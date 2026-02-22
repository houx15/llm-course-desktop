import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Plus, RefreshCw, Square, Trash2 } from 'lucide-react';

// ─── .ipynb types ────────────────────────────────────────────────────────────

interface NbOutput {
  output_type: 'stream' | 'execute_result' | 'display_data' | 'error';
  name?: string;
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

// Strip ANSI escape codes for clean text display
const stripAnsi = (str: string) => str.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');

// ─── Lightweight Jupyter kernel client ───────────────────────────────────────

interface KernelInfo {
  url: string;
  token: string;
  kernelId: string;
  ws: WebSocket;
  sessionId: string;
}

type OutputHandler = (text: string, isError?: boolean) => void;
type DoneHandler = (error?: string) => void;

const jupyterFetch = (url: string, token: string, path: string, init?: RequestInit) =>
  fetch(`${url}${path}`, {
    ...init,
    headers: {
      Authorization: `token ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

async function startKernel(url: string, token: string): Promise<string> {
  const res = await jupyterFetch(url, token, '/api/kernels', {
    method: 'POST',
    body: JSON.stringify({ name: 'python3' }),
  });
  if (!res.ok) throw new Error(`Failed to start kernel: ${res.status}`);
  const data = await res.json();
  return data.id as string;
}

async function interruptKernel(url: string, token: string, kernelId: string): Promise<void> {
  await jupyterFetch(url, token, `/api/kernels/${kernelId}/interrupt`, { method: 'POST' });
}

async function deleteKernel(url: string, token: string, kernelId: string): Promise<void> {
  await jupyterFetch(url, token, `/api/kernels/${kernelId}`, { method: 'DELETE' });
}

function connectKernelWs(url: string, token: string, kernelId: string): WebSocket {
  const wsBase = url.replace(/^http/, 'ws');
  return new WebSocket(`${wsBase}/api/kernels/${kernelId}/channels?token=${token}`);
}

// Execute code on the kernel via WebSocket.
// Returns a cleanup function (no-op once done) that can be called to abort.
function executeOnKernel(
  kernel: KernelInfo,
  code: string,
  onOutput: OutputHandler,
  onDone: DoneHandler
): () => void {
  const msgId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  let settled = false;

  const settle = (err?: string) => {
    if (settled) return;
    settled = true;
    onDone(err);
  };

  const msg = {
    header: {
      msg_id: msgId,
      msg_type: 'execute_request',
      username: '',
      session: kernel.sessionId,
      date: new Date().toISOString(),
      version: '5.3',
    },
    parent_header: {},
    metadata: {},
    content: {
      code,
      silent: false,
      store_history: true,
      user_expressions: {},
      allow_stdin: false,
      stop_on_error: true,
    },
    channel: 'shell',
    buffers: [],
  };

  const onMessage = (evt: MessageEvent) => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(evt.data as string);
    } catch {
      return;
    }
    const parentId = (parsed.parent_header as Record<string, unknown>)?.msg_id;
    if (parentId !== msgId) return;

    const msgType = (parsed.header as Record<string, unknown>)?.msg_type as string;
    const content = parsed.content as Record<string, unknown>;

    if (msgType === 'stream') {
      const text = String(content?.text || '');
      onOutput(stripAnsi(text), content?.name === 'stderr');
    } else if (msgType === 'execute_result' || msgType === 'display_data') {
      const data = content?.data as Record<string, unknown> | undefined;
      // Prefer rich representations in order
      if (data?.['image/png']) {
        onOutput(`__IMG_PNG__${data['image/png']}`, false);
      } else if (data?.['text/html']) {
        onOutput(`__HTML__${data['text/html']}`, false);
      } else {
        const plain = data?.['text/plain'];
        if (plain) onOutput(stripAnsi(String(plain)) + '\n', false);
      }
    } else if (msgType === 'error') {
      const tb = ((content?.traceback || []) as string[]).map(stripAnsi).join('\n');
      onOutput(tb + '\n', true);
    } else if (msgType === 'execute_reply') {
      kernel.ws.removeEventListener('message', onMessage);
      const status = content?.status as string;
      settle(status === 'error' ? 'error' : undefined);
    }
  };

  kernel.ws.addEventListener('message', onMessage);
  kernel.ws.send(JSON.stringify(msg));

  // Return abort function
  return () => {
    kernel.ws.removeEventListener('message', onMessage);
    settle('interrupted');
  };
}

// ─── Rich output rendering ────────────────────────────────────────────────────

const OutputLine: React.FC<{ text: string }> = ({ text }) => {
  if (text.startsWith('__IMG_PNG__')) {
    return (
      <img
        src={`data:image/png;base64,${text.slice('__IMG_PNG__'.length)}`}
        style={{ maxWidth: '100%' }}
        alt="cell output"
      />
    );
  }
  if (text.startsWith('__HTML__')) {
    return (
      <div
        dangerouslySetInnerHTML={{ __html: text.slice('__HTML__'.length) }}
        style={{ fontSize: 12 }}
      />
    );
  }
  return null;
};

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  chapterId: string;
  filename: string;
  chapterTitle?: string;
  onSendToTutor?: (msg: string) => void;
}

type KernelStatus = 'off' | 'starting' | 'idle' | 'busy' | 'error';

// Per-cell live output during execution
interface CellLive {
  segments: { text: string; isError: boolean }[];
  abort: () => void;
}

const NotebookEditor: React.FC<Props> = ({ chapterId, filename, chapterTitle, onSendToTutor }) => {
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [loadError, setLoadError] = useState('');
  const [kernelStatus, setKernelStatus] = useState<KernelStatus>('off');
  const [kernelError, setKernelError] = useState('');
  const [runningCellId, setRunningCellId] = useState<string | null>(null);
  const [cellLive, setCellLive] = useState<Record<string, CellLive>>({});
  const [execCount, setExecCount] = useState(0);

  const notebookRef = useRef<Notebook | null>(null);
  const kernelRef = useRef<KernelInfo | null>(null);
  const saveTimer = useRef<number | null>(null);

  notebookRef.current = notebook;

  // ── Load notebook ─────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setLoadError('');
    setNotebook(null);

    (async () => {
      try {
        const result = await window.tutorApp!.readCodeFile({ chapterId, filename });
        if (cancelled) return;
        setNotebook(JSON.parse(result.content));
      } catch {
        if (cancelled) return;
        const nb: Notebook = JSON.parse(buildDefaultNotebook(chapterTitle || filename));
        try {
          await window.tutorApp!.writeCodeFile({
            chapterId,
            filename,
            content: JSON.stringify(nb, null, 2),
          });
        } catch { /* ignore */ }
        if (!cancelled) setNotebook(nb);
      }
    })();

    return () => { cancelled = true; };
  }, [chapterId, filename, chapterTitle]);

  // ── Kernel lifecycle ──────────────────────────────────────────────────────

  const startKernelSession = useCallback(async () => {
    if (kernelRef.current) return; // already connected
    setKernelStatus('starting');
    setKernelError('');
    try {
      const { url, token } = await window.tutorApp!.startJupyterServer({ chapterId });
      const kernelId = await startKernel(url, token);
      const ws = connectKernelWs(url, token, kernelId);
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('WebSocket connect timeout')), 10_000);
        ws.onopen = () => { clearTimeout(timeout); resolve(); };
        ws.onerror = () => { clearTimeout(timeout); reject(new Error('WebSocket error')); };
      });
      kernelRef.current = { url, token, kernelId, ws, sessionId: makeId() };
      setKernelStatus('idle');
    } catch (err) {
      setKernelStatus('error');
      setKernelError(err instanceof Error ? err.message : String(err));
    }
  }, [chapterId]);

  const restartKernel = useCallback(async () => {
    const k = kernelRef.current;
    if (k) {
      try { k.ws.close(); } catch { /* ignore */ }
      try { await deleteKernel(k.url, k.token, k.kernelId); } catch { /* ignore */ }
      kernelRef.current = null;
    }
    setRunningCellId(null);
    setCellLive({});
    setKernelStatus('off');
    await startKernelSession();
  }, [startKernelSession]);

  // Start kernel on mount
  useEffect(() => {
    startKernelSession();
    return () => {
      const k = kernelRef.current;
      if (k) {
        try { k.ws.close(); } catch { /* ignore */ }
        deleteKernel(k.url, k.token, k.kernelId).catch(() => {});
        kernelRef.current = null;
      }
    };
  }, [startKernelSession]);

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

  // ── Cell operations ───────────────────────────────────────────────────────

  const runCell = useCallback(async (cellId: string) => {
    const kernel = kernelRef.current;
    if (!kernel) { await startKernelSession(); return; }
    const nb = notebookRef.current;
    if (!nb) return;
    const cell = nb.cells.find((c) => c.id === cellId);
    if (!cell || cell.cell_type !== 'code') return;

    // Interrupt any running cell first
    if (runningCellId) {
      setCellLive((prev) => {
        prev[runningCellId]?.abort();
        const next = { ...prev };
        delete next[runningCellId];
        return next;
      });
      try { await interruptKernel(kernel.url, kernel.token, kernel.kernelId); } catch { /* ignore */ }
    }

    setRunningCellId(cellId);
    setKernelStatus('busy');

    const segments: { text: string; isError: boolean }[] = [];

    const abort = executeOnKernel(
      kernel,
      srcString(cell.source),
      (text, isError = false) => {
        segments.push({ text, isError: isError || false });
        setCellLive((prev) => ({
          ...prev,
          [cellId]: { ...prev[cellId], segments: [...segments], abort: prev[cellId]?.abort || (() => {}) },
        }));
      },
      (error) => {
        const nextCount = execCount + 1;
        setExecCount(nextCount);

        // Build saved outputs from segments
        const savedOutputs: NbOutput[] = [];
        let textBuf = '';
        const flushText = () => {
          if (textBuf) {
            savedOutputs.push({ output_type: 'stream', name: 'stdout', text: textBuf });
            textBuf = '';
          }
        };
        for (const seg of segments) {
          if (seg.text.startsWith('__IMG_PNG__')) {
            flushText();
            const b64 = seg.text.slice('__IMG_PNG__'.length);
            savedOutputs.push({
              output_type: 'display_data',
              data: { 'image/png': b64, 'text/plain': '[image]' },
            });
          } else if (seg.text.startsWith('__HTML__')) {
            flushText();
            savedOutputs.push({
              output_type: 'display_data',
              data: { 'text/html': seg.text.slice('__HTML__'.length), 'text/plain': '[html]' },
            });
          } else {
            textBuf += seg.text;
          }
        }
        flushText();

        const updatedNb: Notebook = {
          ...notebookRef.current!,
          cells: notebookRef.current!.cells.map((c) =>
            c.id === cellId
              ? { ...c, outputs: savedOutputs, execution_count: error ? c.execution_count : nextCount }
              : c
          ),
        };
        notebookRef.current = updatedNb;
        setNotebook(updatedNb);
        scheduleSave(updatedNb);

        setRunningCellId(null);
        setKernelStatus('idle');
        setCellLive((prev) => {
          const next = { ...prev };
          delete next[cellId];
          return next;
        });
      }
    );

    setCellLive((prev) => ({ ...prev, [cellId]: { segments: [], abort } }));
  }, [runningCellId, execCount, startKernelSession, scheduleSave]);

  const stopCell = useCallback(async () => {
    const k = kernelRef.current;
    if (!k) return;
    if (runningCellId) {
      setCellLive((prev) => {
        prev[runningCellId]?.abort();
        const next = { ...prev };
        delete next[runningCellId];
        return next;
      });
    }
    try { await interruptKernel(k.url, k.token, k.kernelId); } catch { /* ignore */ }
    setRunningCellId(null);
    setKernelStatus('idle');
  }, [runningCellId]);

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

  const kernelBadge = {
    off: <span className="text-[10px] text-gray-400">No kernel</span>,
    starting: <span className="text-[10px] text-yellow-600 animate-pulse">Starting kernel…</span>,
    idle: <span className="text-[10px] text-emerald-600">● Kernel ready</span>,
    busy: <span className="text-[10px] text-blue-600 animate-pulse">● Running</span>,
    error: (
      <span className="text-[10px] text-red-500" title={kernelError}>
        ● Kernel error
      </span>
    ),
  }[kernelStatus];

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      {/* Kernel status bar */}
      <div className="sticky top-0 z-10 px-4 py-1 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {kernelBadge}
          {kernelStatus === 'error' && (
            <button
              onClick={startKernelSession}
              className="text-[10px] text-blue-600 hover:underline"
            >
              Retry
            </button>
          )}
        </div>
        <button
          onClick={restartKernel}
          disabled={kernelStatus === 'starting'}
          className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-700 disabled:opacity-40"
          title="Restart kernel (clears all variables)"
        >
          <RefreshCw size={10} />
          Restart
        </button>
      </div>

      <div className="max-w-3xl mx-auto py-4 px-2 space-y-2">
        {notebook.cells.map((cell) => {
          const isRunning = runningCellId === cell.id;
          const live = cellLive[cell.id];

          // Build display output: live segments during execution, saved outputs otherwise
          const displaySegments: { text: string; isError: boolean }[] = isRunning && live
            ? live.segments
            : (() => {
                const segs: { text: string; isError: boolean }[] = [];
                for (const o of cell.outputs) {
                  if (o.output_type === 'stream') {
                    const t = Array.isArray(o.text) ? o.text.join('') : (o.text || '');
                    segs.push({ text: t, isError: o.name === 'stderr' });
                  } else if (o.output_type === 'execute_result' || o.output_type === 'display_data') {
                    const d = o.data as Record<string, unknown> | undefined;
                    if (d?.['image/png']) segs.push({ text: `__IMG_PNG__${d['image/png']}`, isError: false });
                    else if (d?.['text/html']) segs.push({ text: `__HTML__${d['text/html']}`, isError: false });
                    else if (d?.['text/plain']) segs.push({ text: String(d['text/plain']) + '\n', isError: false });
                    else if (o.text) segs.push({ text: Array.isArray(o.text) ? o.text.join('') : o.text, isError: false });
                  } else if (o.output_type === 'error') {
                    segs.push({ text: (o.traceback || []).join('\n') + '\n', isError: true });
                  }
                }
                return segs;
              })();

          const hasOut = displaySegments.length > 0 || (isRunning && (!live || live.segments.length === 0));
          const textOut = displaySegments
            .filter((s) => !s.text.startsWith('__IMG_PNG__') && !s.text.startsWith('__HTML__'))
            .map((s) => s.text)
            .join('');

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
                {/* Toolbar */}
                {cell.cell_type === 'code' && (
                  <div className="flex items-center gap-0.5 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => (isRunning ? stopCell() : runCell(cell.id))}
                      disabled={!isRunning && kernelStatus === 'busy'}
                      className="p-1 rounded text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 disabled:opacity-30"
                      title={isRunning ? 'Interrupt (⌘⏎)' : 'Run cell (⌘⏎)'}
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
                        updateSource(cell.id, `${el.value.slice(0, s)}    ${el.value.slice(end)}`);
                        window.setTimeout(() => { el.selectionStart = el.selectionEnd = s + 4; }, 0);
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
                    <div className="flex-1 min-w-0 border-l-2 border-gray-200 px-2 py-1">
                      {isRunning && displaySegments.length === 0 ? (
                        <span className="text-[12px] text-gray-400 italic">Running…</span>
                      ) : (
                        displaySegments.map((seg, i) =>
                          seg.text.startsWith('__IMG_PNG__') || seg.text.startsWith('__HTML__') ? (
                            <OutputLine key={i} text={seg.text} />
                          ) : (
                            <pre
                              key={i}
                              className={`text-[12px] font-mono whitespace-pre-wrap break-all ${
                                seg.isError ? 'text-red-700' : 'text-gray-800'
                              }`}
                            >
                              {seg.text}
                            </pre>
                          )
                        )
                      )}
                    </div>
                  </div>
                )}

                {/* Send to tutor */}
                {hasOut && !isRunning && onSendToTutor && textOut && (
                  <div className="mt-1 flex justify-end">
                    <button
                      onClick={() =>
                        onSendToTutor(`Here is my notebook cell output:\n\`\`\`\n${textOut}\n\`\`\``)
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

        {/* Add cell */}
        <div className="flex gap-2">
          <div className="w-14 shrink-0" />
          <button
            onClick={() => addCellAfter(notebook.cells[notebook.cells.length - 1]?.id ?? null)}
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
