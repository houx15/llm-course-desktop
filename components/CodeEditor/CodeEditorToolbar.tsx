import React from 'react';
import { ClipboardCopy, Loader2, Play, Send, Square, Trash2 } from 'lucide-react';
import { CodeWorkspaceFile } from '../../types';

interface CodeEditorToolbarProps {
  files: CodeWorkspaceFile[];
  activeFile: string;
  isRunning: boolean;
  hasOutput: boolean;
  onSelectFile: (filename: string) => void;
  onRun: () => void;
  onStop: () => void;
  onClearOutput: () => void;
  onCopyOutput: () => void;
  onSendToTutor: () => void;
}

const CodeEditorToolbar: React.FC<CodeEditorToolbarProps> = ({
  files,
  activeFile,
  isRunning,
  hasOutput,
  onSelectFile,
  onRun,
  onStop,
  onClearOutput,
  onCopyOutput,
  onSendToTutor,
}) => {
  return (
    <div className="px-3 py-2 border-b border-gray-200 bg-white flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <select
          value={activeFile}
          onChange={(e) => onSelectFile(e.target.value)}
          className="max-w-[220px] min-w-[120px] text-xs border border-gray-200 rounded px-2 py-1.5 bg-white"
        >
          {files.map((file) => (
            <option key={file.name} value={file.name}>
              {file.name}
            </option>
          ))}
        </select>

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
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={onClearOutput}
          disabled={!hasOutput}
          className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 size={13} />
          Clear
        </button>
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
      </div>
    </div>
  );
};

export default CodeEditorToolbar;
