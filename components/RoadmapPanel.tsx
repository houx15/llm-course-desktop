import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Chapter, Checkpoint } from '../types';
import { CheckCircle2, Lock, CircleDot, Activity, ArrowUpRight, History } from 'lucide-react';

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
    let colorClass = "text-gray-300 bg-white border-gray-300";
    let textClass = "text-gray-400";

    if (item.status === 'COMPLETED') {
        Icon = CheckCircle2;
        colorClass = "text-white bg-green-500 border-green-500";
        textClass = "text-gray-700 line-through decoration-gray-300";
    } else if (item.status === 'IN_PROGRESS') {
        Icon = CircleDot;
        colorClass = "text-orange-500 bg-white border-orange-500 ring-4 ring-orange-100";
        textClass = "text-gray-900 font-medium";
    } else if (item.status === 'LOCKED') {
        Icon = Lock;
        colorClass = "text-gray-400 bg-gray-100 border-gray-200";
        textClass = "text-gray-400";
    }

    return (
        <div key={item.id} className="relative pb-6 last:pb-0">
            {/* Main Item */}
            <div className="flex gap-3 items-start group relative z-10">
                <div className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all bg-white z-10 ${colorClass}`}>
                    <Icon size={10} strokeWidth={3} />
                </div>
                <div className="pt-0.5">
                    <div className={`text-sm leading-none mb-1 transition-colors ${textClass}`}>
                        {item.title}
                    </div>
                    {item.status === 'IN_PROGRESS' && item.description && !item.subItems && (
                        <div className="text-xs text-orange-600/80 mt-1 font-mono bg-orange-50 px-1.5 py-0.5 rounded inline-block">
                            {item.description}
                        </div>
                    )}
                </div>
            </div>
            
            {/* Render Sub Items as simple list */}
            {item.subItems && item.subItems.length > 0 && (
                <div className="ml-2.5 mt-3 pl-4 border-l-2 border-gray-100 space-y-3">
                    {item.subItems.map(subItem => (
                        <div key={subItem.id} className="flex items-start gap-2 text-sm text-gray-500">
                             <div className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                                 subItem.status === 'COMPLETED' ? 'bg-green-400' :
                                 subItem.status === 'IN_PROGRESS' ? 'bg-orange-400' : 'bg-gray-300'
                             }`} />
                             <span className={`${subItem.status === 'COMPLETED' ? 'line-through text-gray-400' : ''}`}>
                                {subItem.title}
                             </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-gray-50/50 overflow-y-auto">
      {/* Top Status Card */}
      <div className="p-4 border-b border-gray-200 bg-white space-y-4">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">学习状态</h2>
        
        {/* Current Task */}
        <div>
          <div className="text-xs text-orange-600 font-semibold mb-1 flex items-center gap-1">
            <Activity size={12} /> 当前进行
          </div>
          <div className="text-sm font-medium text-gray-900">{roadmap.currentTask || '暂无任务'}</div>
        </div>

        {/* Recent Activity */}
        {roadmap.statusSummary.learnerState && (
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                 <div className="text-xs text-gray-500 font-semibold mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1"><History size={12} /> 最近活动</span>
                    <span className="bg-gray-200 px-1.5 py-0.5 rounded text-[10px]">Round {roadmap.statusSummary.round}</span>
                 </div>
                 <p className="text-xs text-gray-600 italic leading-relaxed">
                    {roadmap.statusSummary.learnerState}
                 </p>
            </div>
        )}
        
        {/* Next Advice */}
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
          <div className="text-xs text-blue-600 font-semibold mb-1 flex items-center gap-1">
             <ArrowUpRight size={12} /> 下一步建议
          </div>
          <p className="text-xs text-blue-800 leading-relaxed">
            {roadmap.nextAdvice || '跟随 AI 助手完成任务。'}
          </p>
        </div>

        {(isRoadmapUpdating || isMemoUpdating) && (
          <div className="p-2 bg-orange-50 border border-orange-100 rounded-lg text-[11px] text-orange-700">
            {isRoadmapUpdating ? '路线状态更新中...' : '学习报告更新中...'}
          </div>
        )}

      </div>

      {/* Dynamic report as primary content when no structured sections */}
      {roadmap.sections.length === 0 ? (
        <div className="p-4 flex-1">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">学习报告</h2>
          {dynamicReport ? (
            <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-headings:text-gray-700 prose-headings:font-semibold text-gray-700">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{dynamicReport}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">完成第一轮对话后，学习报告将在此显示。</p>
          )}
        </div>
      ) : (
        /* Structured roadmap tree */
        <div className="p-4 flex-1">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">学习路线图</h2>
          <div className="relative pl-2">
            <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-gray-200"></div>
            {roadmap.sections.map((section, sIdx) => (
              <div key={sIdx} className="mb-6 relative z-10">
                <h3 className="text-xs font-bold text-gray-400 mb-3 pl-8 uppercase">{section.title}</h3>
                <div className="space-y-0">
                  {section.items.map((item) => renderItem(item))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RoadmapPanel;
