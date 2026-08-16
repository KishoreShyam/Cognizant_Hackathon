import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Users, 
  Search, 
  X, 
  Home, 
  HeartPulse, 
  ArrowRight,
  AlertTriangle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface Member {
  id: string;
  priority: 'High' | 'Medium' | 'Low';
  priorityColor: string;
  clinicalRisk: number;
  sdohRisk: number;
  futureRisk: number;
  driver: string;
  status: string;
  statusColor: string;
  conditions: string[];
  edVisits: number;
  ipVisits: number;
  details: string[];
}

const mockMembers: Member[] = [
  { 
    id: 'M-10231', 
    priority: 'High', 
    priorityColor: 'bg-error/10 text-error border-error/20',
    clinicalRisk: 84, 
    sdohRisk: 72, 
    futureRisk: 89, 
    driver: 'Housing Instability', 
    status: 'Needs Review',
    statusColor: 'bg-tertiary',
    conditions: ['Diabetes Type II', 'Hypertension', 'Stage 3 CKD'],
    edVisits: 2,
    ipVisits: 1,
    details: ['Multiple chronic conditions', 'Recent address changes indicated in record', '2 visits in last 3 months']
  },
  { 
    id: 'M-44290', 
    priority: 'Medium', 
    priorityColor: 'bg-amber-100 text-amber-800 border-amber-200',
    clinicalRisk: 65, 
    sdohRisk: 58, 
    futureRisk: 71, 
    driver: 'Medication Adherence', 
    status: 'Active',
    statusColor: 'bg-secondary',
    conditions: ['Asthma', 'COPD'],
    edVisits: 1,
    ipVisits: 0,
    details: ['High controller medication gaps', 'Economic instability affects drug access', '1 ED visit in last 6 months']
  },
  { 
    id: 'M-88102', 
    priority: 'High', 
    priorityColor: 'bg-error/10 text-error border-error/20',
    clinicalRisk: 88, 
    sdohRisk: 42, 
    futureRisk: 92, 
    driver: 'Cardiovascular Vulnerability', 
    status: 'Needs Review',
    statusColor: 'bg-tertiary',
    conditions: ['Heart Failure', 'Atrial Fibrillation'],
    edVisits: 4,
    ipVisits: 2,
    details: ['Severe ejection fraction decline', 'Transportation barrier to cardiology clinic', 'Frequent inpatient readmissions']
  },
  { 
    id: 'M-20384', 
    priority: 'Low', 
    priorityColor: 'bg-teal-100 text-teal-800 border-teal-200',
    clinicalRisk: 35, 
    sdohRisk: 22, 
    futureRisk: 40, 
    driver: 'Food Access', 
    status: 'Active',
    statusColor: 'bg-secondary',
    conditions: ['Prediabetes'],
    edVisits: 0,
    ipVisits: 0,
    details: ['Limited access to fresh produce', 'Participating in local nutrition outreach', 'Stable clinical vitals']
  }
];

