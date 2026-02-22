import React, { useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle, RefreshCw, CheckCircle2, RotateCcw } from 'lucide-react';

export interface SidecarDownloadState {
  phase:
    | 'checking'
    | 'downloading_conda'
    | 'installing_conda'
    | 'creating_env'
    | 'downloading_sidecar'
    | 'installing_deps'
    | 'done'
    | 'error';
  percent: number;
  bytesDownloaded?: number;
  totalBytes?: number;
  status: string;
}

interface SidecarDownloadProgressProps {
  onRetry: () => void;
  onNeedsRestart?: () => void;
}

// Only conda installation and env creation require a full app restart
// (PATH changes need a fresh process). Sidecar download/deps do not.
const RESTART_REQUIRED_PHASES = new Set([
  'downloading_conda',
  'installing_conda',
  'creating_env',
]);

const STORAGE_KEY = 'knoweia_sidecar_setup_done';

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const phaseLabel: Record<string, string> = {
  checking:            '正在检查运行环境...',
  downloading_conda:   '正在下载 Python 环境 (Miniconda)...',
  installing_conda:    '正在安装 Python 环境...',
  creating_env:        '正在创建运行环境...',
  downloading_sidecar: '正在下载学习引擎...',
  installing_deps:     '正在安装依赖包...',
  done:                '准备就绪',
  error:               '出现错误',
};

const SidecarDownloadProgress: React.FC<SidecarDownloadProgressProps> = ({ onRetry, onNeedsRestart }) => {
  const [state, setState] = useState<SidecarDownloadState>({
    phase: 'checking',
    percent: 0,
    status: '正在检查学习引擎...',
  });
  const [showRestart, setShowRestart] = useState(false);

  // True only on the very first run before any successful sidecar setup.
  const [isFirstLaunch] = useState(() => !localStorage.getItem(STORAGE_KEY));

  // Ref so the progress callback always sees the latest value without stale closure.
  const hadHeavyInstallRef = useRef(false);

  useEffect(() => {
    if (!window.tutorApp?.onSidecarDownloadProgress) return;

    const unsubscribe = window.tutorApp.onSidecarDownloadProgress((payload) => {
      setState(payload);

      if (RESTART_REQUIRED_PHASES.has(payload.phase)) {
        hadHeavyInstallRef.current = true;
      }

      if (payload.phase === 'done') {
        localStorage.setItem(STORAGE_KEY, '1');
        if (hadHeavyInstallRef.current) {
          // Fresh conda/python was just installed — a restart is needed.
          setShowRestart(true);
          onNeedsRestart?.();
        }
      }
    });

    return unsubscribe;
  }, [onNeedsRestart]);

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
        {isDone && !showRestart && (
          <div className="w-12 h-12 flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
          </div>
        )}
        {(isError || showRestart) && (
          <div className="w-12 h-12 flex items-center justify-center">
            {showRestart
              ? <RotateCcw className="w-10 h-10 text-blue-500" />
              : <AlertCircle className="w-10 h-10 text-red-500" />}
          </div>
        )}

        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            {showRestart
              ? '环境已就绪，需要重启'
              : isError
                ? '下载失败'
                : isDone
                  ? '准备就绪'
                  : `正在设置 Knoweia${isFirstLaunch ? ' (首次约需15分钟)' : ''}...`}
          </h2>
          <p className="text-sm text-gray-500">
            {showRestart
              ? 'Python 环境已安装完成，请重启应用以完成初始化。'
              : phaseLabel[state.phase] || state.status}
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
                {(state.phase === 'downloading_conda' || state.phase === 'downloading_sidecar') && state.bytesDownloaded && state.totalBytes
                  ? `${formatBytes(state.bytesDownloaded)} / ${formatBytes(state.totalBytes)}`
                  : state.status}
              </span>
              <span>{state.percent}%</span>
            </div>
          </div>
        )}

        {showRestart && (
          <button
            onClick={() => window.tutorApp?.relaunchApp()}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
          >
            <RotateCcw size={14} />
            重启应用
          </button>
        )}

        {isError && !showRestart && (
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
