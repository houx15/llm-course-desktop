import React, { useState } from 'react';
import { SkipReason } from '../types';

interface SkipReasonModalProps {
  isOpen: boolean;
  onConfirm: (reason: SkipReason, reasonText?: string) => void;
  onCancel: () => void;
}

const REASONS: { value: SkipReason; label: string }[] = [
  { value: '已掌握', label: '已掌握此内容' },
  { value: '不感兴趣', label: '不感兴趣' },
  { value: '太难了', label: '太难了' },
  { value: '太啰嗦', label: '太啰嗦' },
  { value: '其他', label: '其他' },
];

const SkipReasonModal: React.FC<SkipReasonModalProps> = ({ isOpen, onConfirm, onCancel }) => {
  const [selected, setSelected] = useState<SkipReason | null>(null);
  const [otherText, setOtherText] = useState('');

  if (!isOpen) return null;

  const canConfirm = selected !== null && (selected !== '其他' || otherText.trim().length > 0);

  const handleConfirm = () => {
    if (!selected) return;
    onConfirm(selected, selected === '其他' ? otherText.trim() : undefined);
    setSelected(null);
    setOtherText('');
  };

  const handleCancel = () => {
    setSelected(null);
    setOtherText('');
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-[400px] p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">连续跳过多个任务</h3>
        <p className="text-sm text-gray-500 mb-4">请告诉我们跳过的原因，帮助我们改进课程</p>
        <div className="space-y-2 mb-4">
          {REASONS.map((r) => (
            <label
              key={r.value}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                selected === r.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name="skip-reason"
                value={r.value}
                checked={selected === r.value}
                onChange={() => setSelected(r.value)}
                className="accent-blue-500"
              />
              <span className="text-sm text-gray-700">{r.label}</span>
            </label>
          ))}
        </div>
        {selected === '其他' && (
          <textarea
            value={otherText}
            onChange={(e) => setOtherText(e.target.value.slice(0, 200))}
            placeholder="请简述原因..."
            className="w-full border border-gray-200 rounded-lg p-2 text-sm mb-4 resize-none h-20 focus:outline-none focus:ring-2 focus:ring-blue-300"
            maxLength={200}
          />
        )}
        <div className="flex gap-3 justify-end">
          <button onClick={handleCancel} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            返回继续学习
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="px-4 py-2 text-sm text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            确认并跳过
          </button>
        </div>
      </div>
    </div>
  );
};

export default SkipReasonModal;
