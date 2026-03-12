import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, FilePlus, FolderOpen, RefreshCw, Trash2, PanelLeftClose, Folder } from 'lucide-react';
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
  if (lower.endsWith('.yaml') || lower.endsWith('.yml'))
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400 shrink-0">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    );
  if (lower.endsWith('.json'))
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-500 shrink-0">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
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

// ─── Tree data structure ──────────────────────────────────────────────────────

interface TreeNode {
  name: string;       // display name (just the segment, e.g. "data" or "file.py")
  fullPath: string;   // full relative path (e.g. "data/file.py")
  isDir: boolean;
  children: TreeNode[];
  file?: CodeWorkspaceFile; // only for files
}

/** Build a tree from flat file list with paths like "data/file.csv" */
const buildFileTree = (files: CodeWorkspaceFile[]): TreeNode[] => {
  const root: TreeNode = { name: '', fullPath: '', isDir: true, children: [] };

  for (const file of files) {
    const parts = file.name.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const partPath = parts.slice(0, i + 1).join('/');

      if (isLast) {
        // File node
        current.children.push({
          name: part,
          fullPath: file.name,
          isDir: false,
          children: [],
          file,
        });
      } else {
        // Directory node — find or create
        let dir = current.children.find((c) => c.isDir && c.name === part);
        if (!dir) {
          dir = { name: part, fullPath: partPath, isDir: true, children: [] };
          current.children.push(dir);
        }
        current = dir;
      }
    }
  }

  // Sort: directories first, then alphabetically
  const sortChildren = (node: TreeNode) => {
    node.children.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    node.children.forEach(sortChildren);
  };
  sortChildren(root);

  return root.children;
};

// ─── Tree node component ──────────────────────────────────────────────────────

const TreeFileNode: React.FC<{
  node: TreeNode;
  depth: number;
  activeFile: string;
  deletingFile: string | null;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
  onSelectFile: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, filename: string) => void;
}> = ({ node, depth, activeFile, deletingFile, expandedDirs, onToggleDir, onSelectFile, onContextMenu }) => {
  const paddingLeft = 12 + depth * 14;

  if (node.isDir) {
    const isExpanded = expandedDirs.has(node.fullPath);
    return (
      <>
        <button
          onClick={() => onToggleDir(node.fullPath)}
          className="flex items-center gap-1 w-full text-left py-0.5 hover:bg-gray-100 group/dir"
          style={{ paddingLeft }}
        >
          {isExpanded
            ? <ChevronDown size={10} className="text-gray-400 shrink-0" />
            : <ChevronRight size={10} className="text-gray-400 shrink-0" />
          }
          <Folder size={12} className="text-yellow-500 shrink-0" fill="currentColor" />
          <span className="text-[11px] text-gray-600 truncate font-medium">{node.name}</span>
        </button>
        {isExpanded && node.children.map((child) => (
          <TreeFileNode
            key={child.fullPath}
            node={child}
            depth={depth + 1}
            activeFile={activeFile}
            deletingFile={deletingFile}
            expandedDirs={expandedDirs}
            onToggleDir={onToggleDir}
            onSelectFile={onSelectFile}
            onContextMenu={onContextMenu}
          />
        ))}
      </>
    );
  }

  // File node
  const isActive = node.fullPath === activeFile;
  const isDeleting = node.fullPath === deletingFile;
  return (
    <button
      onClick={() => onSelectFile(node.fullPath)}
      onContextMenu={(e) => onContextMenu(e, node.fullPath)}
      disabled={isDeleting}
      className={`flex items-center gap-1.5 w-full text-left py-0.5 pr-1 group/file ${
        isActive
          ? 'bg-blue-50 text-blue-700'
          : 'text-gray-700 hover:bg-gray-100'
      } disabled:opacity-40`}
      style={{ paddingLeft: paddingLeft + 14 }}
    >
      <FileIcon name={node.name} size={12} />
      <span className="flex-1 text-[11px] truncate" title={node.fullPath}>
        {node.name}
      </span>
    </button>
  );
};

// ─── Delete confirmation modal ────────────────────────────────────────────────

const DeleteConfirmModal: React.FC<{
  filename: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ filename, onConfirm, onCancel }) => {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-full bg-red-50">
            <AlertTriangle size={18} className="text-red-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">删除文件</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              将会在本地和云端删除文件 <span className="font-mono font-semibold text-gray-800">{filename}</span>，无法恢复。
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-xs rounded-lg bg-red-600 text-white hover:bg-red-700"
          >
            确认删除
          </button>
        </div>
      </div>
    </div>
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
  onHide?: () => void;
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
  onHide,
}) => {
  const [rootExpanded, setRootExpanded] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; filename: string } | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const newNameRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Build tree from flat file list
  const tree = useMemo(() => buildFileTree(files), [files]);

  // Auto-expand directories that contain the active file
  useEffect(() => {
    if (!activeFile || !activeFile.includes('/')) return;
    const parts = activeFile.split('/');
    const dirsToExpand: string[] = [];
    for (let i = 1; i < parts.length; i++) {
      dirsToExpand.push(parts.slice(0, i).join('/'));
    }
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const d of dirsToExpand) {
        if (!next.has(d)) { next.add(d); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [activeFile]);

  useEffect(() => {
    if (creating) {
      setTimeout(() => newNameRef.current?.focus(), 50);
    }
  }, [creating]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [contextMenu]);

  const handleStartCreate = () => {
    setNewName('');
    setCreating(true);
    setRootExpanded(true);
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

  const handleContextMenu = useCallback((e: React.MouseEvent, filename: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, filename });
  }, []);

  const handleDeleteFromContextMenu = () => {
    if (!contextMenu) return;
    setDeleteTarget(contextMenu.filename);
    setContextMenu(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !onDeleteFile) return;
    const filename = deleteTarget;
    setDeleteTarget(null);
    setDeletingFile(filename);
    try {
      await onDeleteFile(filename);
    } finally {
      setDeletingFile(null);
    }
  };

  const handleToggleDir = useCallback((dirPath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  }, []);

  const shortDir = chapterDir ? chapterDir.split('/').slice(-2).join('/') : '';

  return (
    <>
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
            {onHide && (
              <button
                onClick={onHide}
                title="隐藏文件列表"
                className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200"
              >
                <PanelLeftClose size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Workspace folder row */}
        {chapterDir && (
          <button
            onClick={() => setRootExpanded((v) => !v)}
            className="flex items-center gap-1 px-2 py-1 w-full text-left hover:bg-gray-100 group"
          >
            {rootExpanded ? <ChevronDown size={11} className="text-gray-400 shrink-0" /> : <ChevronRight size={11} className="text-gray-400 shrink-0" />}
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

        {/* File tree */}
        {rootExpanded && (
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

            {tree.map((node) => (
              <TreeFileNode
                key={node.fullPath}
                node={node}
                depth={0}
                activeFile={activeFile}
                deletingFile={deletingFile}
                expandedDirs={expandedDirs}
                onToggleDir={handleToggleDir}
                onSelectFile={onSelectFile}
                onContextMenu={handleContextMenu}
              />
            ))}

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

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-[150] bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[120px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {onDeleteFile && (
            <button
              onClick={handleDeleteFromContextMenu}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
            >
              <Trash2 size={12} />
              删除
            </button>
          )}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          filename={deleteTarget}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
};

export default WorkspaceFileSidebar;
