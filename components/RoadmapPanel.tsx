import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Chapter, Checkpoint } from '../types';
import { CheckCircle2, Lock, CircleDot, ChevronDown, Target, Clock, User, Lightbulb, BookOpen } from 'lucide-react';

interface RoadmapPanelProps {
  chapter: Chapter;
  dynamicReport?: string;
  isRoadmapUpdating?: boolean;
  isMemoUpdating?: boolean;
}

interface ReportSection {
  title: string;
  content: string;
}

function parseReportSections(markdown: string): { intro: string; sections: ReportSection[] } {
  const lines = markdown.split('\n');
  const sections: ReportSection[] = [];
  let intro = '';
  let currentTitle = '';
  let currentLines: string[] = [];
  let inSection = false;

  for (const line of lines) {
    const h2Match = line.match(/^## (.+)$/);
    if (h2Match) {
      if (inSection) {
        sections.push({ title: currentTitle, content: currentLines.join('\n').trim() });
      } else {
        intro = currentLines.join('\n').trim();
      }
      currentTitle = h2Match[1].trim();
      currentLines = [];
      inSection = true;
    } else {
      currentLines.push(line);
    }
  }

  if (inSection) {
    sections.push({ title: currentTitle, content: currentLines.join('\n').trim() });
  } else {
    intro = currentLines.join('\n').trim();
  }

  return { intro, sections };
}

const mdComponents = {
  h3: ({ children }: any) => (
    <h3 className="text-sm font-semibold text-gray-700 mt-3 mb-1 first:mt-0">{children}</h3>
  ),
  p: ({ children }: any) => (
    <p className="text-sm text-gray-600 leading-relaxed mb-2">{children}</p>
  ),
  ul: ({ children }: any) => <ul className="mb-2 pl-4 space-y-1 list-disc">{children}</ul>,
  ol: ({ children }: any) => <ol className="mb-2 pl-4 space-y-1 list-decimal">{children}</ol>,
  li: ({ children }: any) => <li className="text-sm text-gray-600 leading-relaxed">{children}</li>,
  strong: ({ children }: any) => <strong className="font-semibold text-gray-800">{children}</strong>,
  code: ({ children }: any) => (
    <code className="text-[0.82rem] bg-gray-100 px-1 py-0.5 rounded font-mono text-pink-600">{children}</code>
  ),
};

interface SectionStyle {
  Icon: React.ElementType;
  iconColor: string;
  headerBg: string;
  borderColor: string;
}

function getSectionStyle(title: string): SectionStyle {
  const t = title;
  if (t.includes('任务') || t.includes('task') || t.includes('Task')) {
    return { Icon: Target, iconColor: 'text-blue-500', headerBg: 'bg-blue-50 hover:bg-blue-100', borderColor: 'border-blue-100' };
  }
  if (t.includes('活动') || t.includes('回合') || t.includes('Recent') || t.includes('recent')) {
    return { Icon: Clock, iconColor: 'text-purple-500', headerBg: 'bg-purple-50 hover:bg-purple-100', borderColor: 'border-purple-100' };
  }
  if (t.includes('学习者') || t.includes('状态') || t.includes('Student') || t.includes('student')) {
    return { Icon: User, iconColor: 'text-green-500', headerBg: 'bg-green-50 hover:bg-green-100', borderColor: 'border-green-100' };
  }
  if (t.includes('下一步') || t.includes('建议') || t.includes('Next') || t.includes('next')) {
    return { Icon: Lightbulb, iconColor: 'text-orange-500', headerBg: 'bg-orange-50 hover:bg-orange-100', borderColor: 'border-orange-100' };
  }
  return { Icon: BookOpen, iconColor: 'text-gray-400', headerBg: 'bg-gray-50 hover:bg-gray-100', borderColor: 'border-gray-100' };
}

const RoadmapPanel: React.FC<RoadmapPanelProps> = ({
  chapter,
  dynamicReport = '',
  isRoadmapUpdating = false,
  isMemoUpdating = false,
}) => {
  const { roadmap } = chapter;
  const { intro, sections } = parseReportSections(dynamicReport);
  const [openSections, setOpenSections] = useState<Set<number>>(new Set());

  // Open all sections whenever the report changes
  useEffect(() => {
    if (sections.length > 0) {
      setOpenSections(new Set(sections.map((_, i) => i)));
    }
  }, [dynamicReport]);

  const toggleSection = (i: number) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const renderCheckpoint = (item: Checkpoint) => {
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
        <div className="flex gap-3 items-start relative z-10">
          <div className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center bg-white z-10 ${colorClass}`}>
            <Icon size={10} strokeWidth={3} />
          </div>
          <div className="pt-0.5">
            <div className={`text-sm leading-none mb-1 ${textClass}`}>{item.title}</div>
            {item.status === 'IN_PROGRESS' && item.description && !item.subItems && (
              <div className="text-xs text-orange-600/80 mt-1 font-mono bg-orange-50 px-1.5 py-0.5 rounded inline-block">
                {item.description}
              </div>
            )}
          </div>
        </div>
        {item.subItems && item.subItems.length > 0 && (
          <div className="ml-2.5 mt-3 pl-4 border-l-2 border-gray-100 space-y-3">
            {item.subItems.map((sub) => (
              <div key={sub.id} className="flex items-start gap-2 text-sm text-gray-500">
                <div
                  className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                    sub.status === 'COMPLETED' ? 'bg-green-400' : sub.status === 'IN_PROGRESS' ? 'bg-orange-400' : 'bg-gray-300'
                  }`}
                />
                <span className={sub.status === 'COMPLETED' ? 'line-through text-gray-400' : ''}>{sub.title}</span>
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
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">学习进度报告</span>
        {(isRoadmapUpdating || isMemoUpdating) && (
          <span className="text-[10px] text-orange-500 animate-pulse font-medium">更新中…</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {roadmap.sections.length > 0 ? (
          /* Structured checkpoint tree */
          <div className="p-4">
            <div className="relative pl-2">
              <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-gray-200" />
              {roadmap.sections.map((section, sIdx) => (
                <div key={sIdx} className="mb-6 relative z-10">
                  <h3 className="text-xs font-bold text-gray-400 mb-3 pl-8 uppercase">{section.title}</h3>
                  <div className="space-y-0">{section.items.map((item) => renderCheckpoint(item))}</div>
                </div>
              ))}
            </div>
          </div>
        ) : sections.length > 0 ? (
          /* Accordion report sections */
          <div className="divide-y divide-gray-100">
            {sections.map((section, i) => {
              const isOpen = openSections.has(i);
              const { Icon, iconColor, headerBg, borderColor } = getSectionStyle(section.title);
              return (
                <div key={i} className={`border-l-4 ${borderColor}`}>
                  <button
                    onClick={() => toggleSection(i)}
                    className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${headerBg}`}
                  >
                    <span className="flex items-center gap-2">
                      <Icon size={14} className={`shrink-0 ${iconColor}`} />
                      <span className="text-sm font-semibold text-gray-700">{section.title}</span>
                    </span>
                    <ChevronDown
                      size={14}
                      className={`text-gray-400 transition-transform shrink-0 ml-2 ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-3 pt-1">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                        {section.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              );
            })}
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
