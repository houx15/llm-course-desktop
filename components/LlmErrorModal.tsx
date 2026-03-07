import React, { useState } from 'react';
import { AlertTriangle, Upload, CheckCircle, Copy, X, Settings } from 'lucide-react';
import {
  getBugReportUrl,
  uploadWorkspaceToPresignedUrl,
  confirmBugReport,
} from '../services/backendClient';

interface LlmErrorModalProps {
  isOpen: boolean;
  errorMessage: string;
  onDismiss: () => void;
  onOpenSettings?: () => void;
}

type UploadState = 'idle' | 'collecting' | 'uploading' | 'confirming' | 'done' | 'error';

const LlmErrorModal: React.FC<LlmErrorModalProps> = ({
  isOpen,
  errorMessage,
  onDismiss,
  onOpenSettings,
}) => {
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [bugId, setBugId] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setUploadError('');
    setUploadState('collecting');

    try {
      const report = await window.tutorApp!.collectBugReport();

      const logPayload = JSON.stringify({
        timestamp: new Date().toISOString(),
        description: `LLM error: ${errorMessage}`,
        errorMessage,
        errorType: 'llm_error',
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
        description: `LLM error: ${errorMessage}`,
        metadata: {
          errorType: 'llm_error',
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

  const handleDismiss = () => {
    setUploadState('idle');
    setBugId('');
    setUploadError('');
    onDismiss();
  };

  const isUploading = uploadState === 'collecting' || uploadState === 'uploading' || uploadState === 'confirming';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-[480px] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-amber-50">
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} className="text-amber-500" />
            <h2 className="text-lg font-bold text-gray-800">大模型连接异常</h2>
          </div>
          <button
            onClick={handleDismiss}
            disabled={isUploading}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto">
          <p className="text-sm text-gray-600">
            你的大模型似乎遇到了一些问题，请检查你的 API Key 和网络连接。
          </p>

          {/* Error display */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-sm text-amber-700 font-medium">报错信息</p>
            <p className="text-sm text-amber-800 mt-1 break-all font-mono">{errorMessage}</p>
          </div>

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
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-sm text-gray-600">
                如果你无法解决这个问题，可以上传报错信息请求后台帮助。
              </p>
              <p className="text-xs text-gray-400 mt-2">
                上传将包含：应用版本、系统信息、运行日志。不包含您的 API 密钥。
              </p>
            </div>
          )}

          {uploadError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              <p className="text-sm text-red-600">{uploadError}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 space-y-3">
          <div className="flex gap-3">
            <button
              onClick={handleDismiss}
              disabled={isUploading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-black text-white font-bold rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              我知道了
            </button>

            {uploadState !== 'done' && (
              <button
                onClick={handleSubmit}
                disabled={isUploading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

          {onOpenSettings && (
            <div className="flex justify-center">
              <button
                onClick={onOpenSettings}
                disabled={isUploading}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
              >
                <Settings size={14} />
                检查 API Key 设置
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LlmErrorModal;
