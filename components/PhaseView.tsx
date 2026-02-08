import React from 'react';
import { Phase } from '../types';
import { Target, Lightbulb, Compass, ArrowRight, Play } from 'lucide-react';

interface PhaseViewProps {
  phase: Phase;
  onStart: () => void;
}

const PhaseView: React.FC<PhaseViewProps> = ({ phase, onStart }) => {
  return (
    <div className="max-w-4xl mx-auto py-10 px-6">
      <div className="mb-10 text-center">
        <span className="text-orange-500 font-bold tracking-widest text-xs uppercase mb-2 block">当前阶段</span>
        <h1 className="text-4xl font-extrabold text-gray-900 mb-4">{phase.title}</h1>
        <div className="h-1 w-20 bg-orange-500 mx-auto rounded-full"></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        {/* Card 1: Experience */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-4 text-blue-600">
            <Play size={20} fill="currentColor" />
          </div>
          <h3 className="font-bold text-gray-800 mb-2">你会体验什么</h3>
          <p className="text-gray-600 text-sm leading-relaxed">{phase.overview.experience}</p>
        </div>

        {/* Card 2: Gains */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
           <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-4 text-green-600">
            <Target size={20} />
          </div>
          <h3 className="font-bold text-gray-800 mb-2">你会收获什么</h3>
          <p className="text-gray-600 text-sm leading-relaxed">{phase.overview.gains}</p>
        </div>

        {/* Card 3: Necessity */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
           <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-4 text-purple-600">
            <Lightbulb size={20} />
          </div>
          <h3 className="font-bold text-gray-800 mb-2">为什么这很必要</h3>
          <p className="text-gray-600 text-sm leading-relaxed">{phase.overview.necessity}</p>
        </div>

        {/* Card 4: Journey */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
           <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center mb-4 text-orange-600">
            <Compass size={20} />
          </div>
          <h3 className="font-bold text-gray-800 mb-2">旅程概览</h3>
          <p className="text-gray-600 text-sm leading-relaxed">{phase.overview.journey}</p>
        </div>
      </div>

      <div className="flex justify-center">
        <button 
          onClick={onStart}
          className="group relative px-8 py-4 bg-gray-900 text-white font-bold rounded-full shadow-lg hover:bg-orange-600 transition-all hover:scale-105 flex items-center gap-3 overflow-hidden"
        >
          <span className="relative z-10">继续学习</span>
          <ArrowRight size={20} className="relative z-10 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  );
};

export default PhaseView;