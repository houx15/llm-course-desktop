import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Chapter, Checkpoint } from '../types';
import { CheckCircle2, Lock, CircleDot } from 'lucide-react';

interface RoadmapPanelProps {
  chapter: Chapter;
  dynamicReport?: string;
  isRoadmapUpdating?: boolean;
  isMemoUpdating?: boolean;
}

const RoadmapPanel: React.FC<RoadmapPanelProps> = ({ chapter, dynamicReport = '', isRoadmapUpdating = false, isMemoUpdating = false }) => {
  const { roadmap } = chapter;

  const renderItem = (item: Checkpoint) => {
    let Icon = CircleDot;
    let colorClass = 'text-gray-300 bg-white border-gray-300';
    let textClass = 'text-gray-400';

    if (item.status === 'COMPLETED') {
      Icon = CheckCircle2;
      colorClass = 'text-white bg-green-500 border-green-500';
      textClass = 'text-gray-700 line-through decoration-gray-300';
    } else if (item.status === 'IN_PROGRESS') {
      Icon = CircleDot;
      colorClass = 'text-orange-500 bg-white border-orange-500 ring-4 ring-orange-100';
      textClass = 'text-gray-900 font-medium';
    } else if (item.status === 'LOCKED') {
      Icon = Lock;
      colorClass = 'text-gray-400 bg-gray-100 border-gray-200';
      textClass = 'text-gray-400';
    }

    return (
      <div key={item.id} className="relative pb-6 last:pb-0">
        <div className="flex gap-3 items-start group relative z-10">
          <div className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all bg-white z-10 ${colorClass}`}>
            <Icon size={10} strokeWidth={3} />
          </div>
          <div className="pt-0.5">
            <div className={`text-sm leading-none mb-1 transition-colors ${textClass}`}>{item.title}</div>
            {item.status === 'IN_PROGRESS' && item.description && !item.subItems && (
              <div className="text-xs text-orange-600/80 mt-1 font-mono bg-orange-50 px-1.5 py-0.5 rounded inline-block">
                {item.description}
              </div>
            )}
          </div>
        </div>
        {item.subItems && item.subItems.length > 0 && (
          <div className="ml-2.5 mt-3 pl-4 border-l-2 border-gray-100 space-y-3">
            {item.subItems.map((subItem) => (
              <div key={subItem.id} className="flex items-start gap-2 text-sm text-gray-500">
                <div
                  className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                    subItem.status === 'COMPLETED' ? 'bg-green-400' : subItem.status === 'IN_PROGRESS' ? 'bg-orange-400' : 'bg-gray-300'
                  }`}
                />
                <span className={subItem.status === 'COMPLETED' ? 'line-through text-gray-400' : ''}>{subItem.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">学习报告</span>
        {(isRoadmapUpdating || isMemoUpdating) && (
          <span className="text-[10px] text-orange-500 animate-pulse font-medium">更新中…</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {roadmap.sections.length > 0 ? (
          /* Structured checkpoint tree (future use) */
          <div className="p-4">
            <div className="relative pl-2">
              <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-gray-200" />
              {roadmap.sections.map((section, sIdx) => (
                <div key={sIdx} className="mb-6 relative z-10">
                  <h3 className="text-xs font-bold text-gray-400 mb-3 pl-8 uppercase">{section.title}</h3>
                  <div className="space-y-0">{section.items.map((item) => renderItem(item))}</div>
                </div>
              ))}
            </div>
          </div>
        ) : dynamicReport ? (
          /* Markdown report with structured headings */
          <div className="px-4 py-3">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 className="text-sm font-bold text-gray-800 mb-3 pb-1.5 border-b border-gray-200 mt-0">{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-xs font-bold text-gray-700 mt-5 mb-2 pb-1 border-b border-gray-100 uppercase tracking-wide first:mt-1">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-xs font-semibold text-gray-600 mt-3 mb-1">{children}</h3>
                ),
                p: ({ children }) => (
                  <p className="text-xs text-gray-600 leading-relaxed mb-2">{children}</p>
                ),
                ul: ({ children }) => (
                  <ul className="mb-2 pl-4 space-y-0.5 list-disc">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="mb-2 pl-4 space-y-0.5 list-decimal">{children}</ol>
                ),
                li: ({ children }) => (
                  <li className="text-xs text-gray-600 leading-relaxed">{children}</li>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-gray-800">{children}</strong>
                ),
                code: ({ children }) => (
                  <code className="text-[0.78rem] bg-gray-100 px-1 py-0.5 rounded font-mono text-pink-600">{children}</code>
                ),
              }}
            >
              {dynamicReport}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full px-6">
            <p className="text-xs text-gray-400 italic text-center">完成第一轮对话后，学习报告将在此显示。</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RoadmapPanel;
