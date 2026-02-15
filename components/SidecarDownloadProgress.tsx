import React, { useEffect, useState } from 'react';
import { Loader2, AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';

export interface SidecarDownloadState {
  phase: 'checking' | 'downloading' | 'installing' | 'done' | 'error';
  percent: number;
  bytesDownloaded?: number;
  totalBytes?: number;
  status: string;
}

interface SidecarDownloadProgressProps {
  onRetry: () => void;
}

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const phaseLabel: Record<string, string> = {
  checking: '正在检查学习引擎...',
  downloading: '正在下载学习引擎...',
  installing: '正在安装...',
  done: '准备就绪',
  error: '出现错误',
};

const SidecarDownloadProgress: React.FC<SidecarDownloadProgressProps> = ({ onRetry }) => {
  const [state, setState] = useState<SidecarDownloadState>({
    phase: 'checking',
    percent: 0,
    status: '正在检查学习引擎...',
  });

  useEffect(() => {
    if (!window.tutorApp?.onSidecarDownloadProgress) return;

    const unsubscribe = window.tutorApp.onSidecarDownloadProgress((payload) => {
      setState(payload);
    });

    return unsubscribe;
  }, []);

  // No auto-dismiss on 'done' — parent controls overlay lifetime so it stays
  // visible until runtime start/health-check completes.

  const isError = state.phase === 'error';
  const isDone = state.phase === 'done';
  const isActive = !isError && !isDone;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[420px] p-8 flex flex-col items-center gap-6">
        {isActive && (
          <div className="w-12 h-12 flex items-center justify-center">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          </div>
        )}
        {isDone && (
          <div className="w-12 h-12 flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
          </div>
        )}
        {isError && (
          <div className="w-12 h-12 flex items-center justify-center">
            <AlertCircle className="w-10 h-10 text-red-500" />
          </div>
        )}

        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            {isError ? '下载失败' : isDone ? '准备就绪' : '正在设置 Knoweia...'}
          </h2>
          <p className="text-sm text-gray-500">
            {phaseLabel[state.phase] || state.status}
          </p>
        </div>

        {isActive && (
          <div className="w-full">
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.max(2, state.percent)}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-400">
              <span>
                {state.phase === 'downloading' && state.bytesDownloaded && state.totalBytes
                  ? `${formatBytes(state.bytesDownloaded)} / ${formatBytes(state.totalBytes)}`
                  : state.status}
              </span>
              <span>{state.percent}%</span>
            </div>
          </div>
        )}

        {isError && (
          <div className="w-full flex flex-col items-center gap-3">
            <p className="text-sm text-red-600 text-center">{state.status}</p>
            <button
              onClick={onRetry}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <RefreshCw size={14} />
              重试
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SidecarDownloadProgress;
