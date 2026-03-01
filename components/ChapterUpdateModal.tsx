import React from 'react';

interface Props {
  onNewSession: () => void;
  onResume: () => void;
}

const ChapterUpdateModal: React.FC<Props> = ({ onNewSession, onResume }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          章节内容已更新
        </h3>
        <p className="text-sm text-gray-600 mb-6">
          该章节内容已更新，是否开启新会话学习新内容？
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onResume}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            继续旧会话
          </button>
          <button
            onClick={onNewSession}
            className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            开启新会话
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChapterUpdateModal;
