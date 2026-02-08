import React, { useState } from 'react';
import { X, Users, PlusCircle, ArrowLeft, School } from 'lucide-react';

interface AddCourseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoinCourse: (data: { code: string; studentId: string; name: string }) => void;
}

const AddCourseModal: React.FC<AddCourseModalProps> = ({ isOpen, onClose, onJoinCourse }) => {
  const [step, setStep] = useState<'select' | 'join_form'>('select');
  const [formData, setFormData] = useState({
    code: '',
    studentId: '',
    name: ''
  });

  if (!isOpen) return null;

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onJoinCourse(formData);
    onClose();
    // Reset state after close
    setTimeout(() => {
        setStep('select');
        setFormData({ code: '', studentId: '', name: '' });
    }, 300);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-[500px] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div className="flex items-center gap-2">
            {step === 'join_form' && (
                <button 
                    onClick={() => setStep('select')}
                    className="p-1 -ml-2 mr-1 hover:bg-gray-200 rounded-full text-gray-500 transition-colors"
                >
                    <ArrowLeft size={18} />
                </button>
            )}
            <h2 className="text-lg font-bold text-gray-800">
                {step === 'select' ? '新增课程' : '加入班级'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'select' ? (
            <div className="grid grid-cols-1 gap-4">
              <button 
                onClick={() => setStep('join_form')}
                className="flex items-center gap-4 p-5 rounded-xl border-2 border-gray-100 hover:border-blue-500 hover:bg-blue-50 transition-all group text-left"
              >
                <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <School size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 group-hover:text-blue-700">加入老师的课程</h3>
                  <p className="text-sm text-gray-500 mt-1">输入课程码和个人信息加入已有班级</p>
                </div>
              </button>

              <button 
                disabled
                className="flex items-center gap-4 p-5 rounded-xl border-2 border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed text-left grayscale"
              >
                <div className="w-12 h-12 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center">
                  <PlusCircle size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    创建新课程
                    <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 text-[10px] rounded uppercase font-bold">Coming Soon</span>
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">自定义课程内容和AI助教配置</p>
                </div>
              </button>
            </div>
          ) : (
            <form onSubmit={handleJoinSubmit} className="space-y-4">
               <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase">课程邀请码</label>
                  <input 
                    required
                    type="text" 
                    placeholder="例如: SOC101"
                    value={formData.code}
                    onChange={(e) => setFormData({...formData, code: e.target.value})}
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm uppercase"
                  />
               </div>
               
               <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-500 uppercase">学号</label>
                      <input 
                        required
                        type="text" 
                        placeholder="Student ID"
                        value={formData.studentId}
                        onChange={(e) => setFormData({...formData, studentId: e.target.value})}
                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      />
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-500 uppercase">姓名</label>
                      <input 
                        required
                        type="text" 
                        placeholder="Your Name"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      />
                   </div>
               </div>

               <div className="pt-4">
                  <button 
                    type="submit"
                    className="w-full py-3 bg-black text-white font-bold rounded-xl shadow-lg hover:bg-gray-800 transition-all flex items-center justify-center gap-2"
                  >
                    <School size={18} />
                    确认加入
                  </button>
               </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddCourseModal;
