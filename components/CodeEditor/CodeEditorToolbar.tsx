import React from 'react';
import { Loader2, Play, Square, UploadCloud } from 'lucide-react';

export type EditorMode = 'notebook' | 'script';
export type EditorLayout = 'right' | 'bottom' | 'left' | 'top';

interface CodeEditorToolbarProps {
  mode: EditorMode;
  isRunning: boolean;
  onRun: () => void;
  onStop: () => void;
  onOpenJupyter?: () => void;
  onSubmit?: () => void;
  layout?: EditorLayout;
  onLayoutChange?: (layout: EditorLayout) => void;
  isSubmitting?: boolean;
  submitDone?: boolean;
  submitProgress?: string;
}

const LAYOUT_OPTIONS: { value: EditorLayout; label: string; icon: React.ReactNode }[] = [
  {
    value: 'right',
    label: '编辑器在右',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
        <rect x="1" y="1" width="12" height="12" rx="1" />
        <line x1="7" y1="1" x2="7" y2="13" />
      </svg>
    ),
  },
  {
    value: 'bottom',
    label: '编辑器在下',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
        <rect x="1" y="1" width="12" height="12" rx="1" />
        <line x1="1" y1="7" x2="13" y2="7" />
      </svg>
    ),
  },
  {
    value: 'left',
    label: '编辑器在左',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
        <rect x="1" y="1" width="12" height="12" rx="1" />
        <line x1="7" y1="1" x2="7" y2="13" />
        <rect x="1.5" y="1.5" width="5" height="11" rx="0.5" fill="currentColor" fillOpacity="0.15" stroke="none" />
      </svg>
    ),
  },
  {
    value: 'top',
    label: '编辑器在上',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
        <rect x="1" y="1" width="12" height="12" rx="1" />
        <line x1="1" y1="7" x2="13" y2="7" />
        <rect x="1.5" y="1.5" width="11" height="5" rx="0.5" fill="currentColor" fillOpacity="0.15" stroke="none" />
      </svg>
    ),
  },
];

const CodeEditorToolbar: React.FC<CodeEditorToolbarProps> = ({
  mode,
  isRunning,
  onRun,
  onStop,
  onOpenJupyter,
  onSubmit,
  layout,
  onLayoutChange,
  isSubmitting = false,
  submitDone = false,
  submitProgress,
}) => {
  return (
    <div className="px-3 py-2 border-b border-gray-200 bg-white flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
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

        {onSubmit && (
          <button
            onClick={onSubmit}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed"
            title="仅同步 .py 和 .ipynb 文件"
          >
            {isSubmitting ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />}
            {submitDone ? '已同步' : submitProgress || '同步到云端'}
          </button>
        )}

        {layout && onLayoutChange && (
          <div className="flex items-center border border-gray-200 rounded overflow-hidden">
            {LAYOUT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onLayoutChange(opt.value)}
                className={`p-1.5 transition-colors ${
                  layout === opt.value
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-50 text-gray-400 hover:text-gray-700 hover:bg-gray-100'
                }`}
                title={opt.label}
              >
                {opt.icon}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {mode === 'script' && (
          <>
            {isRunning && (
              <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                <Loader2 size={12} className="animate-spin" />
                Running
              </span>
            )}
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
          </>
        )}
      </div>
    </div>
  );
};

export default CodeEditorToolbar;
