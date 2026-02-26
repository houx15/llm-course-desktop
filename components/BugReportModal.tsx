import React, { useState } from 'react';
import { AlertTriangle, Upload, CheckCircle, Copy, RefreshCw, Settings, LogOut } from 'lucide-react';
import {
  getBugReportUrl,
  uploadWorkspaceToPresignedUrl,
  confirmBugReport,
} from '../services/backendClient';

interface BugReportModalProps {
  isOpen: boolean;
  errorMessage: string;
  onRetry: () => void;
  onOpenSettings?: () => void;
  onLogout?: () => void;
}

type UploadState = 'idle' | 'collecting' | 'uploading' | 'confirming' | 'done' | 'error';

const BugReportModal: React.FC<BugReportModalProps> = ({
  isOpen,
  errorMessage,
  onRetry,
  onOpenSettings,
  onLogout,
}) => {
  const [description, setDescription] = useState('');
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [bugId, setBugId] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [copied, setCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setUploadError('');
    setUploadState('collecting');

    try {
      const report = await window.tutorApp!.collectBugReport();

      const logPayload = JSON.stringify({
        timestamp: new Date().toISOString(),
        description,
        errorMessage,
        appVersion: report.appVersion,
        platform: report.platform,
        arch: report.arch,
        electronVersion: report.electronVersion,
        nodeVersion: report.nodeVersion,
        sidecarStderr: report.sidecarStderr,
        sidecarLogContent: report.sidecarLogContent,
      });

      const fileSizeBytes = new Blob([logPayload]).size;

      setUploadState('uploading');
      const { bug_id, presigned_url, oss_key, required_headers } = await getBugReportUrl({ fileSizeBytes });

      await uploadWorkspaceToPresignedUrl({
        presignedUrl: presigned_url,
        content: logPayload,
        contentType: 'application/json',
        headers: required_headers,
      });

      setUploadState('confirming');
      await confirmBugReport({
        bugId: bug_id,
        ossKey: oss_key,
        fileSizeBytes,
        appVersion: report.appVersion,
        platform: `${report.platform}-${report.arch}`,
        description: description || errorMessage,
        metadata: {
          electronVersion: report.electronVersion,
          nodeVersion: report.nodeVersion,
        },
      });

      setBugId(bug_id);
      setUploadState('done');
    } catch (err) {
      console.error('Bug report upload failed:', err);
      setUploadError(err instanceof Error ? err.message : '上传失败，请稍后重试');
      setUploadState('error');
    }
  };

  const handleCopyBugId = () => {
    navigator.clipboard.writeText(bugId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  const isUploading = uploadState === 'collecting' || uploadState === 'uploading' || uploadState === 'confirming';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-[520px] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header - no close button, this is blocking */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2 bg-red-50">
          <AlertTriangle size={20} className="text-red-500" />
          <h2 className="text-lg font-bold text-gray-800">运行时启动失败</h2>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Error display */}
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm text-red-700 font-medium">错误信息</p>
            <p className="text-sm text-red-600 mt-1 break-all">{errorMessage || '本地运行时启动失败'}</p>
          </div>

          <p className="text-sm text-gray-600">
            本地 AI 助教运行时未能启动，学习功能暂时不可用。您可以尝试重新启动，或上传错误日志给技术支持。
          </p>

          {uploadState === 'done' ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle size={20} className="text-green-500" />
                <p className="text-sm font-medium text-green-700">错误报告已上传</p>
              </div>
              <div className="flex items-center justify-between bg-white rounded-lg px-4 py-3 border border-green-200">
                <div>
                  <p className="text-xs text-gray-500">报告编号</p>
                  <p className="text-lg font-mono font-bold text-gray-900">{bugId}</p>
                </div>
                <button
                  onClick={handleCopyBugId}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                >
                  <Copy size={14} />
                  {copied ? '已复制' : '复制'}
                </button>
              </div>
              <p className="text-xs text-gray-500">
                请将此编号发送给技术支持以便排查问题。
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase">问题描述（可选）</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="请描述您遇到的问题..."
                  rows={3}
                  disabled={isUploading}
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none disabled:opacity-50"
                />
              </div>

              <p className="text-xs text-gray-400">
                上传将包含：应用版本、系统信息、运行日志。不包含您的个人数据或API密钥。
              </p>

              {uploadError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                  <p className="text-sm text-red-600">{uploadError}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer - primary actions */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 space-y-3">
          {/* Primary row: retry + upload */}
          <div className="flex gap-3">
            <button
              onClick={handleRetry}
              disabled={retrying || isUploading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-black text-white font-bold rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {retrying ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  重新启动中...
                </>
              ) : (
                <>
                  <RefreshCw size={16} />
                  重新启动
                </>
              )}
            </button>

            {uploadState !== 'done' && (
              <button
                onClick={handleSubmit}
                disabled={isUploading || retrying}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {uploadState === 'collecting' ? '收集日志...' : uploadState === 'uploading' ? '上传中...' : '确认中...'}
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    上传错误报告
                  </>
                )}
              </button>
            )}
          </div>

          {/* Secondary row: settings + logout */}
          <div className="flex justify-center gap-6">
            {onOpenSettings && (
              <button
                onClick={onOpenSettings}
                disabled={retrying || isUploading}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
              >
                <Settings size={14} />
                设置
              </button>
            )}
            {onLogout && (
              <button
                onClick={onLogout}
                disabled={retrying || isUploading}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
              >
                <LogOut size={14} />
                退出登录
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BugReportModal;
