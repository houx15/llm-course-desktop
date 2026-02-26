import React, { useState } from 'react';
import { X, AlertTriangle, Upload, CheckCircle, Copy } from 'lucide-react';
import {
  getBugReportUrl,
  uploadWorkspaceToPresignedUrl,
  confirmBugReport,
} from '../services/backendClient';

interface BugReportModalProps {
  isOpen: boolean;
  errorMessage: string;
  onClose: () => void;
}

type UploadState = 'idle' | 'collecting' | 'uploading' | 'confirming' | 'done' | 'error';

const BugReportModal: React.FC<BugReportModalProps> = ({ isOpen, errorMessage, onClose }) => {
  const [description, setDescription] = useState('');
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [bugId, setBugId] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setUploadError('');
    setUploadState('collecting');

    try {
      // Step 1: Collect system info + logs from main process
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

      // Step 2: Get presigned URL from backend
      setUploadState('uploading');
      const { bug_id, presigned_url, oss_key, required_headers } = await getBugReportUrl({ fileSizeBytes });

      // Step 3: Upload to OSS
      await uploadWorkspaceToPresignedUrl({
        presignedUrl: presigned_url,
        content: logPayload,
        contentType: 'application/json',
        headers: required_headers,
      });

      // Step 4: Confirm with backend
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

  const handleClose = () => {
    // Reset state
    setDescription('');
    setUploadState('idle');
    setBugId('');
    setUploadError('');
    setCopied(false);
    onClose();
  };

  const isUploading = uploadState === 'collecting' || uploadState === 'uploading' || uploadState === 'confirming';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-[480px] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-red-50">
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} className="text-red-500" />
            <h2 className="text-lg font-bold text-gray-800">运行时错误</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-red-100 rounded-full transition-colors text-gray-500"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Error display */}
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm text-red-700 font-medium">错误信息</p>
            <p className="text-sm text-red-600 mt-1 break-all">{errorMessage || '本地运行时启动失败'}</p>
          </div>

          {uploadState === 'done' ? (
            /* Success state */
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
            /* Form / upload state */
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

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50">
          {uploadState === 'done' ? (
            <button
              onClick={handleClose}
              className="px-5 py-2.5 bg-black text-white font-bold rounded-xl hover:bg-gray-800 transition-colors"
            >
              关闭
            </button>
          ) : (
            <>
              <button
                onClick={handleClose}
                disabled={isUploading}
                className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={isUploading}
                className="flex items-center gap-2 px-5 py-2.5 bg-black text-white font-bold rounded-xl shadow-lg hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BugReportModal;
