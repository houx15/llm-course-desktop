import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, FilePlus, FolderOpen, RefreshCw, Trash2 } from 'lucide-react';
import { CodeWorkspaceFile } from '../../types';

// ─── File icon ────────────────────────────────────────────────────────────────

const FileIcon: React.FC<{ name: string; size?: number }> = ({ name, size = 13 }) => {
  const lower = name.toLowerCase();
  if (lower.endsWith('.ipynb'))
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-orange-500 shrink-0">
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <line x1="8" y1="8" x2="16" y2="8" />
        <line x1="8" y1="12" x2="16" y2="12" />
        <line x1="8" y1="16" x2="12" y2="16" />
      </svg>
    );
  if (lower.endsWith('.py'))
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500 shrink-0">
        <path d="M12 2C8.5 2 8 3.5 8 5v2h8V5c0-1.5-.5-3-4-3z" />
        <path d="M8 7H5c-1.5 0-3 .5-3 4v2c0 3.5 1.5 4 3 4h3" />
        <path d="M16 7h3c1.5 0 3 .5 3 4v2c0 3.5-1.5 4-3 4h-3" />
        <path d="M12 22c3.5 0 4-1.5 4-3v-2H8v2c0 1.5.5 3 4 3z" />
        <circle cx="10" cy="5" r="1" fill="currentColor" stroke="none" />
        <circle cx="14" cy="19" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  if (lower.endsWith('.csv'))
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500 shrink-0">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="16" y2="17" />
      </svg>
    );
  // default: generic file
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 shrink-0">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  files: CodeWorkspaceFile[];
  activeFile: string;
  chapterDir?: string;
  onSelectFile: (filename: string) => void;
  onNewFile: (filename: string) => Promise<void>;
  onDeleteFile?: (filename: string) => Promise<void>;
  onOpenFolder?: () => void;
  onRefresh?: () => void;
}

const WorkspaceFileSidebar: React.FC<Props> = ({
  files,
  activeFile,
  chapterDir,
  onSelectFile,
  onNewFile,
  onDeleteFile,
  onOpenFolder,
  onRefresh,
}) => {
  const [expanded, setExpanded] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [hoveredFile, setHoveredFile] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const newNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) {
      setTimeout(() => newNameRef.current?.focus(), 50);
    }
  }, [creating]);

  const handleStartCreate = () => {
    setNewName('');
    setCreating(true);
    setExpanded(true);
  };

  const handleConfirmCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) { setCreating(false); return; }
    // Default to .py if no extension
    const filename = trimmed.includes('.') ? trimmed : `${trimmed}.py`;
    setCreating(false);
    setNewName('');
    await onNewFile(filename);
  };

  const handleNewKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirmCreate();
    if (e.key === 'Escape') { setCreating(false); setNewName(''); }
  };

  const handleDeleteClick = async (e: React.MouseEvent, filename: string) => {
    e.stopPropagation();
    if (!onDeleteFile) return;
    if (!window.confirm(`Delete "${filename}"?`)) return;
    setDeletingFile(filename);
    try { await onDeleteFile(filename); }
    finally { setDeletingFile(null); }
  };

  const shortDir = chapterDir ? chapterDir.split('/').slice(-2).join('/') : '';

  return (
    <div className="flex flex-col h-full bg-gray-50 border-r border-gray-200 select-none" style={{ width: 168 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-200">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Files</span>
        <div className="flex items-center gap-0.5">
          {onRefresh && (
            <button
              onClick={onRefresh}
              title="Refresh"
              className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200"
            >
              <RefreshCw size={11} />
            </button>
          )}
          <button
            onClick={handleStartCreate}
            title="New file"
            className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200"
          >
            <FilePlus size={12} />
          </button>
        </div>
      </div>

      {/* Workspace folder row */}
      {chapterDir && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 px-2 py-1 w-full text-left hover:bg-gray-100 group"
        >
          {expanded ? <ChevronDown size={11} className="text-gray-400 shrink-0" /> : <ChevronRight size={11} className="text-gray-400 shrink-0" />}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-yellow-500 shrink-0">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span className="text-[11px] text-gray-600 truncate font-medium" title={chapterDir}>
            {shortDir || 'workspace'}
          </span>
          {onOpenFolder && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenFolder(); }}
              title="Open in Finder"
              className="ml-auto p-0.5 rounded text-gray-300 hover:text-gray-600 opacity-0 group-hover:opacity-100"
            >
              <FolderOpen size={11} />
            </button>
          )}
        </button>
      )}

      {/* File list */}
      {expanded && (
        <div className="flex-1 overflow-y-auto">
          {/* New file input */}
          {creating && (
            <div className="flex items-center gap-1 pl-5 pr-2 py-0.5">
              <FileIcon name={newName || 'file.py'} size={12} />
              <input
                ref={newNameRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={handleNewKeyDown}
                onBlur={handleConfirmCreate}
                placeholder="filename.py"
                className="flex-1 text-[11px] bg-white border border-blue-400 rounded px-1 py-0.5 outline-none min-w-0"
              />
            </div>
          )}

          {files.map((file) => {
            const isActive = file.name === activeFile;
            const isDeleting = file.name === deletingFile;
            return (
              <button
                key={file.name}
                onClick={() => onSelectFile(file.name)}
                onMouseEnter={() => setHoveredFile(file.name)}
                onMouseLeave={() => setHoveredFile(null)}
                disabled={isDeleting}
                className={`flex items-center gap-1.5 w-full text-left pl-5 pr-1 py-0.5 group/file ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-100'
                } disabled:opacity-40`}
              >
                <FileIcon name={file.name} size={12} />
                <span className="flex-1 text-[11px] truncate" title={file.name}>
                  {file.name}
                </span>
                {onDeleteFile && hoveredFile === file.name && !isActive && (
                  <button
                    onClick={(e) => handleDeleteClick(e, file.name)}
                    title="Delete file"
                    className="p-0.5 rounded text-gray-300 hover:text-red-500 opacity-0 group-hover/file:opacity-100"
                  >
                    <Trash2 size={10} />
                  </button>
                )}
              </button>
            );
          })}

          {files.length === 0 && !creating && (
            <div className="px-3 py-2 text-[10px] text-gray-400 italic">
              No files yet.{' '}
              <button onClick={handleStartCreate} className="underline text-blue-400 hover:text-blue-600">
                Create one
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WorkspaceFileSidebar;
