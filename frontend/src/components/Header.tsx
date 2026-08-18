import React from 'react';

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
      </div>
    </header>
  );
};

export default Header;
