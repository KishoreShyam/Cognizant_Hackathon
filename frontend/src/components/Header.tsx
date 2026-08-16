import React from 'react';
import { Bell } from 'lucide-react';

interface HeaderProps {
  title?: string;
  subtitle?: string;
}

const Header: React.FC<HeaderProps> = ({ 
  title = "Population Health Portal", 
  subtitle = "Real-time risk intelligence for better member outcomes" 
}) => {
  return (
    <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-8 py-4 sm:py-0 w-full h-auto sm:h-24 sticky top-0 z-40 bg-[#f0f4f8]/80 backdrop-blur-md border-b border-white/20 shrink-0 gap-4 sm:gap-0">
      {/* Title & Info */}
      <div className="flex flex-col">
        <h1 className="text-xl sm:text-2xl font-bold text-on-surface tracking-tight mb-0.5">
          {title}
        </h1>
        <p className="text-[12px] text-on-surface-variant font-medium">
          {subtitle}
        </p>
      </div>

      {/* Global Actions */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <button className="w-10 h-10 flex items-center justify-center bg-white/60 backdrop-blur-md border border-white/80 text-on-surface-variant hover:text-primary rounded-full hover:bg-white transition-all relative shadow-sm shrink-0 cursor-pointer">
          <Bell className="w-[18px] h-[18px]" />
          <span className="absolute top-1.5 right-1.5 w-4.5 h-4.5 bg-primary text-white text-[9px] font-bold flex items-center justify-center rounded-full border-2 border-white shadow-sm">
            3
          </span>
        </button>

        {/* Profile */}
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-container to-primary text-white flex items-center justify-center font-bold text-[13px] shadow-md border-2 border-white cursor-pointer hover:shadow-lg transition-all shrink-0">
          EA
        </div>
      </div>
    </header>
  );
};

export default Header;
