import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface TerminalPanelProps {
  chapterId: string;
  /** Whether this panel is currently the active/visible tab */
  visible: boolean;
}

/**
 * Integrated terminal using node-pty (Electron main) + xterm.js (renderer).
 * Lazily spawns a PTY when the terminal tab is first opened for a chapter.
 * The terminal persists across tab switches but is killed on chapter change.
 */
const TerminalPanel: React.FC<TerminalPanelProps> = ({ chapterId, visible }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const offDataRef = useRef<(() => void) | null>(null);
  const offExitRef = useRef<(() => void) | null>(null);
  const spawnedChapterRef = useRef('');

  // Tracks which chapterId has an active PTY.
  // Immediately set to chapterId so the terminal auto-starts on chapter change.
  const [activeChapter, setActiveChapter] = useState(chapterId);
  const [error, setError] = useState('');

  // Auto-activate when chapter changes — kills old PTY, starts new one
  useEffect(() => {
    setActiveChapter(chapterId);
  }, [chapterId]);

  // Create terminal + PTY when activeChapter is set
  useEffect(() => {
    if (!activeChapter || !containerRef.current || !window.tutorApp) return;

    setError('');

    const term = new Terminal({
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 12,
      lineHeight: 1.3,
      theme: {
        background: '#101114',
        foreground: '#e5e7eb',
        cursor: '#e5e7eb',
        selectionBackground: '#3b82f680',
      },
      cursorBlink: true,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Relay user keystrokes to PTY
    const inputDisposable = term.onData((data) => {
      console.log(`[TERM INPUT] chapterId=${activeChapter} data=${JSON.stringify(data).slice(0, 60)}`);
      window.tutorApp?.writeTerminal({ chapterId: activeChapter, data });
    });

    // Receive PTY output
    offDataRef.current = window.tutorApp.onTerminalData((payload) => {
      if (payload.chapterId !== activeChapter) return;
      term.write(payload.data);
    });

    offExitRef.current = window.tutorApp.onTerminalExit((payload) => {
      if (payload.chapterId !== activeChapter) return;
      const code = payload.exitCode ?? '?';
      const sig = payload.signal != null ? `, signal=${payload.signal}` : '';
      term.write(`\r\n[Process exited: code=${code}${sig}]\r\n`);
      spawnedChapterRef.current = '';
    });

    // Fit after DOM settles
    setTimeout(() => {
      try { fitAddon.fit(); } catch {}
      console.log(`[TERM FIT] cols=${term.cols} rows=${term.rows}`);
    }, 80);

    // Spawn PTY. Use a cancelled flag to handle React StrictMode double-mount:
    // if the effect is cleaned up before spawnTerminal resolves, don't update refs.
    let cancelled = false;
    const cols = term.cols || 80;
    const rows = term.rows || 24;
    console.log(`[TERM SPAWN] chapterId=${activeChapter} cols=${cols} rows=${rows}`);
    window.tutorApp.spawnTerminal({ chapterId: activeChapter, cols, rows })
      .then(() => {
        if (!cancelled) spawnedChapterRef.current = activeChapter;
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message || 'Failed to spawn terminal');
        term.write(`\r\n[Error: ${err.message}]\r\n`);
      });

    return () => {
      cancelled = true;
      inputDisposable.dispose();
      offDataRef.current?.();
      offExitRef.current?.();
      offDataRef.current = null;
      offExitRef.current = null;
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      if (spawnedChapterRef.current) {
        window.tutorApp?.killTerminal({ chapterId: spawnedChapterRef.current }).catch(() => {});
        spawnedChapterRef.current = '';
      }
    };
  }, [activeChapter]);

  // Re-fit when tab becomes visible or container resizes
  useEffect(() => {
    if (!visible || !fitAddonRef.current) return;

    const handleResize = () => {
      try {
        fitAddonRef.current?.fit();
        const term = termRef.current;
        if (term && activeChapter) {
          window.tutorApp?.resizeTerminal({ chapterId: activeChapter, cols: term.cols, rows: term.rows });
        }
      } catch {}
    };

    const timer = setTimeout(handleResize, 60);
    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) observer.observe(containerRef.current);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [visible, activeChapter]);

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#101114]">
      {error && (
        <div className="px-3 py-1 text-xs text-red-400 bg-red-900/30">{error}</div>
      )}
      <div
        ref={containerRef}
        className="flex-1 min-h-0"
        style={{ padding: '4px 0 0 8px' }}
      />
    </div>
  );
};

export default TerminalPanel;
