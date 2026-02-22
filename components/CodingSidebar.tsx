import React, { useState } from 'react';
import { Chapter } from '../types';
import CentralChat from './CentralChat';
import RoadmapPanel from './RoadmapPanel';
import { MessageSquare, Map, ArrowLeft } from 'lucide-react';
import { NormalizedStreamEvent } from '../services/runtimeManager';

interface CodingSidebarProps {
  chapter: Chapter;
  courseId: string;
  onExit: () => void;
  onRuntimeEvent?: (event: NormalizedStreamEvent) => void;
  dynamicReport?: string;
  isRoadmapUpdating?: boolean;
  isMemoUpdating?: boolean;
}

const CodingSidebar: React.FC<CodingSidebarProps> = ({
  chapter,
  courseId,
  onExit,
  onRuntimeEvent,
  dynamicReport,
  isRoadmapUpdating,
  isMemoUpdating,
}) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'roadmap'>('chat');

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200 shadow-xl">
      {/* Tabs Header */}
      <div className="flex items-center p-2 bg-gray-50 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'chat'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          <MessageSquare size={16} />
          AI 助手
        </button>
        <button
          onClick={() => setActiveTab('roadmap')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'roadmap'
              ? 'bg-white text-orange-600 shadow-sm'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          <Map size={16} />
          学习路线
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 transition-opacity duration-200 ${activeTab === 'chat' ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
             {/* Pass undefined to onStartCoding to avoid showing the button inside the sidebar */}
            <CentralChat chapter={chapter} courseId={courseId} onStartCoding={undefined} onRuntimeEvent={onRuntimeEvent} />
        </div>
        <div className={`absolute inset-0 transition-opacity duration-200 ${activeTab === 'roadmap' ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
            <RoadmapPanel
              chapter={chapter}
              dynamicReport={dynamicReport}
              isRoadmapUpdating={isRoadmapUpdating}
              isMemoUpdating={isMemoUpdating}
            />
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 bg-gray-50 shrink-0">
        <button
          onClick={onExit}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white border border-gray-200 hover:bg-gray-100 hover:border-gray-300 text-gray-700 font-bold rounded-xl transition-all shadow-sm"
        >
          <ArrowLeft size={18} />
          回到课程平台
        </button>
      </div>
    </div>
  );
};

export default CodingSidebar;
