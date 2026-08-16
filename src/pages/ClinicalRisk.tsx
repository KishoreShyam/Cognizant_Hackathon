import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Heart, 
  AlertOctagon, 
  Plus, 
  ArrowRight,
  TrendingDown,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Activity,
  FileText,
  Clock,
  X
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface ClinicalCohortMember {
  id: string;
  score: number;
  conditions: string[];
  utilization: string;
  driver: string;
  status: 'Critical' | 'Elevated';
  edVisits: number;
  ipVisits: number;
  prescriptions: number;
}

const mockCohort: ClinicalCohortMember[] = [
  { id: 'M-10231', score: 84, conditions: ['Type 2 Diabetes', 'Hypertension', 'Stage 3 CKD', 'Neuropathy'], utilization: '3 / 1', driver: 'Multiple Chronic Conditions', status: 'Critical', edVisits: 3, ipVisits: 1, prescriptions: 9 },
  { id: 'M-45920', score: 79, conditions: ['Heart Failure', 'COPD'], utilization: '2 / 2', driver: 'Recent Hospitalization', status: 'Critical', edVisits: 2, ipVisits: 2, prescriptions: 6 },
  { id: 'M-88214', score: 65, conditions: ['Obesity', 'Asthma'], utilization: '4 / 0', driver: 'Frequent ED Utilization', status: 'Elevated', edVisits: 4, ipVisits: 0, prescriptions: 4 },
  { id: 'M-33019', score: 58, conditions: ['Hypertension', 'Hyperlipidemia'], utilization: '1 / 0', driver: 'Complex Medication', status: 'Elevated', edVisits: 1, ipVisits: 0, prescriptions: 8 }
];

