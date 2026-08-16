import React, { useState } from 'react';
import { 
  AlertOctagon, 
  AlertTriangle, 
  Info, 
  Search, 
  Clock,
  Briefcase,
  Hospital,
  ShoppingBag,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle,
  X
} from 'lucide-react';

interface InterventionCandidate {
  id: string;
  priority: 'High' | 'Medium' | 'Low';
  priorityColor: string;
  clinicalRisk: string;
  sdohRisk: string;
  currentRisk: string;
  future6: string;
  future6Trend: 'up' | 'down' | 'flat';
  future12: string;
  future12Trend: 'up' | 'down' | 'flat';
  priorityScore: number;
  driver: string;
  intervention: string;
  status: string;
  statusColor: string;
}

const mockCandidates: InterventionCandidate[] = [
  {
    id: 'M-10231',
    priority: 'High',
    priorityColor: 'bg-error/10 text-error border-error/20',
    clinicalRisk: '84%',
    sdohRisk: '72%',
    currentRisk: '86%',
    future6: '88%',
    future6Trend: 'up',
    future12: '91%',
    future12Trend: 'up',
    priorityScore: 89,
    driver: 'Economic Stability',
    intervention: 'Economic Support',
    status: 'Suggested',
    statusColor: 'bg-slate-400'
  },
  {
    id: 'M-14592',
    priority: 'High',
    priorityColor: 'bg-error/10 text-error border-error/20',
    clinicalRisk: '78%',
    sdohRisk: '81%',
    currentRisk: '80%',
    future6: '84%',
    future6Trend: 'up',
    future12: '87%',
    future12Trend: 'up',
    priorityScore: 85,
    driver: 'Healthcare Access',
    intervention: 'Care Navigation',
    status: 'In Progress',
    statusColor: 'bg-blue-600'
  },
  {
    id: 'M-20384',
    priority: 'Medium',
    priorityColor: 'bg-amber-100 text-amber-800 border-amber-200',
    clinicalRisk: '65%',
    sdohRisk: '55%',
    currentRisk: '62%',
    future6: '62%',
    future6Trend: 'flat',
    future12: '61%',
    future12Trend: 'down',
    priorityScore: 60,
    driver: 'Food Insecurity',
    intervention: 'Food Access Prog.',
    status: 'Suggested',
    statusColor: 'bg-slate-400'
  }
];

