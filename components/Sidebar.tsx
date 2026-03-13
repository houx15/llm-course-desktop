import React, { useEffect, useState } from 'react';
import { Phase, Chapter } from '../types';
import { ChevronDown, ChevronRight, Lock, CheckCircle2, List, Plus } from 'lucide-react';

interface SidebarProps {
  phases: Phase[];
  currentChapterId: string | null;
  currentPhaseId: string | null;
  currentSessionId: string | null | undefined;
  onSelectChapter: (chapter: Chapter, phase: Phase) => void;
  onSelectPhase: (phase: Phase) => void;
  onCreateNewSession: (chapter: Chapter, phase: Phase) => void;
  onSelectSession: (sessionId: string, chapter: Chapter, phase: Phase) => void;
}

const formatShortDate = (isoString: string): string => {
  const d = new Date(isoString);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
};

const Sidebar: React.FC<SidebarProps> = ({
  phases,
  currentChapterId,
  currentPhaseId,
  currentSessionId,
  onSelectChapter,
  onSelectPhase,
  onCreateNewSession,
  onSelectSession,
}) => {
  // Keep all phases (courses) expanded so chapter list is always visible
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set(phases.map(p => p.id)));
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [expandedParts, setExpandedParts] = useState<Set<string>>(new Set());

  // Auto-expand newly loaded phases (phases may arrive after initial mount)
  useEffect(() => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      let changed = false;
      for (const p of phases) {
        if (!next.has(p.id)) { next.add(p.id); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [phases]);

  // Parts default to collapsed — no auto-expand

  // Auto-expand the session list when navigating to a chapter
  useEffect(() => {
    if (currentChapterId) {
      setExpandedChapters(prev => {
        if (prev.has(currentChapterId)) return prev;
        const next = new Set(prev);
        next.add(currentChapterId);
        return next;
      });
    }
  }, [currentChapterId]);

  const toggleExpand = (phaseId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newExpanded = new Set(expandedPhases);
    if (newExpanded.has(phaseId)) {
      newExpanded.delete(phaseId);
    } else {
      newExpanded.add(phaseId);
    }
    setExpandedPhases(newExpanded);
  };

  const toggleChapterExpand = (chapterId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newExpanded = new Set(expandedChapters);
    if (newExpanded.has(chapterId)) {
      newExpanded.delete(chapterId);
    } else {
      newExpanded.add(chapterId);
    }
    setExpandedChapters(newExpanded);
  };

  const togglePartExpand = (partId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedParts(prev => {
      const next = new Set(prev);
      if (next.has(partId)) next.delete(partId);
      else next.add(partId);
      return next;
    });
  };

  const renderStatusIcon = (status: string, isActive: boolean) => {
    if (status === 'LOCKED') return <Lock size={12} className="text-gray-400" />;
    if (status === 'COMPLETED') return <CheckCircle2 size={12} className="text-green-500" />;
    if (status === 'NOT_STARTED') return <div className="w-2 h-2 rounded-full bg-gray-300" />;
    // IN_PROGRESS
    if (isActive) {
      return <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse shadow-[0_0_8px_rgba(249,115,22,0.6)]" />;
    }
    return <div className="w-2 h-2 rounded-full bg-orange-500/50" />;
  };

  const renderChapterRow = (chapter: Chapter, phase: Phase) => {
    const isChapterActive = currentChapterId === chapter.id;
    const isChapterLocked = chapter.status === 'LOCKED';
    const sessions = chapter.sessions || [];
    const hasSessions = sessions.length > 0;
    const isChapterExpanded = expandedChapters.has(chapter.id);

    return (
      <div key={chapter.id}>
        {/* Chapter row — single white-background container */}
        <div
          className={`group flex items-center border-l-2 transition-all ${
            isChapterActive
              ? 'bg-white border-orange-500 shadow-sm'
              : 'border-transparent hover:bg-gray-100'
          } ${isChapterLocked ? 'opacity-50' : ''}`}
        >
          <button
            disabled={isChapterLocked}
            onClick={() => onSelectChapter(chapter, phase)}
            className={`flex-1 min-w-0 text-left px-4 py-2.5 text-sm flex items-center gap-3 ${
              isChapterActive
                ? 'text-gray-900 font-medium'
                : 'text-gray-600'
            } ${isChapterLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <div className="shrink-0 w-4 flex justify-center">
               {renderStatusIcon(chapter.status, isChapterActive)}
            </div>
            <span className="truncate">{chapter.title}</span>
          </button>

          {/* Session count badge + expand toggle */}
          {hasSessions && (
            <button
              onClick={(e) => toggleChapterExpand(chapter.id, e)}
              className="shrink-0 px-1.5 py-1 text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5"
              title={`${sessions.length} 次会话`}
            >
              <span className="text-[10px] font-medium">{sessions.length}</span>
              {isChapterExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            </button>
          )}

          {/* New session button — always visible when active, hover otherwise */}
          {!isChapterLocked && (
            <button
              onClick={(e) => { e.stopPropagation(); onCreateNewSession(chapter, phase); }}
              className={`shrink-0 w-6 h-6 mr-1 flex items-center justify-center text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-all ${
                isChapterActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
              title="新建会话"
            >
              <Plus size={12} />
            </button>
          )}
        </div>

        {/* Session sub-list */}
        {isChapterExpanded && hasSessions && (
          <div className="ml-7 border-l border-gray-200">
            {sessions.map((session) => (
              <button
                key={session.sessionId}
                onClick={() => onSelectSession(session.sessionId, chapter, phase)}
                className={`w-full text-left pl-3 pr-2 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                  currentSessionId === session.sessionId
                    ? 'text-blue-600 font-medium bg-blue-50/50'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  currentSessionId === session.sessionId ? 'bg-blue-500' : 'bg-gray-300'
                }`} />
                <span className="truncate">{formatShortDate(session.createdAt)}</span>
                {session.bundleVersion && (
                  <span className="shrink-0 text-[10px] text-gray-400">[{session.bundleVersion}]</span>
                )}
                {session.turnCount > 0 && (
                  <span className="shrink-0 text-[10px] text-gray-400">{session.turnCount}轮</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full h-full flex flex-col bg-gray-50 border-r border-gray-200">
      <div className="p-4 border-b border-gray-200 bg-white shrink-0 flex items-center justify-between">
         <span className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
            <List size={14} />
            课程目录
         </span>
         <span className="text-[10px] px-2 py-0.5 bg-gray-100 rounded-full text-gray-500 font-mono">v1.0</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {phases.map(phase => {
            const isPhaseActive = currentPhaseId === phase.id;
            const isLocked = phase.status === 'LOCKED';

            return (
              <div key={phase.id} className="rounded-lg overflow-hidden">
                {/* Phase Header */}
                <div
                  className={`w-full flex items-center justify-between p-3 transition-colors cursor-pointer select-none ${
                      isPhaseActive ? 'bg-blue-50' : 'bg-white hover:bg-gray-100'
                  } ${isLocked ? 'opacity-70 grayscale' : ''}`}
                  onClick={() => !isLocked && onSelectPhase(phase)}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold uppercase tracking-wider ${isPhaseActive ? 'text-blue-700' : 'text-gray-500'}`}>
                      {phase.title}
                    </span>
                    {renderStatusIcon(phase.status, isPhaseActive && !currentChapterId)}
                  </div>

                  <button
                    onClick={(e) => toggleExpand(phase.id, e)}
                    className="p-1 hover:bg-gray-200 rounded text-gray-400"
                  >
                    {expandedPhases.has(phase.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                </div>

                {/* Chapter List - with optional parts grouping */}
                {expandedPhases.has(phase.id) && (
                  <div className="bg-gray-50/50">
                    {phase.parts && phase.parts.length > 0 ? (
                      // Grouped by parts
                      phase.parts.map((part, partIndex) => {
                        const partChapters = part.chapterIds
                          .map(cid => phase.chapters.find(ch => ch.id === cid))
                          .filter(Boolean) as Chapter[];
                        const isPartExpanded = expandedParts.has(part.id);

                        return (
                          <div key={part.id}>
                            {/* Part header */}
                            <button
                              onClick={(e) => togglePartExpand(part.id, e)}
                              className="w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:bg-gray-100 transition-colors"
                            >
                              {isPartExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                              <span className="truncate">{partIndex + 1}. {part.title}</span>
                            </button>
                            {/* Part's chapters */}
                            {isPartExpanded && partChapters.map(chapter => renderChapterRow(chapter, phase))}
                          </div>
                        );
                      })
                    ) : (
                      // Flat list (no parts)
                      phase.chapters.map(chapter => renderChapterRow(chapter, phase))
                    )}
                  </div>
                )}
              </div>
            );
        })}
      </div>
    </div>
  );
};

export default Sidebar;
