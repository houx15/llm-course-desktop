import React from 'react';
import { ClipboardCopy, Loader2, Play, Send, Square, Upload } from 'lucide-react';

export type EditorMode = 'notebook' | 'script';

interface CodeEditorToolbarProps {
  mode: EditorMode;
  isRunning: boolean;
  hasOutput: boolean;
  onRun: () => void;
  onStop: () => void;
  onCopyOutput: () => void;
  onSendToTutor: () => void;
  onOpenJupyter?: () => void;
  onSubmit?: () => void;
  isSubmitting?: boolean;
  submitDone?: boolean;
}

const CodeEditorToolbar: React.FC<CodeEditorToolbarProps> = ({
  mode,
  isRunning,
  hasOutput,
  onRun,
  onStop,
  onCopyOutput,
  onSendToTutor,
  onOpenJupyter,
  onSubmit,
  isSubmitting = false,
  submitDone = false,
}) => {
  return (
    <div className="px-3 py-2 border-b border-gray-200 bg-white flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
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
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        {onSubmit && (
          <button
            onClick={onSubmit}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-40 disabled:cursor-not-allowed"
            title="提交文件到云端"
          >
            {isSubmitting ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {submitDone ? '已提交' : '提交'}
          </button>
        )}
      </div>
    </div>
  );
};

export default CodeEditorToolbar;
