import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Map, 
  BarChart3,
  CheckSquare, 
  Settings, 
  HelpCircle,
  ShieldAlert,
  LogOut,
  Upload
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';

const Sidebar: React.FC = () => {
  const navItems = [
    { path: '/', label: 'Overview', icon: LayoutDashboard },
    { path: '/members', label: 'Members', icon: Users },
    { path: '/upload', label: 'Upload Patient', icon: Upload },
    { path: '/map', label: 'Risk Map', icon: Map },
    { path: '/sdoh-analysis', label: 'SDOH Analysis', icon: BarChart3 },
    { path: '/interventions', label: 'Priority & Interventions', icon: CheckSquare },
    { path: '/community-interventions', label: 'Community Interventions', icon: ShieldAlert },
  ];

  return (
    <nav className="hidden md:flex flex-col h-screen w-72 fixed left-0 top-0 overflow-y-auto border-r border-slate-200/60 bg-white/80 backdrop-blur-xl z-50 transition-all duration-300 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
      <div className="py-8 px-6 flex flex-col h-full">
        {/* Brand Header */}
        <div className="flex items-center gap-3 mb-10 px-2">
          <img 
            src="/logo.jpg" 
            alt="CareSync Logo" 
            className="w-10 h-10 shrink-0 rounded-xl shadow-lg object-cover border border-slate-100" 
          />
          <div className="flex-1">
            <h1 className="text-base font-extrabold text-slate-800 tracking-tight leading-none">CareSync SDOH</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Healthcare Intelligence</p>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 flex flex-col gap-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200 group text-[14px] ${
                    isActive
                      ? 'bg-primary/10 text-primary font-bold shadow-sm border-l-4 border-primary'
                      : 'text-on-surface-variant hover:bg-slate-100/60 hover:text-primary'
                  }`
                }
              >
                <Icon className="w-5 h-5 shrink-0 transition-transform group-hover:scale-105" />
                <span className="flex-1">{item.label}</span>
              </NavLink>
            );
          })}
        </div>

        {/* Footer Links */}
        <div className="mt-auto pt-6 border-t border-slate-200/40 flex flex-col gap-1.5">
          <a href="#" className="flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:bg-slate-100/60 hover:text-primary transition-colors rounded-xl font-medium text-[14px]">
            <Settings className="w-5 h-5 shrink-0" />
            <span>Settings</span>
          </a>
          <a href="#" className="flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:bg-slate-100/60 hover:text-primary transition-colors rounded-xl font-medium text-[14px]">
            <HelpCircle className="w-5 h-5 shrink-0" />
            <span>Support</span>
          </a>
          <button 
            onClick={() => signOut(auth)}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 transition-colors rounded-xl font-medium text-[14px] cursor-pointer text-left"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Sidebar;
