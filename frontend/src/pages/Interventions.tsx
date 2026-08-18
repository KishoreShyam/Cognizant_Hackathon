import React, { useState, useEffect } from 'react';
import { 
  AlertOctagon, 
  AlertTriangle, 
  Info, 
  Search, 
  Clock,
  TrendingUp,
  Minus,
  CheckCircle,
  X,
  Loader2
} from 'lucide-react';

interface InterventionCandidate {
  id: string;
  name?: string;
  priority: string;
  priorityColor: string;
  clinicalRisk: string;
  sdohRisk: string;
  currentRisk: string;
  future_risk_5: string;
  future_risk_3: string;
  future6: string;
  future6Trend: 'up' | 'down' | 'flat';
  future12: string;
  future12Trend: 'up' | 'down' | 'flat';
  priorityScore: number;
  driver: string;
  driver_type: string;
  intervention: string;
  action_headline: string;
  status: string;
  statusColor: string;
  county: string;
  tract_fips: string;
}

interface InterventionsApiResponse {
  summary: {
    total_candidates: number;
    high_priority: number;
    sdoh_driven: number;
    suggested_count: number;
  };
  candidates: InterventionCandidate[];
}

const Interventions: React.FC = () => {
  const [candidates, setCandidates] = useState<InterventionCandidate[]>([]);
  const [summary, setSummary] = useState<{ total_candidates: number; high_priority: number; sdoh_driven: number; suggested_count: number }>({
    total_candidates: 0,
    high_priority: 0,
    sdoh_driven: 0,
    suggested_count: 0
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedCandidate, setSelectedCandidate] = useState<InterventionCandidate | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('All');

  const fetchInterventions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('http://127.0.0.1:8000/api/interventions/');
      if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
      const json: InterventionsApiResponse = await res.json();
      setCandidates(json.candidates);
      setSummary(json.summary);
    } catch (err: any) {
      console.error('Error fetching interventions:', err);
      try {
        const resFallback = await fetch('/api/interventions/');
        if (resFallback.ok) {
          const json: InterventionsApiResponse = await resFallback.json();
          setCandidates(json.candidates);
          setSummary(json.summary);
          return;
        }
      } catch {}
      setError(err.message || 'Unable to connect to interventions API');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInterventions();
  }, []);

  const handleOpenDrawer = (candidate: InterventionCandidate) => {
    setSelectedCandidate(candidate);
    setIsDrawerOpen(true);
  };

  const handleAction = (type: string) => {
    alert(`Intervention ${type}ed for member ${selectedCandidate?.id}`);
    setIsDrawerOpen(false);
  };

  const filteredCandidates = candidates.filter(c => {
    const matchesSearch = c.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          c.driver.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          c.intervention.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPriority = priorityFilter === 'All' || c.priority === priorityFilter;
    return matchesSearch && matchesPriority;
  });

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold text-on-surface mb-1">Priority &amp; Interventions</h2>
        <p className="text-[13px] text-on-surface-variant font-medium">
          Review prioritized members and targeted intervention strategies based on real TreeSHAP drivers and future risk forecasts.
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between text-red-800 text-[13px]">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button 
            onClick={fetchInterventions}
            className="px-3 py-1 bg-red-600 text-white font-bold text-[12px] rounded-lg hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="glass-card p-5 flex flex-col justify-between border-t-4 border-t-error">
          <div className="flex justify-between items-start mb-4">
            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">High / Critical Priority</span>
            <AlertOctagon className="text-error w-5 h-5" />
          </div>
          <div>
            <div className="text-3xl font-extrabold text-on-surface">{summary.high_priority}</div>
            <div className="text-[11px] font-bold text-error mt-2 flex items-center gap-0.5">
              <TrendingUp className="w-3.5 h-3.5" /> High future risk members
            </div>
          </div>
        </div>

        <div className="glass-card p-5 flex flex-col justify-between border-t-4 border-t-primary">
          <div className="flex justify-between items-start mb-4">
            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">SDOH-Driven Need</span>
            <AlertTriangle className="text-primary w-5 h-5" />
          </div>
          <div>
            <div className="text-3xl font-extrabold text-on-surface">{summary.sdoh_driven}</div>
            <div className="text-[11px] font-bold text-primary mt-2 flex items-center gap-0.5">
              <Minus className="w-3.5 h-3.5" /> Social barrier dominance
            </div>
          </div>
        </div>

        <div className="glass-card p-5 flex flex-col justify-between border-t-4 border-t-teal-500">
          <div className="flex justify-between items-start mb-4">
            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Total Enrolled Cohort</span>
            <Info className="text-teal-600 w-5 h-5" />
          </div>
          <div>
            <div className="text-3xl font-extrabold text-on-surface">{summary.total_candidates}</div>
            <div className="text-[11px] font-bold text-teal-600 mt-2 flex items-center gap-0.5">
              <CheckCircle className="w-3.5 h-3.5" /> 100% active monitoring
            </div>
          </div>
        </div>

        <div className="glass-card p-5 flex flex-col justify-between border-t-4 border-t-primary bg-primary/5">
          <div className="flex justify-between items-start mb-4">
            <span className="text-[11px] font-bold text-primary uppercase tracking-wider">Suggested Care Pathways</span>
            <Clock className="text-primary w-5 h-5" />
          </div>
          <div>
            <div className="text-3xl font-extrabold text-primary">{summary.suggested_count}</div>
            <div className="text-[11px] font-bold text-primary mt-2 flex items-center gap-0.5">
              <CheckCircle className="w-3.5 h-3.5 text-primary" /> Ready for outreach
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="glass-card p-4 flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant w-[16px] h-[16px]" />
          <input 
            type="text" 
            placeholder="Search Member ID, Driver, or Intervention..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-3 py-1.5 border border-slate-200 rounded-md w-full bg-white text-sm focus:outline-none focus:border-primary outline-none"
          />
        </div>
        <select 
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="border border-slate-200 rounded-md px-3 py-1.5 bg-white text-sm text-on-surface-variant focus:outline-none focus:border-primary min-w-[140px] cursor-pointer"
        >
          <option value="All">Priority: All</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Moderate">Moderate</option>
          <option value="Low">Low</option>
          <option value="Very Low">Very Low</option>
        </select>
        <button 
          onClick={() => { setSearchQuery(''); setPriorityFilter('All'); }}
          className="px-4 py-1.5 text-sm font-bold text-primary hover:bg-primary/5 rounded-md transition-colors border border-transparent cursor-pointer"
        >
          Reset Filters
        </button>
      </div>

      {/* Candidates Table */}
      <div className="glass-card overflow-hidden flex flex-col border border-slate-200/50">
        <div className="px-6 py-4 border-b border-slate-200/50 bg-white/40 backdrop-blur-sm flex justify-between items-center">
          <h3 className="text-md font-bold text-on-surface">Members Requiring Intervention</h3>
          <span className="text-[12px] text-slate-500 font-medium">{filteredCandidates.length} candidate{filteredCandidates.length === 1 ? '' : 's'}</span>
        </div>
        
        <div className="overflow-x-auto w-full custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead className="text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold border-b border-slate-200/40 bg-slate-50/50">
              <tr>
                <th className="px-6 py-3">Priority</th>
                <th className="px-6 py-3">Member ID</th>
                <th className="px-6 py-3">SDOH Risk</th>
                <th className="px-6 py-3">FUTURE RISK (5-CLASS)</th>
                <th className="px-6 py-3">6M Future</th>
                <th className="px-6 py-3">12M Future</th>
                <th className="px-6 py-3 font-bold text-primary">Priority Score</th>
                <th className="px-6 py-3">Primary Driver</th>
                <th className="px-6 py-3">Intervention</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="text-[13px] bg-white/20 divide-y divide-slate-100">
              {isLoading && (
                <tr>
                  <td colSpan={11} className="text-center py-16 text-on-surface-variant font-medium">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <Loader2 className="w-7 h-7 text-primary animate-spin" />
                      <span>Loading intervention candidates...</span>
                    </div>
                  </td>
                </tr>
              )}

              {!isLoading && filteredCandidates.map((candidate) => (
                <tr key={candidate.id} className="hover:bg-slate-50/30 transition-colors">
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${candidate.priorityColor}`}>
                      {candidate.priority}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-900 text-[13px]">{candidate.name || candidate.id}</span>
                      <span className="text-[11px] font-mono text-primary font-semibold">{candidate.id}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-medium">{candidate.sdohRisk}</td>
                  <td className="px-6 py-4 font-bold text-error">{candidate.future_risk_5}</td>
                  <td className="px-6 py-4">
                    <span className="font-semibold text-error/80">{candidate.future6}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-semibold text-error/80">{candidate.future12}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-bold text-primary text-base">{candidate.priorityScore}</span>
                  </td>
                  <td className="px-6 py-4 text-on-surface font-medium leading-tight max-w-[200px]">
                    {candidate.driver}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold bg-primary/10 text-primary border border-primary/20 whitespace-nowrap">
                      {candidate.intervention}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <span className={`w-2 h-2 rounded-full ${candidate.statusColor}`}></span>
                      <span className="text-on-surface-variant font-medium">{candidate.status}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => handleOpenDrawer(candidate)}
                      className="text-primary bg-white border border-primary/20 hover:bg-primary hover:text-white px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Assign
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Intervention Drawer Modal */}
      {isDrawerOpen && selectedCandidate && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" 
            onClick={() => setIsDrawerOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col">
              {/* Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h3 className="text-lg font-bold text-on-surface flex items-center gap-2">
                    {selectedCandidate.name || selectedCandidate.id}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${selectedCandidate.priorityColor}`}>
                      {selectedCandidate.priority}
                    </span>
                  </h3>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Member ID: {selectedCandidate.id} • Census Tract {selectedCandidate.tract_fips} • {selectedCandidate.county}
                  </p>
                </div>
                <button 
                  onClick={() => setIsDrawerOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-200/60 text-on-surface-variant transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-6">
                {/* Risk Overview Card */}
                <div className="glass-panel p-4 rounded-xl bg-slate-50 border border-slate-100 flex flex-col gap-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Recommended Action</span>
                  <div className="text-sm font-bold text-primary bg-primary/10 p-3 rounded-lg border border-primary/20">
                    {selectedCandidate.intervention}
                  </div>
                  <p className="text-xs text-on-surface-variant">
                    {selectedCandidate.action_headline}
                  </p>
                </div>

                {/* Driver Details */}
                <div>
                  <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Primary Risk Driver</h4>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-error/10 text-error flex items-center justify-center shrink-0 mt-0.5">
                      <AlertOctagon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-on-surface">{selectedCandidate.driver}</div>
                      <div className="text-xs text-on-surface-variant mt-0.5">Dominant factor identified via CatBoost TreeSHAP</div>
                    </div>
                  </div>
                </div>

                {/* Intervention Form */}
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="text-xs font-bold text-on-surface block mb-1.5">Assign Care Coordinator</label>
                    <select className="w-full text-sm border border-slate-200 rounded-lg p-2.5 bg-white focus:outline-none focus:border-primary outline-none">
                      <option>Community Health Worker (Assigned)</option>
                      <option>Nurse Care Manager</option>
                      <option>Social Services Specialist</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-on-surface block mb-1.5">Target Completion Date</label>
                    <input 
                      type="date" 
                      defaultValue="2026-09-01" 
                      className="w-full text-sm border border-slate-200 rounded-lg p-2.5 bg-white focus:outline-none focus:border-primary outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-on-surface block mb-1.5">Action Plan Notes</label>
                    <textarea 
                      rows={3} 
                      placeholder="Add tailored clinical and social engagement notes..." 
                      className="w-full text-sm border border-slate-200 rounded-lg p-2.5 bg-white focus:outline-none focus:border-primary outline-none resize-none"
                      defaultValue={`Initiate outreach for ${selectedCandidate.intervention} addressing ${selectedCandidate.driver}.`}
                    />
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex gap-3">
                <button 
                  onClick={() => handleAction('Reject')}
                  className="flex-1 py-2.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Dismiss
                </button>
                <button 
                  onClick={() => handleAction('Approv')}
                  className="flex-1 py-2.5 text-xs font-bold text-white bg-primary rounded-lg hover:bg-primary-hover transition-colors shadow-sm cursor-pointer"
                >
                  Assign &amp; Launch
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Interventions;
