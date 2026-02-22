import React from 'react';
import { ClipboardCopy, Loader2, Play, Send, Square } from 'lucide-react';
import { CodeWorkspaceFile } from '../../types';

export type EditorMode = 'notebook' | 'script';

interface CodeEditorToolbarProps {
  mode: EditorMode;
  files: CodeWorkspaceFile[];
  activeFile: string;
  isRunning: boolean;
  hasOutput: boolean;
  chapterDir?: string;
  onModeChange: (mode: EditorMode) => void;
  onSelectFile: (filename: string) => void;
  onRun: () => void;
  onStop: () => void;
  onClearOutput: () => void;
  onCopyOutput: () => void;
  onSendToTutor: () => void;
  onOpenFolder?: () => void;
  onOpenJupyter?: () => void;
}

const CodeEditorToolbar: React.FC<CodeEditorToolbarProps> = ({
  mode,
  files,
  activeFile,
  isRunning,
  hasOutput,
  chapterDir,
  onModeChange,
  onSelectFile,
  onRun,
  onStop,
  onClearOutput,
  onCopyOutput,
  onSendToTutor,
  onOpenFolder,
  onOpenJupyter,
}) => {
  return (
    <div className="px-3 py-2 border-b border-gray-200 bg-white flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {/* Mode toggle */}
        <div className="inline-flex rounded border border-gray-200 text-xs overflow-hidden">
          <button
            onClick={() => onModeChange('notebook')}
            className={`px-2.5 py-1.5 ${
              mode === 'notebook'
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            Notebook
          </button>
          <button
            onClick={() => onModeChange('script')}
            className={`px-2.5 py-1.5 border-l border-gray-200 ${
              mode === 'script'
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            Script
          </button>
        </div>

        {mode === 'script' && (
          <>
            {!isRunning ? (
              <button
                onClick={onRun}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
              >
                <Play size={14} />
                Run
              </button>
            ) : (
              <button
                onClick={onStop}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
              >
                <Square size={14} />
                Stop
              </button>
            )}

            {isRunning && (
              <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                <Loader2 size={12} className="animate-spin" />
                Running
              </span>
            )}
          </>
        )}

        {mode === 'notebook' && onOpenJupyter && (
          <button
            onClick={onOpenJupyter}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100"
            title="Open workspace in Jupyter Notebook (browser)"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            Open in Jupyter
          </button>
        )}
      </div>

      <div className="flex items-center gap-1">
        {mode === 'script' && (
          <>
            <button
              onClick={onCopyOutput}
              disabled={!hasOutput}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ClipboardCopy size={13} />
              Copy
            </button>
            <button
              onClick={onSendToTutor}
              disabled={!hasOutput}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs bg-gray-900 text-white hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send size={13} />
              Send
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default CodeEditorToolbar;
