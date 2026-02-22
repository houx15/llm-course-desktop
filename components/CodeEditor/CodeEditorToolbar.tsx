import React from 'react';
import { ClipboardCopy, Folder, Loader2, Play, Send, Square, Trash2 } from 'lucide-react';
import { CodeWorkspaceFile } from '../../types';

interface CodeEditorToolbarProps {
  files: CodeWorkspaceFile[];
  activeFile: string;
  isRunning: boolean;
  hasOutput: boolean;
  chapterDir?: string;
  hasIpynb?: boolean;
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
  files,
  activeFile,
  isRunning,
  hasOutput,
  chapterDir,
  hasIpynb,
  onSelectFile,
  onRun,
  onStop,
  onClearOutput,
  onCopyOutput,
  onSendToTutor,
  onOpenFolder,
  onOpenJupyter,
}) => {
  const shortDir = chapterDir ? chapterDir.split('/').slice(-2).join('/') : '';

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

        {hasIpynb && onOpenJupyter && (
          <button
            onClick={onOpenJupyter}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100"
            title="Open workspace in Jupyter Notebook"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
            Jupyter
          </button>
        )}
      </div>

      <div className="flex items-center gap-1">
        {chapterDir && onOpenFolder && (
          <button
            onClick={onOpenFolder}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-800"
            title={chapterDir}
          >
            <Folder size={13} />
            <span className="max-w-[120px] truncate hidden sm:inline">{shortDir}</span>
          </button>
        )}
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
