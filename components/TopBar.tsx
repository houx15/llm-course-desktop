import React, { useState } from 'react';
import { Settings, PanelLeftClose, PanelLeftOpen, ArrowLeft } from 'lucide-react';
import { SettingsModal } from './SettingsModal';
import KnoweiaLogo from './KnoweiaLogo';

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

const TopBar: React.FC<TopBarProps> = ({ user, onLogout, onLogoClick }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <>
      <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0 z-40 relative shadow-sm w-full drag-region">
          {/* Branding */}
          <div className="flex items-center gap-3">
              {onLogoClick && (
                <button
                  onClick={onLogoClick}
                  className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                  title="返回主页"
                  aria-label="返回主页"
                >
                  <ArrowLeft size={18} />
                </button>
              )}
              <div
                className={`flex items-center gap-3 ${onLogoClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                onClick={onLogoClick}
              >
              <div className="rounded-xl shadow-lg shadow-blue-200/60 ring-1 ring-blue-100 overflow-hidden">
                  <KnoweiaLogo className="w-9 h-9 block" />
              </div>
              <div>
                  <h1 className="font-bold text-lg text-gray-900 tracking-tight leading-none">Knoweia</h1>
                  <p className="text-[10px] font-medium text-gray-500 uppercase tracking-widest mt-0.5">AI Learning Platform</p>
              </div>
              </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-3">
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="flex items-center gap-4 p-1.5 pl-4 rounded-xl border border-transparent hover:bg-gray-50 hover:border-gray-200 transition-all group"
                title="Settings"
              >
                  <div className="flex flex-col items-end hidden sm:block">
                      <span className="text-sm font-bold text-gray-800 leading-none">{user.name}</span>
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600 group-hover:bg-black group-hover:text-white transition-all shadow-sm">
                      <Settings size={18} />
                  </div>
              </button>
          </div>
      </div>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} onLogout={onLogout} />
    </>
  );
};

export default TopBar;