const Members: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const memberIdParam = searchParams.get('id');

  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState('All');
  const [driverFilter, setDriverFilter] = useState('All');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Set selected member from URL query param if present
  useEffect(() => {
    if (memberIdParam) {
      const found = mockMembers.find(m => m.id === memberIdParam);
      if (found) {
        setSelectedMember(found);
        setIsDrawerOpen(true);
      }
    }
  }, [memberIdParam]);

  const handleOpenDrawer = (member: Member) => {
    setSelectedMember(member);
    setIsDrawerOpen(true);
    setSearchParams({ id: member.id });
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setSearchParams({});
  };

  const filteredMembers = mockMembers.filter(m => {
    const matchesSearch = m.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          m.driver.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesRisk = riskFilter === 'All' || m.priority === riskFilter;
    
    const matchesDriver = driverFilter === 'All' || 
      (driverFilter === 'Clinical' && m.clinicalRisk > m.sdohRisk) ||
      (driverFilter === 'SDOH' && m.sdohRisk >= m.clinicalRisk);

    return matchesSearch && matchesRisk && matchesDriver;
  });

  const handleCareCoordination = () => {
    alert(`Care coordination workflow initiated for ${selectedMember?.id}.`);
  };

  return (
    <div className="flex flex-col gap-6 w-full relative">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-on-surface mb-1">Members Risk Prioritization</h1>
        <p className="text-[13px] text-on-surface-variant font-medium">
          Identify and prioritize members using clinical, social, and future risk signals.
        </p>
      </div>

      {/* Member Intelligence Summary */}
      <div className="glass-card rounded-xl p-6 flex flex-wrap items-center justify-between gap-6 border border-slate-200/50">
        <div className="flex items-center gap-4 border-r border-slate-200/60 pr-8">
          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Total High Priority Members</p>
            <p className="text-2xl font-bold text-on-surface">1,240</p>
          </div>
        </div>
        <div className="flex-1 flex justify-around gap-4 min-w-[280px]">
          <div className="flex flex-col">
            <span className="text-[12px] font-medium text-on-surface-variant">Clinical Risk Dominant</span>
            <span className="text-lg font-bold text-error">54%</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[12px] font-medium text-on-surface-variant">SDOH Risk Dominant</span>
            <span className="text-lg font-bold text-tertiary">31%</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[12px] font-medium text-on-surface-variant">Combined Risk Elevated</span>
            <span className="text-lg font-bold text-primary">15%</span>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="glass-card rounded-xl p-4 flex flex-wrap items-center gap-4 border border-slate-200/50">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant w-[16px] h-[16px]" />
          <input 
            type="text" 
            placeholder="Search by ID or Driver..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-[13px] text-on-surface outline-none"
          />
        </div>
        <select 
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value)}
          className="py-2 pl-3 pr-8 bg-white rounded-lg border border-slate-200 text-[13px] text-on-surface outline-none focus:border-primary"
        >
          <option value="All">Risk Level: All</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
        <select 
          value={driverFilter}
          onChange={(e) => setDriverFilter(e.target.value)}
          className="py-2 pl-3 pr-8 bg-white rounded-lg border border-slate-200 text-[13px] text-on-surface outline-none focus:border-primary"
        >
          <option value="All">Primary Driver: All</option>
          <option value="Clinical">Clinical Dominant</option>
          <option value="SDOH">SDOH Dominant</option>
        </select>
        <div className="flex gap-2 ml-auto">
          <button 
            onClick={() => { setSearchQuery(''); setRiskFilter('All'); setDriverFilter('All'); }}
            className="px-4 py-2 text-primary font-bold text-[13px] hover:bg-primary/5 rounded-lg transition-all"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="glass-card rounded-xl border border-slate-200/50 overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200/50 bg-white/40 backdrop-blur-sm">
          <h3 className="text-md font-bold text-on-surface">Members Requiring Attention</h3>
        </div>
        <div className="overflow-x-auto w-full custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold border-b border-slate-200/40 bg-slate-50/50">
              <tr>
                <th className="py-3.5 px-6">Priority</th>
                <th className="py-3.5 px-4">Member ID</th>
                <th className="py-3.5 px-4">Clinical Risk</th>
                <th className="py-3.5 px-4">SDOH Risk</th>
                <th className="py-3.5 px-4">Future Risk</th>
                <th className="py-3.5 px-4">Primary Driver</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="text-[13px] divide-y divide-slate-100 bg-white/20">
              {filteredMembers.map((member) => (
                <tr key={member.id} className="hover:bg-slate-50/30 transition-colors group">
                  <td className="py-4 px-6">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${member.priorityColor}`}>
                      {member.priority}
                    </span>
                  </td>
                  <td className="py-4 px-4 font-semibold text-primary">{member.id}</td>
                  
                  {/* Clinical risk progress bar */}
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-700 w-8">{member.clinicalRisk}%</span>
                      <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden shrink-0">
                        <div className="h-full bg-error rounded-full" style={{ width: `${member.clinicalRisk}%` }}></div>
                      </div>
                    </div>
                  </td>

                  {/* SDOH Risk progress bar */}
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-700 w-8">{member.sdohRisk}%</span>
                      <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden shrink-0">
                        <div className="h-full bg-tertiary rounded-full" style={{ width: `${member.sdohRisk}%` }}></div>
                      </div>
                    </div>
                  </td>

                  {/* Future Risk progress bar */}
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-700 w-8">{member.futureRisk}%</span>
                      <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden shrink-0">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${member.futureRisk}%` }}></div>
                      </div>
                    </div>
                  </td>

                  <td className="py-4 px-4 font-medium text-on-surface">{member.driver}</td>
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${member.statusColor}`}></span>
                      <span className="text-on-surface-variant font-medium">{member.status}</span>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <button 
                      onClick={() => handleOpenDrawer(member)}
                      className="px-3.5 py-1.5 border border-primary text-primary font-bold text-[12px] rounded-lg hover:bg-primary hover:text-white transition-colors"
                    >
                      Analyze
                    </button>
                  </td>
                </tr>
              ))}
              {filteredMembers.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-on-surface-variant font-medium">
                    No members match search criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-slate-200/50 flex justify-between items-center bg-slate-50/50 text-[12px]">
          <span className="text-on-surface-variant font-semibold">Showing {filteredMembers.length} of {mockMembers.length} members</span>
          <div className="flex gap-1.5">
            <button className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-on-surface-variant hover:bg-slate-100 disabled:opacity-50" disabled>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary text-white font-bold">1</button>
            <button className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-on-surface-variant hover:bg-slate-100 disabled:opacity-50" disabled>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Sliding Side Panel (Drawer) */}
      <div className={`fixed inset-0 z-50 transition-opacity duration-300 ${isDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={handleCloseDrawer}></div>
        <aside className={`absolute right-0 top-0 h-full w-[400px] bg-white border-l border-slate-200 shadow-2xl flex flex-col z-50 transition-transform duration-300 ease-in-out ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          {selectedMember && (
            <>
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-slate-50/50 shrink-0">
                <div>
                  <h3 className="text-lg font-bold text-on-surface">Member Risk Profile</h3>
                  <p className="text-[13px] text-primary font-bold">{selectedMember.id}</p>
                </div>
                <button className="p-1.5 text-on-surface-variant hover:bg-slate-200/60 rounded-full transition-colors" onClick={handleCloseDrawer}>
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                {/* Risk Scores Grid */}
                <div>
                  <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-3">Risk Composition</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex flex-col items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-lg font-bold text-error">{selectedMember.clinicalRisk}%</span>
                      <span className="text-[11px] font-bold text-on-surface-variant mt-0.5">Clinical</span>
                    </div>
                    <div className="flex flex-col items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-lg font-bold text-tertiary">{selectedMember.sdohRisk}%</span>
                      <span className="text-[11px] font-bold text-on-surface-variant mt-0.5">Social</span>
                    </div>
                    <div className="flex flex-col items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-lg font-bold text-primary">{selectedMember.futureRisk}%</span>
                      <span className="text-[11px] font-bold text-on-surface-variant mt-0.5">Future</span>
                    </div>
                  </div>
                </div>

                {/* Chronic Conditions */}
                <div>
                  <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-3">Active Diagnosis</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedMember.conditions.map((c, i) => (
                      <span key={i} className="px-2.5 py-1 bg-primary/5 text-primary text-[12px] font-semibold border border-primary/10 rounded-md">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Utilization stats */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                    <span className="block text-2xl font-bold text-on-surface">{selectedMember.edVisits}</span>
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase">ED Visits (12M)</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                    <span className="block text-2xl font-bold text-on-surface">{selectedMember.ipVisits}</span>
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase">Inpatient admissions</span>
                  </div>
                </div>

                {/* Drivers list */}
                <div>
                  <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-3">Primary Risk Drivers</h4>
                  <ul className="space-y-3">
                    {selectedMember.details.map((detail, idx) => (
                      <li key={idx} className="flex gap-3 items-start bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                        {idx === 0 ? <AlertTriangle className="w-5 h-5 text-error shrink-0 mt-0.5" /> :
                         idx === 1 ? <Home className="w-5 h-5 text-tertiary shrink-0 mt-0.5" /> :
                         <HeartPulse className="w-5 h-5 text-primary shrink-0 mt-0.5" />}
                        <div>
                          <p className="text-[13px] text-on-surface font-bold leading-tight">{idx === 0 ? 'Clinical Severity' : idx === 1 ? 'Social Barrier' : 'Utilization Signal'}</p>
                          <p className="text-[12px] text-on-surface-variant mt-1 leading-normal">{detail}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Action buttons */}
              <div className="p-6 border-t border-slate-200 bg-slate-50/50 shrink-0">
                <h4 className="text-[12px] font-bold text-on-surface-variant mb-2.5">Recommended Actions</h4>
                <button 
                  onClick={handleCareCoordination}
                  className="w-full py-3 bg-primary text-white rounded-xl font-bold text-[13px] hover:bg-primary/95 transition-colors flex items-center justify-center gap-2 shadow-sm"
                >
                  <span>Initiate Care Coordination</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
};

export default Members;