const Interventions: React.FC = () => {
  const [selectedCandidate, setSelectedCandidate] = useState<InterventionCandidate | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('All');

  const handleOpenDrawer = (candidate: InterventionCandidate) => {
    setSelectedCandidate(candidate);
    setIsDrawerOpen(true);
  };

  const handleAction = (type: string) => {
    alert(`Intervention ${type}ed for member ${selectedCandidate?.id}`);
    setIsDrawerOpen(false);
  };

  const filteredCandidates = mockCandidates.filter(c => {
    const matchesSearch = c.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          c.driver.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPriority = priorityFilter === 'All' || c.priority === priorityFilter;
    return matchesSearch && matchesPriority;
  });

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold text-on-surface mb-1">Priority &amp; Interventions</h2>
        <p className="text-[13px] text-on-surface-variant font-medium">
          Review prioritized members and recommended intervention strategies based on combined clinical, social, and future risk factors.
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="glass-card p-5 flex flex-col justify-between border-t-4 border-t-error">
          <div className="flex justify-between items-start mb-4">
            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">High Priority</span>
            <AlertOctagon className="text-error w-5 h-5" />
          </div>
          <div>
            <div className="text-3xl font-extrabold text-on-surface">156</div>
            <div className="text-[11px] font-bold text-error mt-2 flex items-center gap-0.5">
              <TrendingUp className="w-3.5 h-3.5" /> +8.2% vs last month
            </div>
          </div>
        </div>

        <div className="glass-card p-5 flex flex-col justify-between border-t-4 border-t-amber-500">
          <div className="flex justify-between items-start mb-4">
            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Medium Priority</span>
            <AlertTriangle className="text-amber-600 w-5 h-5" />
          </div>
          <div>
            <div className="text-3xl font-extrabold text-on-surface">420</div>
            <div className="text-[11px] font-bold text-on-surface-variant mt-2 flex items-center gap-0.5">
              <Minus className="w-3.5 h-3.5" /> Stable vs last month
            </div>
          </div>
        </div>

        <div className="glass-card p-5 flex flex-col justify-between border-t-4 border-t-teal-500">
          <div className="flex justify-between items-start mb-4">
            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Low Priority</span>
            <Info className="text-teal-600 w-5 h-5" />
          </div>
          <div>
            <div className="text-3xl font-extrabold text-on-surface">1,120</div>
            <div className="text-[11px] font-bold text-teal-600 mt-2 flex items-center gap-0.5">
              <TrendingDown className="w-3.5 h-3.5" /> -4.2% vs last month
            </div>
          </div>
        </div>

        <div className="glass-card p-5 flex flex-col justify-between border-t-4 border-t-primary bg-primary/5">
          <div className="flex justify-between items-start mb-4">
            <span className="text-[11px] font-bold text-primary uppercase tracking-wider">Intervention Candidates</span>
            <Clock className="text-primary w-5 h-5" />
          </div>
          <div>
            <div className="text-3xl font-extrabold text-primary">156</div>
            <div className="text-[11px] font-bold text-primary mt-2 flex items-center gap-0.5">
              <CheckCircle className="w-3.5 h-3.5 text-primary" /> 42 completed this month
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
            placeholder="Search Member ID or Driver..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-3 py-1.5 border border-slate-200 rounded-md w-full bg-white text-sm focus:outline-none focus:border-primary outline-none"
          />
        </div>
        <select 
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="border border-slate-200 rounded-md px-3 py-1.5 bg-white text-sm text-on-surface-variant focus:outline-none focus:border-primary min-w-[140px]"
        >
          <option value="All">Priority: All</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
        <button 
          onClick={() => { setSearchQuery(''); setPriorityFilter('All'); }}
          className="px-4 py-1.5 text-sm font-bold text-primary hover:bg-primary/5 rounded-md transition-colors border border-transparent"
        >
          Reset Filters
        </button>
      </div>

      {/* Candidates Table */}
      <div className="glass-card overflow-hidden flex flex-col border border-slate-200/50">
        <div className="px-6 py-4 border-b border-slate-200/50 bg-white/40 backdrop-blur-sm">
          <h3 className="text-md font-bold text-on-surface">Members Requiring Intervention</h3>
        </div>
        <div className="overflow-x-auto w-full custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead className="text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold border-b border-slate-200/40 bg-slate-50/50">
              <tr>
                <th className="px-6 py-3">Priority</th>
                <th className="px-6 py-3">Member ID</th>
                <th className="px-6 py-3">Clinical Risk</th>
                <th className="px-6 py-3">SDOH Risk</th>
                <th className="px-6 py-3">CURRENT RISK (5-CLASS)</th>
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
              {filteredCandidates.map((candidate) => (
                <tr key={candidate.id} className="hover:bg-slate-50/30 transition-colors">
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${candidate.priorityColor}`}>
                      {candidate.priority}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-semibold text-primary">{candidate.id}</td>
                  <td className="px-6 py-4 font-medium">{candidate.clinicalRisk}</td>
                  <td className="px-6 py-4 font-medium">{candidate.sdohRisk}</td>
                  <td className="px-6 py-4 font-semibold">{candidate.currentRisk}</td>
                  
                  <td className="px-6 py-4 text-error font-medium">
                    <span className="flex items-center gap-0.5">
                      {candidate.future6}
                      {candidate.future6Trend === 'up' && <TrendingUp className="w-3.5 h-3.5" />}
                      {candidate.future6Trend === 'down' && <TrendingDown className="w-3.5 h-3.5" />}
                      {candidate.future6Trend === 'flat' && <Minus className="w-3.5 h-3.5" />}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-error font-medium">
                    <span className="flex items-center gap-0.5">
                      {candidate.future12}
                      {candidate.future12Trend === 'up' && <TrendingUp className="w-3.5 h-3.5" />}
                      {candidate.future12Trend === 'down' && <TrendingDown className="w-3.5 h-3.5" />}
                      {candidate.future12Trend === 'flat' && <Minus className="w-3.5 h-3.5" />}
                    </span>
                  </td>

                  <td className="px-6 py-4 font-extrabold text-lg text-primary">{candidate.priorityScore}</td>
                  <td className="px-6 py-4 font-semibold text-slate-700">{candidate.driver}</td>
                  <td className="px-6 py-4 font-medium text-slate-600">{candidate.intervention}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold text-white ${candidate.statusColor}`}>
                      {candidate.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => handleOpenDrawer(candidate)}
                      className="px-3.5 py-1 bg-primary text-white text-[12px] font-bold rounded-lg hover:bg-primary/95 transition-colors"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Section: Composition & Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Score Composition */}
        <div className="glass-card p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-md font-bold text-on-surface mb-1">Priority Score Composition</h3>
            <p className="text-[12px] text-on-surface-variant font-medium mb-4">How priority scores are calculated across the population.</p>
            <div className="space-y-3">
              <div className="flex justify-between text-[13px] font-semibold">
                <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Clinical Risk</span>
                <span>35% Weight</span>
              </div>
              <div className="flex justify-between text-[13px] font-semibold">
                <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-teal-500"></span> SDOH Risk</span>
                <span>25% Weight</span>
              </div>
              <div className="flex justify-between text-[13px] font-semibold">
                <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span> Future Risk</span>
                <span>40% Weight</span>
              </div>
            </div>
          </div>
          <div className="pt-4 border-t border-slate-200/50 mt-4 bg-slate-50/50 p-3 rounded-lg flex items-center justify-around text-center">
            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase">Clinical</div>
              <div className="font-bold">84%</div>
            </div>
            <span>+</span>
            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase">SDOH</div>
              <div className="font-bold">72%</div>
            </div>
            <span>+</span>
            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase">Future</div>
              <div className="font-bold">91%</div>
            </div>
            <span>=</span>
            <div className="text-primary">
              <div className="text-[10px] font-bold uppercase">Score</div>
              <div className="font-extrabold text-lg">89</div>
            </div>
          </div>
        </div>

        {/* Intervention Recommendations */}
        <div className="glass-card p-6 lg:col-span-2">
          <h3 className="text-md font-bold text-on-surface mb-3.5">Top Intervention Recommendations</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center gap-2 mb-2 text-primary font-bold text-[13.5px]">
                <Briefcase className="w-4 h-4 shrink-0" />
                <h4>Economic Support</h4>
              </div>
              <p className="text-[12px] text-on-surface-variant leading-relaxed mb-3">Connect members with financial assistance programs to stabilize housing and food needs.</p>
              <button className="text-[12px] font-bold text-primary hover:underline">View Suggested Actions →</button>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center gap-2 mb-2 text-teal-600 font-bold text-[13.5px]">
                <Hospital className="w-4 h-4 shrink-0" />
                <h4>Healthcare Access</h4>
              </div>
              <p className="text-[12px] text-on-surface-variant leading-relaxed mb-3">Assign care navigators and arrange transportation for missed preventative screenings.</p>
              <button className="text-[12px] font-bold text-primary hover:underline">View Suggested Actions →</button>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center gap-2 mb-2 text-orange-600 font-bold text-[13.5px]">
                <ShoppingBag className="w-4 h-4 shrink-0" />
                <h4>Food Access</h4>
              </div>
              <p className="text-[12px] text-on-surface-variant leading-relaxed mb-3">Enroll in meal delivery services or local pantry partnerships for chronic diet-related conditions.</p>
              <button className="text-[12px] font-bold text-primary hover:underline">View Suggested Actions →</button>
            </div>
          </div>
        </div>
      </div>

      {/* Sliding Drawer */}
      <div className={`fixed inset-0 z-50 transition-opacity duration-300 ${isDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setIsDrawerOpen(false)}></div>
        <aside className={`absolute right-0 top-0 h-full w-[400px] bg-white border-l border-slate-200 shadow-2xl flex flex-col z-50 transition-transform duration-300 ease-in-out ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          {selectedCandidate && (
            <>
              {/* Header */}
              <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50/50 shrink-0">
                <div>
                  <h3 className="text-lg font-bold text-on-surface">Member Risk &amp; Intervention Profile</h3>
                  <p className="text-[13px] text-primary font-bold">Member ID: {selectedCandidate.id}</p>
                </div>
                <button className="p-1.5 text-on-surface-variant hover:bg-slate-200/60 rounded-full transition-colors" onClick={() => setIsDrawerOpen(false)}>
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                {/* Risk Gauge Header */}
                <div className="flex justify-between items-end">
                  <div>
                    <div className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Priority Score</div>
                    <div className="text-3xl font-extrabold text-primary">{selectedCandidate.priorityScore}</div>
                  </div>
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-error/10 text-error text-[11px] font-bold border border-error/20 uppercase tracking-wider">
                    {selectedCandidate.priority} Priority
                  </span>
                </div>

                {/* Risk Trend Chart Mock */}
                <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-xl">
                  <h4 className="text-[12px] font-bold text-slate-700 mb-3">Risk Trend Forecast</h4>
                  <div className="flex items-end justify-around h-24 pb-2 border-b border-slate-200/30 relative">
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="w-10 bg-primary/20 hover:bg-primary/30 transition-all rounded-t h-12"></div>
                      <span className="text-[10px] font-semibold text-slate-500">Current ({selectedCandidate.currentRisk})</span>
                    </div>
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="w-10 bg-amber-300/40 hover:bg-amber-300/60 transition-all rounded-t h-16"></div>
                      <span className="text-[10px] font-semibold text-slate-500">6M ({selectedCandidate.future6})</span>
                    </div>
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="w-10 bg-error/20 hover:bg-error/30 transition-all rounded-t h-20"></div>
                      <span className="text-[10px] font-bold text-error">12M ({selectedCandidate.future12})</span>
                    </div>
                  </div>
                </div>

                {/* Primary Risk Drivers */}
                <div>
                  <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2.5">Primary Risk Drivers</h4>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="px-2.5 py-1 bg-slate-100 rounded-lg text-[12px] text-slate-700 font-bold border border-slate-200">{selectedCandidate.driver}</span>
                    <span className="px-2.5 py-1 bg-slate-100 rounded-lg text-[12px] text-slate-700 font-bold border border-slate-200">Housing Instability</span>
                    <span className="px-2.5 py-1 bg-slate-100 rounded-lg text-[12px] text-slate-700 font-bold border border-slate-200">Missed Appointments</span>
                  </div>
                </div>

                {/* Suggested Intervention Box */}
                <div>
                  <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2.5">Suggested Intervention</h4>
                  <div className="bg-primary/5 border border-primary/20 p-4 rounded-xl">
                    <div className="font-bold text-primary text-[14px] mb-1">{selectedCandidate.intervention} Program</div>
                    <p className="text-[12.5px] text-on-surface-variant leading-relaxed">
                      Member qualifies for urgent intervention and support services based on predictive chronic disease complications combined with social drivers.
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="p-4 border-t border-slate-200 bg-slate-50/50 shrink-0 flex gap-2">
                <button 
                  onClick={() => handleAction('Accept')}
                  className="flex-1 py-2.5 bg-primary text-white font-bold text-[13px] rounded-lg hover:bg-primary/95 transition-colors"
                >
                  Accept
                </button>
                <button 
                  onClick={() => handleAction('Modify')}
                  className="flex-1 py-2.5 bg-white border border-slate-200 text-on-surface text-[13px] font-bold rounded-lg hover:bg-slate-100/50 transition-colors"
                >
                  Modify
                </button>
                <button 
                  onClick={() => handleAction('Dismiss')}
                  className="py-2.5 px-3.5 text-error font-bold text-[13px] hover:bg-error/5 rounded-lg transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </>
          )}
        </aside>
      </div>

      {/* Disclaimer */}
      <footer className="pt-4 border-t border-slate-200/50 text-center pb-6">
        <p className="text-[11px] text-on-surface-variant font-semibold flex items-center justify-center gap-1">
          <Info className="w-3.5 h-3.5" />
          <span>
            <strong>Decision-Support Notice:</strong> Risk scores and suggested interventions are AI-generated based on available data and should be reviewed by a qualified healthcare professional before taking clinical action.
          </span>
        </p>
      </footer>
    </div>
  );
};

export default Interventions;
