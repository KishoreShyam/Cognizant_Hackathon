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
  LogOut
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';

const Sidebar: React.FC = () => {
  const navItems = [
    { path: '/', label: 'Overview', icon: LayoutDashboard },
    { path: '/members', label: 'Members', icon: Users },
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
          <div className="w-10 h-10 shrink-0 bg-gradient-to-br from-primary-container to-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
            <ShieldAlert className="text-white w-6 h-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-on-surface tracking-tight leading-tight">HealthMetrics</h1>
            <p className="text-[12px] text-on-surface-variant font-medium">Enterprise Admin</p>
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