const ClinicalRisk: React.FC = () => {
  const navigate = useNavigate();
  const [selectedMember, setSelectedMember] = useState<ClinicalCohortMember | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Recharts Donut data
  const donutData = [
    { name: 'Conditions', value: 38, color: '#005599' },
    { name: 'Utilization', value: 31, color: '#046a64' },
    { name: 'Medication', value: 18, color: '#455668' },
    { name: 'Recent Events', value: 13, color: '#a3c9ff' }
  ];

  const handleOpenDrawer = (member: ClinicalCohortMember) => {
    setSelectedMember(member);
    setIsDrawerOpen(true);
  };

  return (
    <div className="flex flex-col gap-8 w-full">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-on-surface">Clinical Risk Workspace</h2>
          <p className="text-[13px] text-on-surface-variant font-medium mt-1 max-w-3xl">
            Analyze member-level clinical risk, utilization patterns, and conditions driving current health vulnerability.
          </p>
        </div>
        <button 
          onClick={() => navigate('/map')}
          className="bg-white border border-slate-200/60 text-primary font-bold text-[13px] px-4.5 py-2 rounded-lg hover:bg-slate-50 transition flex items-center gap-2 shadow-sm shrink-0"
        >
          <span>View SDOH Risk Map</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="glass-card p-6 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Average Clinical Risk</span>
            <Activity className="text-primary w-5 h-5" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-extrabold text-on-surface">45%</span>
            <span className="text-[12px] font-bold text-teal-600 flex items-center gap-0.5">
              <TrendingDown className="w-3.5 h-3.5" /> 2%
            </span>
          </div>
        </div>

        <div className="glass-card p-6 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">High Clinical Risk</span>
            <AlertOctagon className="text-error w-5 h-5" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-extrabold text-on-surface">1,240</span>
            <span className="text-[12px] font-bold text-error flex items-center gap-0.5">
              <TrendingUp className="w-3.5 h-3.5" /> 5%
            </span>
          </div>
        </div>

        <div className="glass-card p-6 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">High Utilization</span>
            <Heart className="text-tertiary w-5 h-5" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-extrabold text-on-surface">680</span>
            <span className="text-[12px] text-on-surface-variant font-semibold">Members</span>
          </div>
        </div>

        <div className="glass-card p-6 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Multi-Condition</span>
            <Plus className="text-primary w-5 h-5" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-extrabold text-on-surface">920</span>
            <span className="text-[12px] text-on-surface-variant font-semibold">Members</span>
          </div>
        </div>
      </div>

      {/* Two Column Graphs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Clinical Risk Donut */}
        <div className="glass-card p-6 flex flex-col justify-between min-h-[380px]">
          <h3 className="text-md font-bold text-on-surface mb-4">Clinical Risk Synthesis</h3>
          <div className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-6">
            <div className="relative w-40 h-40 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    innerRadius={55}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {donutData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-extrabold text-on-surface leading-none">45%</span>
                <span className="text-[10px] font-bold text-on-surface-variant uppercase mt-1">Avg Score</span>
              </div>
            </div>

            <div className="flex-1 w-full flex flex-col gap-3">
              {donutData.map((item, index) => (
                <div key={index} className="border border-slate-200/50 rounded-lg p-2.5 bg-white/40">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[12px] font-bold flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                      {item.name}
                    </span>
                    <span className="text-[12px] font-extrabold text-slate-800">{item.value}%</span>
                  </div>
                  <div className="w-full bg-slate-200/40 h-1 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ backgroundColor: item.color, width: `${item.value}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top Drivers */}
        <div className="glass-card p-6 flex flex-col justify-between min-h-[380px]">
          <h3 className="text-md font-bold text-on-surface mb-4">Top Clinical Risk Drivers</h3>
          <div className="flex flex-col gap-4.5 flex-1 justify-center">
            {[
              { label: 'Multiple Chronic Conditions', val: 82, color: 'bg-error' },
              { label: 'Recent ED Visits', val: 74, color: 'bg-error' },
              { label: 'Frequent Utilization', val: 68, color: 'bg-tertiary' },
              { label: 'Complex Medication Profile', val: 57, color: 'bg-tertiary' },
              { label: 'Recent Hospitalization', val: 51, color: 'bg-primary-container' }
            ].map((driver, index) => (
              <div key={index}>
                <div className="flex justify-between mb-1.5 text-[13px] font-semibold text-slate-700">
                  <span>{driver.label}</span>
                  <span className="font-extrabold">{driver.val}%</span>
                </div>
                <div className="w-full bg-slate-200/40 h-2 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${driver.color}`} style={{ width: `${driver.val}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cohort Table */}
      <div className="glass-card rounded-xl overflow-hidden flex flex-col border border-slate-200/50">
        <div className="px-6 py-4 border-b border-slate-200/50 flex justify-between items-center bg-white/40 backdrop-blur-sm">
          <h3 className="text-md font-bold text-on-surface">Members With Elevated Clinical Risk</h3>
        </div>
        <div className="overflow-x-auto w-full custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold border-b border-slate-200/40 bg-slate-50/50">
              <tr>
                <th className="py-3.5 px-6">Member ID</th>
                <th className="py-3.5 px-4">Risk Score</th>
                <th className="py-3.5 px-4">Conditions</th>
                <th className="py-3.5 px-4">ED / IP (12m)</th>
                <th className="py-3.5 px-4">Primary Driver</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="text-[13px] divide-y divide-slate-100 bg-white/20">
              {mockCohort.map((member) => (
                <tr key={member.id} className="hover:bg-slate-50/30 transition-colors">
                  <td className="py-4 px-6 font-semibold text-primary">{member.id}</td>
                  <td className="py-4 px-4 font-bold text-error">{member.score}%</td>
                  <td className="py-4 px-4 font-medium text-slate-600 truncate max-w-[220px]">
                    {member.conditions.join(', ')}
                  </td>
                  <td className="py-4 px-4 font-semibold text-slate-700">{member.utilization}</td>
                  <td className="py-4 px-4 font-medium text-on-surface">{member.driver}</td>
                  <td className="py-4 px-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                      member.status === 'Critical' 
                        ? 'bg-error/10 text-error border-error/20' 
                        : 'bg-amber-100 text-amber-800 border-amber-200'
                    }`}>
                      {member.status}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <button 
                      onClick={() => handleOpenDrawer(member)}
                      className="text-primary hover:underline font-bold text-[13px]"
                    >
                      Analyze
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-slate-200/50 flex justify-end bg-slate-50/50 text-[12px]">
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

      {/* Drawer Overlay & Clinical Drawer */}
      <div className={`fixed inset-0 z-50 transition-opacity duration-300 ${isDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setIsDrawerOpen(false)}></div>
        <aside className={`absolute right-0 top-0 h-full w-[400px] bg-white border-l border-slate-200 shadow-2xl flex flex-col z-50 transition-transform duration-300 ease-in-out ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          {selectedMember && (
            <>
              {/* Header */}
              <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50/50 shrink-0">
                <div>
                  <h3 className="text-lg font-bold text-on-surface">Clinical Risk Profile</h3>
                  <p className="text-[13px] text-primary font-bold">Member: {selectedMember.id}</p>
                </div>
                <button className="p-1.5 text-on-surface-variant hover:bg-slate-200/60 rounded-full transition-colors" onClick={() => setIsDrawerOpen(false)}>
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                {/* Risk Gauge Header */}
                <div className="flex items-center gap-4 p-4 rounded-xl bg-error/5 border border-error/20">
                  <div className="w-14 h-14 rounded-full border-4 border-error flex items-center justify-center shrink-0">
                    <span className="text-md font-extrabold text-error">{selectedMember.score}%</span>
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold text-error uppercase tracking-wider">Critical Risk Status</h4>
                    <p className="text-[12px] text-on-surface-variant mt-0.5 font-medium">High likelihood of adverse event within 90 days.</p>
                  </div>
                </div>

                {/* Active Diagnosis */}
                <div>
                  <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2.5">Active Conditions</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedMember.conditions.map((c, i) => (
                      <span key={i} className="px-2.5 py-1 bg-slate-100 rounded-lg border border-slate-200/60 text-[12px] text-slate-700 font-semibold">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Utilization */}
                <div>
                  <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-3">Utilization (L12M)</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="border border-slate-200/60 rounded-xl p-3 text-center bg-slate-50/50">
                      <span className="block text-2xl font-bold text-on-surface">{selectedMember.edVisits}</span>
                      <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">ED Visits</span>
                    </div>
                    <div className="border border-slate-200/60 rounded-xl p-3 text-center bg-slate-50/50">
                      <span className="block text-2xl font-bold text-on-surface">{selectedMember.ipVisits}</span>
                      <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Inpatient</span>
                    </div>
                  </div>
                </div>

                {/* Primary Drivers list */}
                <div>
                  <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2.5">Primary Clinical Drivers</h4>
                  <ul className="space-y-2.5">
                    <li className="flex items-start gap-2.5 text-[12.5px] text-slate-700 font-medium">
                      <FileText className="text-error w-4 h-4 mt-0.5 shrink-0" />
                      <span>Poor glycemic control (HbA1c &gt; 9.0)</span>
                    </li>
                    <li className="flex items-start gap-2.5 text-[12.5px] text-slate-700 font-medium">
                      <Clock className="text-error w-4 h-4 mt-0.5 shrink-0" />
                      <span>Recent ED admission for hypoglycemia</span>
                    </li>
                    <li className="flex items-start gap-2.5 text-[12.5px] text-slate-700 font-medium">
                      <Activity className="text-tertiary w-4 h-4 mt-0.5 shrink-0" />
                      <span>Polypharmacy ({selectedMember.prescriptions}+ active prescriptions)</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Action buttons */}
              <div className="p-4 border-t border-slate-200 bg-slate-50/50 shrink-0 flex gap-3">
                <button 
                  onClick={() => navigate(`/members?id=${selectedMember.id}`)}
                  className="flex-1 py-2.5 bg-white border border-primary text-primary font-bold text-[13px] rounded-lg hover:bg-slate-100/50 transition-colors"
                >
                  View Full Record
                </button>
                <button 
                  onClick={() => alert(`Task created for Care Coordinator assigned to member ${selectedMember.id}`)}
                  className="flex-1 py-2.5 bg-primary text-white font-bold text-[13px] rounded-lg hover:bg-primary/95 transition-colors"
                >
                  Create Task
                </button>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
};

export default ClinicalRisk;
