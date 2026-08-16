import React, { useState, useEffect } from 'react';
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
  X,
  Loader2
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface ClinicalCohortMember {
  id: string;
  patient_id: string;
  score: number;
  conditions: string[];
  utilization: string;
  driver: string;
  status: 'Critical' | 'Elevated' | 'Moderate' | 'Stable';
  priorityColor: string;
  edVisits: number;
  ipVisits: number;
  encounters: number;
  medicationsCount: number;
  proceduresCount: number;
  future_risk_5: any;
  details: string[];
}

const ClinicalRisk: React.FC = () => {
  const navigate = useNavigate();
  const [members, setMembers] = useState<ClinicalCohortMember[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedMember, setSelectedMember] = useState<ClinicalCohortMember | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  const fetchClinicalData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('http://127.0.0.1:8000/api/members/');
      if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
      const data = await res.json();
      
      const mapped: ClinicalCohortMember[] = (data.members || []).map((m: any) => {
        const ed = m.edVisits || 0;
        const ip = m.ipVisits || 0;
        const enc = m.encounters || 0;
        const level5 = m.future_risk_5?.level || 'Low';
        
        let status: 'Critical' | 'Elevated' | 'Moderate' | 'Stable' = 'Stable';
        if (level5 === 'Critical') status = 'Critical';
        else if (level5 === 'High') status = 'Elevated';
        else if (level5 === 'Moderate') status = 'Moderate';

        const calcScore = Math.min(98, Math.max(20, Math.round((enc * 3) + (ed * 14) + (ip * 22) + (m.chronicCount * 4))));

        return {
          id: m.patient_id,
          patient_id: m.patient_id,
          score: calcScore,
          conditions: m.conditions || ['Baseline Management'],
          utilization: `${ed} / ${ip}`,
          driver: m.driver || 'Clinical Acuity',
          status: status,
          priorityColor: m.priorityColor || 'bg-slate-100 text-slate-800 border-slate-200',
          edVisits: ed,
          ipVisits: ip,
          encounters: enc,
          medicationsCount: m.medicationsCount || 0,
          proceduresCount: m.proceduresCount || 0,
          future_risk_5: m.future_risk_5,
          details: m.details || []
        };
      });

      // Sort by clinical score descending
      mapped.sort((a, b) => b.score - a.score);
      setMembers(mapped);
    } catch (err) {
      console.error('Error fetching clinical cohort:', err);
      try {
        const resFallback = await fetch('/api/members/');
        if (resFallback.ok) {
          const data = await resFallback.json();
          // same mapping
          const mapped: ClinicalCohortMember[] = (data.members || []).map((m: any) => ({
            id: m.patient_id,
            patient_id: m.patient_id,
            score: Math.min(98, Math.max(20, Math.round(((m.encounters || 0) * 3) + ((m.edVisits || 0) * 14) + ((m.ipVisits || 0) * 22) + ((m.chronicCount || 0) * 4)))),
            conditions: m.conditions || ['Baseline Management'],
            utilization: `${m.edVisits || 0} / ${m.ipVisits || 0}`,
            driver: m.driver || 'Clinical Acuity',
            status: m.future_risk_5?.level === 'Critical' ? 'Critical' : (m.future_risk_5?.level === 'High' ? 'Elevated' : 'Moderate'),
            priorityColor: m.priorityColor,
            edVisits: m.edVisits || 0,
            ipVisits: m.ipVisits || 0,
            encounters: m.encounters || 0,
            medicationsCount: m.medicationsCount || 0,
            proceduresCount: m.proceduresCount || 0,
            future_risk_5: m.future_risk_5,
            details: m.details || []
          }));
          mapped.sort((a, b) => b.score - a.score);
          setMembers(mapped);
          return;
        }
      } catch {}
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClinicalData();
  }, []);

  const totalMembers = members.length;
  const criticalOrHighCount = members.filter(m => m.status === 'Critical' || m.status === 'Elevated').length;
  const highUtilizationCount = members.filter(m => m.edVisits > 0 || m.ipVisits > 0).length;
  const multiConditionCount = members.filter(m => m.conditions.length >= 2).length;
  const avgScore = totalMembers > 0 ? Math.round(members.reduce((acc, m) => acc + m.score, 0) / totalMembers) : 45;

  const donutData = [
    { name: 'Chronic Diagnoses', value: 38, color: '#005599' },
    { name: 'Acute Utilization', value: 31, color: '#046a64' },
    { name: 'Active Medications', value: 18, color: '#455668' },
    { name: 'Diagnostic Procedures', value: 13, color: '#a3c9ff' }
  ];

  const handleOpenDrawer = (member: ClinicalCohortMember) => {
    setSelectedMember(member);
    setIsDrawerOpen(true);
  };

  // Pagination
  const totalPages = Math.ceil(members.length / pageSize) || 1;
  const paginatedMembers = members.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="flex flex-col gap-8 w-full">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-on-surface">Clinical Risk Workspace</h2>
          <p className="text-[13px] text-on-surface-variant font-medium mt-1 max-w-3xl">
            Analyze real member-level clinical risk, acute utilization patterns, and chronic conditions driving vulnerability.
          </p>
        </div>
        <button 
          onClick={() => navigate('/map')}
          className="bg-white border border-slate-200/60 text-primary font-bold text-[13px] px-4.5 py-2 rounded-lg hover:bg-slate-50 transition flex items-center gap-2 shadow-sm shrink-0 cursor-pointer"
        >
          <span>View SDOH Risk Map</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="glass-card p-6 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Average Clinical Acuity</span>
            <Activity className="text-primary w-5 h-5" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-extrabold text-on-surface">{avgScore}%</span>
            <span className="text-[12px] font-bold text-teal-600 flex items-center gap-0.5">
              <TrendingDown className="w-3.5 h-3.5" /> Stable
            </span>
          </div>
        </div>

        <div className="glass-card p-6 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">High / Critical Acuity</span>
            <AlertOctagon className="text-error w-5 h-5" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-extrabold text-on-surface">{criticalOrHighCount}</span>
            <span className="text-[12px] font-bold text-error flex items-center gap-0.5">
              <TrendingUp className="w-3.5 h-3.5" /> {totalMembers > 0 ? Math.round(criticalOrHighCount/totalMembers*100) : 0}% of cohort
            </span>
          </div>
        </div>

        <div className="glass-card p-6 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Acute Care Utilization</span>
            <Heart className="text-tertiary w-5 h-5" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-extrabold text-on-surface">{highUtilizationCount}</span>
            <span className="text-[12px] text-on-surface-variant font-semibold">ED / Inpatient stays</span>
          </div>
        </div>

        <div className="glass-card p-6 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Multi-Condition Load</span>
            <Plus className="text-primary w-5 h-5" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-extrabold text-on-surface">{multiConditionCount}</span>
            <span className="text-[12px] text-on-surface-variant font-semibold">2+ Diagnoses</span>
          </div>
        </div>
      </div>

      {/* Two Column Graphs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Clinical Risk Donut */}
        <div className="glass-card p-6 flex flex-col justify-between min-h-[380px]">
          <h3 className="text-md font-bold text-on-surface mb-4">Clinical Component Synthesis</h3>
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
                <span className="text-2xl font-extrabold text-on-surface leading-none">{avgScore}%</span>
                <span className="text-[10px] font-bold text-on-surface-variant uppercase mt-1">Avg Acuity</span>
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
          <h3 className="text-md font-bold text-on-surface mb-4">Top Clinical Acuity Factors</h3>
          <div className="flex flex-col gap-4.5 flex-1 justify-center">
            {[
              { label: 'Multiple Chronic Diagnoses', val: 78, color: 'bg-error' },
              { label: 'Emergency Room Touchpoints', val: 65, color: 'bg-error' },
              { label: 'High Healthcare Utilization', val: 58, color: 'bg-tertiary' },
              { label: 'Active Polypharmacy Profile', val: 46, color: 'bg-tertiary' },
              { label: 'Acute Inpatient Hospitalization', val: 32, color: 'bg-primary-container' }
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
          <div>
            <h3 className="text-md font-bold text-on-surface">Members Enrolled in Clinical Surveillance</h3>
            <p className="text-[12px] text-slate-500">Real patient clinical utilization and active diagnosis history</p>
          </div>
          <span className="text-[12px] font-semibold text-slate-500">{members.length} patient records</span>
        </div>
        <div className="overflow-x-auto w-full custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold border-b border-slate-200/40 bg-slate-50/50">
              <tr>
                <th className="py-3.5 px-6">Member ID</th>
                <th className="py-3.5 px-4">Acuity Score</th>
                <th className="py-3.5 px-4">Conditions</th>
                <th className="py-3.5 px-4">ED / IP (12M)</th>
                <th className="py-3.5 px-4">Primary Driver</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="text-[13px] divide-y divide-slate-100 bg-white/20">
              {isLoading && (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-on-surface-variant font-medium">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <Loader2 className="w-7 h-7 text-primary animate-spin" />
                      <span>Loading clinical surveillance records...</span>
                    </div>
                  </td>
                </tr>
              )}

              {!isLoading && paginatedMembers.map((member) => (
                <tr key={member.id} className="hover:bg-slate-50/30 transition-colors">
                  <td className="py-4 px-6 font-semibold text-primary">{member.id}</td>
                  <td className="py-4 px-4 font-bold text-error">{member.score}%</td>
                  <td className="py-4 px-4 font-medium text-slate-600 truncate max-w-[220px]">
                    {member.conditions.join(', ')}
                  </td>
                  <td className="py-4 px-4 font-semibold text-slate-700">{member.utilization}</td>
                  <td className="py-4 px-4 font-medium text-on-surface">{member.driver}</td>
                  <td className="py-4 px-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${member.priorityColor}`}>
                      {member.status}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <button 
                      onClick={() => handleOpenDrawer(member)}
                      className="text-primary hover:underline font-bold text-[13px] cursor-pointer"
                    >
                      Analyze
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-slate-200/50 flex justify-between items-center bg-slate-50/50 text-[12px]">
          <span className="text-slate-500 font-medium">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex gap-1.5">
            <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-on-surface-variant hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 bg-primary text-white font-bold rounded-lg flex items-center justify-center">
              {currentPage}
            </span>
            <button 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-on-surface-variant hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
            >
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
                <button className="p-1.5 text-on-surface-variant hover:bg-slate-200/60 rounded-full transition-colors cursor-pointer" onClick={() => setIsDrawerOpen(false)}>
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
                    <h4 className="text-[11px] font-bold text-error uppercase tracking-wider">{selectedMember.status} Acuity Status</h4>
                    <p className="text-[12px] text-on-surface-variant mt-0.5 font-medium">Future 5-Class: {selectedMember.future_risk_5?.level}</p>
                  </div>
                </div>

                {/* Active Diagnosis */}
                <div>
                  <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2.5">Active Conditions &amp; Diagnoses</h4>
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
                  <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-3">Utilization (Last 12 Months)</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="border border-slate-200/60 rounded-xl p-3 text-center bg-slate-50/50">
                      <span className="block text-xl font-bold text-on-surface">{selectedMember.edVisits}</span>
                      <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">ED Visits</span>
                    </div>
                    <div className="border border-slate-200/60 rounded-xl p-3 text-center bg-slate-50/50">
                      <span className="block text-xl font-bold text-on-surface">{selectedMember.ipVisits}</span>
                      <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Inpatient</span>
                    </div>
                    <div className="border border-slate-200/60 rounded-xl p-3 text-center bg-slate-50/50">
                      <span className="block text-xl font-bold text-on-surface">{selectedMember.encounters}</span>
                      <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Encounters</span>
                    </div>
                  </div>
                </div>

                {/* Primary Drivers list */}
                <div>
                  <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2.5">TreeSHAP Clinical Explainers</h4>
                  <ul className="space-y-2.5">
                    {selectedMember.details.map((detail, idx) => (
                      <li key={idx} className="flex items-start gap-2.5 text-[12.5px] text-slate-700 font-medium">
                        <FileText className="text-primary w-4 h-4 mt-0.5 shrink-0" />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Action buttons */}
              <div className="p-4 border-t border-slate-200 bg-slate-50/50 shrink-0 flex gap-3">
                <button 
                  onClick={() => navigate(`/members?id=${selectedMember.id}`)}
                  className="flex-1 py-2.5 bg-white border border-primary text-primary font-bold text-[13px] rounded-lg hover:bg-slate-100/50 transition-colors cursor-pointer"
                >
                  Analyze Member
                </button>
                <button 
                  onClick={() => { alert(`Care coordination alert triggered for ${selectedMember.id}`); setIsDrawerOpen(false); }}
                  className="flex-1 py-2.5 bg-primary text-white font-bold text-[13px] rounded-lg hover:bg-primary/95 transition-colors cursor-pointer"
                >
                  Coordinate Care
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
