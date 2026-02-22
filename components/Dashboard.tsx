import React, { useState } from 'react';
import { Plus, BookOpen, Clock, MoreVertical, GraduationCap } from 'lucide-react';
import { CourseSummary } from '../types';
import AddCourseModal from './AddCourseModal';

interface DashboardProps {
  user: any;
  courses: CourseSummary[];
  onAddCourse: (data: { code: string; studentId: string; name: string }) => void;
  onSelectCourse: (courseId: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, courses, onAddCourse, onSelectCourse }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="flex-1 bg-gray-50 overflow-y-auto p-8">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">我的课程</h1>
            <p className="text-gray-500 text-sm mt-1">Welcome back, {user.name} 👋</p>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-black text-white font-bold rounded-lg shadow-sm hover:bg-gray-800 transition-all"
          >
            <Plus size={18} />
            新增课程
          </button>
        </div>

        {/* Course Grid */}
        {courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-96 bg-white rounded-2xl border border-dashed border-gray-300 text-center">
             <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-gray-400">
                <BookOpen size={32} />
             </div>
             <h3 className="text-lg font-bold text-gray-900">还没有课程</h3>
             <p className="text-gray-500 max-w-xs mt-2 mb-6">加入老师的班级或者创建你自己的课程开始学习。</p>
             <button 
                onClick={() => setIsModalOpen(true)}
                className="text-blue-600 font-medium hover:underline"
             >
                立即添加课程
             </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {courses.map(course => (
               <div 
                 key={course.id}
                 onClick={() => onSelectCourse(course.id)}
                 className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-blue-200 transition-all cursor-pointer group flex flex-col h-full"
               >
                 <div className="h-32 bg-gradient-to-r from-gray-900 to-gray-800 p-6 relative">
                    <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white backdrop-blur-sm">
                            <MoreVertical size={16} />
                        </button>
                    </div>
                    <span className="inline-block px-2 py-1 bg-white/10 backdrop-blur-md rounded text-xs font-bold text-white mb-2 border border-white/10">
                        {course.code}
                    </span>
                    <h3 className="text-xl font-bold text-white leading-tight line-clamp-2">{course.title}</h3>
                 </div>
                 
                 <div className="p-6 flex-1 flex flex-col">
                    <div className="flex-1">
                        <p className="text-sm text-gray-600 line-clamp-2 mb-4">
                            {course.description}
                        </p>
                        
                        <div className="flex items-center gap-3 text-sm text-gray-500 mb-2">
                             <GraduationCap size={16} />
                             <span>{course.instructor}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-gray-500">
                             <Clock size={16} />
                             <span>{course.semester}</span>
                        </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between">
                         <span className="text-xs font-medium text-gray-400">Joined {course.joinedAt}</span>
                         <span className="text-sm font-bold text-blue-600 group-hover:translate-x-1 transition-transform flex items-center gap-1 whitespace-nowrap">
                            进入课程 <BookOpen size={14} />
                         </span>
                    </div>
                 </div>
               </div>
             ))}
          </div>
        )}
      </div>

      <AddCourseModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onJoinCourse={onAddCourse}
      />
    </div>
  );
};

export default Dashboard;
