import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  Calendar, 
  Bell, 
  ChevronDown, 
  X, 
  User, 
  MapPin, 
  ArrowRight,
  ShieldAlert,
  Loader2
} from 'lucide-react';

interface HeaderProps {
  title?: string;
  subtitle?: string;
}

interface MemberSuggestion {
  id: string;
  patient_id: string;
  county: string;
  tract_fips: string;
  priority: string;
  priorityColor: string;
  future_risk_5: {
    level: string;
  };
  driver: string;
  conditions?: string[];
}

const Header: React.FC<HeaderProps> = ({ 
  title = "Population Health Portal", 
  subtitle = "Real-time risk intelligence for better member outcomes" 
}) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [members, setMembers] = useState<MemberSuggestion[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Dynamically compute the real-time date window
  const currentDateFormatted = useMemo(() => {
    const now = new Date();
    const past7Days = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    const startStr = past7Days.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${startStr} – ${endStr}`;
  }, []);

  // Fetch lightweight members for global search indexing
  useEffect(() => {
    let isMounted = true;
    const fetchSearchIndex = async () => {
      try {
        setIsLoadingMembers(true);
        const res = await fetch('http://127.0.0.1:8000/api/members/').catch(() =>
          fetch('/api/members/')
        );
        if (res.ok && isMounted) {
          const data = await res.json();
          setMembers(data.members || []);
        }
      } catch (err) {
        console.error('Failed to load global search index:', err);
      } finally {
        if (isMounted) setIsLoadingMembers(false);
      }
    };

    fetchSearchIndex();
    return () => { isMounted = false; };
  }, []);

  // Close dropdown on click outside or Esc key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      } else if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        const inputEl = searchContainerRef.current?.querySelector('input');
        inputEl?.focus();
        setIsOpen(true);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Filter matching suggestions
  const matchingMembers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return [];

    return members.filter((m) => {
      const matchId = m.id.toLowerCase().includes(q) || m.patient_id.toLowerCase().includes(q);
      const matchCounty = m.county && m.county.toLowerCase().includes(q);
      const matchTract = m.tract_fips && m.tract_fips.includes(q);
      const matchRisk = m.future_risk_5?.level && m.future_risk_5.level.toLowerCase().includes(q);
      const matchDriver = m.driver && m.driver.toLowerCase().includes(q);
      const matchConditions = m.conditions && m.conditions.some(c => c.toLowerCase().includes(q));

      return matchId || matchCounty || matchTract || matchRisk || matchDriver || matchConditions;
    }).slice(0, 6); // Top 6 matches
  }, [searchQuery, members]);

  const handleSelectMember = (memberId: string) => {
    setIsOpen(false);
    setSearchQuery('');
    navigate(`/members?id=${memberId}`);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    // If exact single match or first match exists
    if (matchingMembers.length === 1) {
      handleSelectMember(matchingMembers[0].id);
    } else {
      setIsOpen(false);
      navigate(`/members?id=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

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
      <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
        {/* Global Search Bar */}
        <div ref={searchContainerRef} className="relative flex-1 sm:flex-none">
          <form onSubmit={handleSearchSubmit} className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant w-4 h-4 pointer-events-none" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => {
                if (searchQuery.trim()) setIsOpen(true);
              }}
              placeholder="Search member, ID, county, risk..." 
              className="w-full sm:w-72 bg-white/70 backdrop-blur-md border border-white/90 rounded-full py-2 pl-10 pr-9 text-[13px] text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-sm transition-all focus:bg-white"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setIsOpen(false);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </form>

          {/* Autocomplete Search Dropdown */}
          {isOpen && searchQuery.trim().length > 0 && (
            <div className="absolute left-0 right-0 sm:right-auto sm:w-96 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-200/80 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="p-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <span>Matching Patient Records ({matchingMembers.length})</span>
                {isLoadingMembers && <Loader2 className="w-3 h-3 text-primary animate-spin" />}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 custom-scrollbar">
                {matchingMembers.length > 0 ? (
                  matchingMembers.map((member) => {
                    const level5 = member.future_risk_5?.level || 'Low';
                    const riskBadgeStyle = 
                      level5 === 'Critical' ? 'bg-error/10 text-error border-error/20' :
                      level5 === 'High' ? 'bg-rose-100 text-rose-800 border-rose-200' :
                      level5 === 'Moderate' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                      'bg-teal-100 text-teal-800 border-teal-200';

                    return (
                      <div
                        key={member.id}
                        onClick={() => handleSelectMember(member.id)}
                        className="p-3.5 hover:bg-slate-50 transition-colors cursor-pointer flex flex-col gap-1.5 group"
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold">
                              <User className="w-3.5 h-3.5" />
                            </div>
                            <span className="font-bold text-primary text-[13px] group-hover:underline">
                              {member.id}
                            </span>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${riskBadgeStyle}`}>
                            {level5} (5-Class)
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-[11px] text-slate-600 pl-8">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{member.county || 'California'} • Tract {member.tract_fips}</span>
                        </div>

                        <div className="text-[11px] text-slate-500 pl-8 flex justify-between items-center">
                          <span className="truncate max-w-[220px]">Driver: {member.driver}</span>
                          <span className="text-primary font-bold text-[11px] flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            Analyze <ArrowRight className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-6 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                    <ShieldAlert className="w-6 h-6 text-slate-300" />
                    <span>No members found matching "{searchQuery}"</span>
                  </div>
                )}
              </div>

              {matchingMembers.length > 0 && (
                <div 
                  onClick={handleSearchSubmit}
                  className="p-2.5 bg-slate-50 border-t border-slate-100 text-center text-[11px] font-bold text-primary hover:bg-primary/5 transition-colors cursor-pointer"
                >
                  Press Enter to view all results in Members Workspace ➔
                </div>
              )}
            </div>
          )}
        </div>

        {/* Real-Time Date Indicator */}
        <div className="flex items-center gap-2 bg-white/60 backdrop-blur-md border border-white/80 rounded-full py-2 px-4 text-[13px] font-semibold text-on-surface shadow-sm hover:bg-white transition-all shrink-0 cursor-default">
          <Calendar className="text-primary w-4 h-4" />
          <span>{currentDateFormatted}</span>
          <ChevronDown className="text-on-surface-variant w-4 h-4" />
        </div>

        {/* Notifications */}
        <button className="w-10 h-10 flex items-center justify-center bg-white/60 backdrop-blur-md border border-white/80 text-on-surface-variant hover:text-primary rounded-full hover:bg-white transition-all relative shadow-sm shrink-0">
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
