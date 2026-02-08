import React, { useState } from 'react';
import { Send, CheckCircle2, GripHorizontal } from 'lucide-react';

interface SubmissionPanelProps {
  taskDescription: string;
}

const SubmissionPanel: React.FC<SubmissionPanelProps> = ({ taskDescription }) => {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'IDLE' | 'SUBMITTING' | 'SUCCESS'>('IDLE');

  const handleSubmit = () => {
    if (!input.trim()) return;
    setStatus('SUBMITTING');
    
    // Simulate API submission
    setTimeout(() => {
      setStatus('SUCCESS');
      setTimeout(() => setStatus('IDLE'), 3000);
    }, 1000);
  };

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex justify-between items-center shrink-0">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
          任务与提交
        </span>
        {status === 'SUCCESS' && (
            <span className="flex items-center gap-1 text-xs font-medium text-green-600 animate-fade-in">
                <CheckCircle2 size={14}/> 已提交
            </span>
        )}
      </div>

      <div className="flex-1 p-4 flex gap-4 min-h-0">
        <div className="w-1/3 text-sm text-gray-600 overflow-y-auto pr-2 border-r border-gray-100">
          <strong className="block text-gray-800 mb-1">当前任务:</strong>
          {taskDescription}
        </div>
        
        <div className="flex-1 flex flex-col relative">
           <textarea
              className="w-full h-full p-3 text-sm border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none font-mono"
              placeholder="在这里输入你的回答..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
           />
          
          <button
            onClick={handleSubmit}
            disabled={status !== 'IDLE' || !input.trim()}
            className={`absolute bottom-4 right-4 px-4 py-2 rounded shadow-sm text-sm font-medium flex items-center gap-2 transition-all ${
               status === 'SUCCESS' 
               ? 'bg-green-600 text-white' 
               : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            {status === 'SUBMITTING' ? '提交中...' : '提交'}
            {!status && <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubmissionPanel;