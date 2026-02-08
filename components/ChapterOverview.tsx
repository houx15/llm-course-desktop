import React from 'react';
import { Chapter, Lesson } from '../types';
import { FileText, Download, Code2, BookOpen } from 'lucide-react';

interface ChapterOverviewProps {
  chapter: Chapter;
  onSelectLesson: (lesson: Lesson) => void;
}

const ChapterOverview: React.FC<ChapterOverviewProps> = ({ chapter, onSelectLesson }) => {
  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="mb-8 pb-6 border-b border-gray-100">
        <span className="text-sm font-bold text-blue-600 uppercase tracking-widest mb-2 block">Chapter Overview</span>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">{chapter.title}</h1>
        <p className="text-lg text-gray-600 leading-relaxed">
          {chapter.description}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Lesson List */}
        <div>
          <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <BookOpen size={20} className="text-blue-500" />
            本章课程
          </h2>
          <div className="space-y-3">
            {chapter.lessons.map((lesson, idx) => (
              <div 
                key={lesson.id}
                onClick={() => onSelectLesson(lesson)}
                className="group p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all cursor-pointer flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-mono flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    {idx + 1}
                  </span>
                  <span className="font-medium text-gray-700 group-hover:text-blue-700">{lesson.title}</span>
                </div>
                <div className="text-gray-400 group-hover:text-blue-400">
                  <FileText size={16} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Resources */}
        <div>
          <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Download size={20} className="text-green-600" />
            资源下载
          </h2>
          <div className="space-y-3">
            {chapter.resources.map((res, idx) => (
              <a 
                key={idx}
                href={res.url}
                className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border border-transparent hover:bg-white hover:border-gray-200 hover:shadow-sm transition-all text-gray-700"
              >
                <div className={`p-2 rounded-md ${res.type === 'ppt' ? 'bg-orange-100 text-orange-600' : 'bg-slate-200 text-slate-700'}`}>
                  {res.type === 'ppt' ? <FileText size={18} /> : <Code2 size={18} />}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-sm">{res.title}</div>
                  <div className="text-xs text-gray-500 uppercase">{res.type} FILE</div>
                </div>
                <Download size={16} className="text-gray-400" />
              </a>
            ))}
            {chapter.resources.length === 0 && (
              <p className="text-gray-400 italic text-sm">暂无下载资源</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChapterOverview;