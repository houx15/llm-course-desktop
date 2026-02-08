import React, { useState } from 'react';
import { BookOpen, Settings, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { SettingsModal } from './SettingsModal';

interface TopBarProps {
  user: {
    name: string;
    email: string;
  };
  onLogout: () => void;
  onLogoClick?: () => void;
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

const TopBar: React.FC<TopBarProps> = ({ user, onLogout, onLogoClick, onToggleSidebar, isSidebarOpen }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  return (
    <>
      <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0 z-40 relative shadow-sm w-full drag-region">
          {/* Branding */}
          <div 
            className={`flex items-center gap-3 ${onLogoClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
            onClick={onLogoClick}
          >
              <div className="bg-black p-2 rounded-xl shadow-lg shadow-gray-200">
                  <BookOpen size={20} className="text-white"/>
              </div>
              <div>
                  <h1 className="font-bold text-lg text-gray-900 tracking-tight leading-none">LLM & 社会科学</h1>
                  <p className="text-[10px] font-medium text-gray-500 uppercase tracking-widest mt-0.5">Local Environment</p>
              </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-3">
              {onToggleSidebar && (
                <button
                  onClick={onToggleSidebar}
                  className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                  title={isSidebarOpen ? '隐藏课程目录' : '显示课程目录'}
                >
                  {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
                </button>
              )}
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="flex items-center gap-3 p-1.5 pl-3 rounded-xl border border-transparent hover:bg-gray-50 hover:border-gray-200 transition-all group"
                title="Settings"
              >
                  <div className="flex flex-col items-end hidden sm:block">
                      <span className="text-sm font-bold text-gray-800 leading-none">{user.name}</span>
                      <span className="text-[10px] text-gray-500 font-medium leading-none mt-1 group-hover:text-blue-600 transition-colors">设置</span>
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600 group-hover:bg-black group-hover:text-white transition-all shadow-sm">
                      <Settings size={18} />
                  </div>
              </button>
              
              <div className="h-8 w-px bg-gray-200 mx-1"></div>

              <button 
                onClick={() => setShowLogoutConfirm(true)}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Logout"
              >
                  <LogOut size={18} />
              </button>
          </div>
      </div>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-[360px] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">确认退出登录？</h3>
            </div>
            <div className="px-5 py-4 text-sm text-gray-600">
              退出后需要重新登录才能继续学习。
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                取消
              </button>
              <button
                onClick={() => {
                  setShowLogoutConfirm(false);
                  onLogout();
                }}
                className="px-4 py-1.5 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default TopBar;
