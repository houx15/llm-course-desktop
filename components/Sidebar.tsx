import React, { useState } from 'react';
import { Phase, Chapter } from '../types';
import { ChevronDown, ChevronRight, Lock, CheckCircle2, List } from 'lucide-react';

interface SidebarProps {
  phases: Phase[];
  currentChapterId: string | null;
  currentPhaseId: string | null;
  onSelectChapter: (chapter: Chapter, phase: Phase) => void;
  onSelectPhase: (phase: Phase) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ phases, currentChapterId, currentPhaseId, onSelectChapter, onSelectPhase }) => {
  // Initialize with all phases expanded
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set(phases.map(p => p.id)));

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
                
                {/* Chapter List */}
                {expandedPhases.has(phase.id) && (
                  <div className="bg-gray-50/50">
                    {phase.chapters.map(chapter => {
                      const isChapterActive = currentChapterId === chapter.id;
                      const isChapterLocked = chapter.status === 'LOCKED';
                      
                      return (
                        <button
                          key={chapter.id}
                          disabled={isChapterLocked}
                          onClick={() => onSelectChapter(chapter, phase)}
                          className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-all border-l-2 ${
                            isChapterActive
                              ? 'bg-white border-orange-500 text-gray-900 font-medium shadow-sm'
                              : 'border-transparent text-gray-600 hover:bg-gray-100'
                          } ${isChapterLocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                        >
                          <div className="shrink-0 w-4 flex justify-center">
                             {renderStatusIcon(chapter.status, isChapterActive)}
                          </div>
                          <span className="truncate">{chapter.title}</span>
                        </button>
                      );
                    })}
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