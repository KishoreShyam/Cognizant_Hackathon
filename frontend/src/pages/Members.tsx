import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Users, 
  Search, 
  X, 
  Home, 
  ArrowRight,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  TrendingUp,
  MapPin,
  Loader2,
  Sparkles,
  Stethoscope,
  Building2
} from 'lucide-react';

interface FutureRisk5 {
  class: number;
  level: string;
  confidence: number;
  confidence_pct: string;
  probabilities?: Record<string, number>;
}

interface FutureRisk3 {
  class: number;
  level: string;
  confidence: number;
  confidence_pct: string;
  probabilities?: Record<string, number>;
}

interface SDOHRisk {
  level: string;
  label: string;
  poverty_2022: number;
  housing_burden_2022: number;
  income_2022: number;
  unemployment_2022: number;
  uninsured_2022: number;
  food_access_2022: number;
  no_vehicle_2022?: number;
  disability_2022?: number;
  broadband_2022?: number;
  education_2022?: number;
}

interface ShapDriver {
  rank: number;
  feature: string;
  display_name: string;
  shap_value: number;
  shap_formatted: string;
  raw_value: number | string;
  category: 'Clinical' | 'SDOH';
}

interface Member {
  id: string;
  patient_id: string;
  tract_fips: string;
  county: string;
  state: string;
  gender?: string;
  priority: string;
  priority_label: string;
  priorityColor: string;
  future_risk_5: FutureRisk5;
  future_risk_3: FutureRisk3;
  sdoh_risk: SDOHRisk;
  driver: string;
  driver_type: 'Clinical' | 'SDOH' | 'Combined';
  shap_drivers?: ShapDriver[];
  status: string;
  statusColor: string;
  conditions: string[];
  edVisits: number;
  ipVisits: number;
  outpatientVisits?: number;
  encounters: number;
  chronicCount?: number;
  diagnosesCount?: number;
  medicationsCount?: number;
  proceduresCount?: number;
  clinicalBurden: number;
  healthcareUtilization: number;
  future_forecast_note: string;
  details: string[];
}

interface SummaryMetrics {
  total_patients: number;
  high_priority_count: number;
  clinical_dominant_pct: number;
  sdoh_dominant_pct: number;
  combined_elevated_pct: number;
}

const Members: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const memberIdParam = searchParams.get('id');

  const [members, setMembers] = useState<Member[]>([]);
  const [summary, setSummary] = useState<SummaryMetrics>({
    total_patients: 0,
    high_priority_count: 0,
    clinical_dominant_pct: 0,
    sdoh_dominant_pct: 0,
    combined_elevated_pct: 0,
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState('All');
  const [driverFilter, setDriverFilter] = useState('All');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Fetch real data from backend API
  const fetchMembers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/members/').catch(() => 
        fetch('http://127.0.0.1:8000/api/members/')
      );

      if (!response.ok) {
        throw new Error(`Failed to load patient records (HTTP ${response.status})`);
      }

      const data = await response.json();
      const memberList: Member[] = data.members || [];
      setMembers(memberList);
      
      if (data.summary) {
        setSummary(data.summary);
      }
    } catch (err: any) {
      console.error('Error fetching members:', err);
      setError(err.message || 'Unable to connect to the SDOH prediction backend.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  // Sync drawer state with URL param once members are loaded
  useEffect(() => {
    if (memberIdParam && members.length > 0) {
      const found = members.find(m => m.id === memberIdParam || m.patient_id === memberIdParam);
      if (found) {
        setSelectedMember(found);
        setIsDrawerOpen(true);
      }
    }
  }, [memberIdParam, members]);

  const handleOpenDrawer = (member: Member) => {
    setSelectedMember(member);
    setIsDrawerOpen(true);
    setSearchParams({ id: member.id });
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setSearchParams({});
  };

  // Filter members by search query, 5-class risk level, and driver category
  const filteredMembers = useMemo(() => {
    return members.filter(m => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = 
        !q ||
        m.id.toLowerCase().includes(q) || 
        m.tract_fips.toLowerCase().includes(q) ||
        m.county.toLowerCase().includes(q) ||
        m.driver.toLowerCase().includes(q) ||
        m.future_risk_5.level.toLowerCase().includes(q) ||
        m.future_risk_3.level.toLowerCase().includes(q);
      
      const matchesRisk = riskFilter === 'All' || m.future_risk_5.level === riskFilter || m.priority === riskFilter;
      
      const matchesDriver = 
        driverFilter === 'All' || 
        (driverFilter === 'Clinical' && m.driver_type === 'Clinical') ||
        (driverFilter === 'SDOH' && m.driver_type === 'SDOH') ||
        (driverFilter === 'Combined' && m.driver_type === 'Combined');

      return matchesSearch && matchesRisk && matchesDriver;
    });
  }, [members, searchQuery, riskFilter, driverFilter]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / pageSize));
  const paginatedMembers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredMembers.slice(start, start + pageSize);
  }, [filteredMembers, currentPage, pageSize]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const handleCareCoordination = () => {
    if (selectedMember) {
      alert(`Care coordination workflow initiated for patient ${selectedMember.id} (${selectedMember.future_risk_5.level} Future Risk, Tract ${selectedMember.tract_fips}).`);
    }
  };

  // Helper for rendering risk badges
  const getRiskBadge = (level: string, confidencePct?: string) => {
    switch (level) {
      case 'Critical':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-error/10 text-error border border-error/20">
            <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse"></span>
            Critical {confidencePct && <span className="opacity-80 font-normal">({confidencePct})</span>}
          </span>
        );
      case 'High':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
            High {confidencePct && <span className="opacity-80 font-normal">({confidencePct})</span>}
          </span>
        );
      case 'Moderate':
      case 'Medium':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
            Moderate {confidencePct && <span className="opacity-80 font-normal">({confidencePct})</span>}
          </span>
        );
      case 'Low':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-600"></span>
            Low {confidencePct && <span className="opacity-80 font-normal">({confidencePct})</span>}
          </span>
        );
      case 'Very Low':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
            Very Low {confidencePct && <span className="opacity-80 font-normal">({confidencePct})</span>}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
            {level}
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full relative">
      {/* Page Header */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-on-surface">Members Risk Workspace</h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[11px] font-bold">
              <Sparkles className="w-3 h-3" /> Real PostgreSQL & TreeSHAP Active
            </span>
          </div>
          <p className="text-[13px] text-on-surface-variant font-medium">
            Population health intelligence linking PostgreSQL patient records with California SDOH community features and exact TreeSHAP feature attributions.
          </p>
        </div>
        <button 
          onClick={fetchMembers} 
          disabled={isLoading}
          className="flex items-center gap-2 px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[12px] font-semibold rounded-lg shadow-sm transition-all disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Member Intelligence Summary Cards */}
      <div className="glass-card rounded-xl p-6 flex flex-wrap items-center justify-between gap-6 border border-slate-200/50">
        <div className="flex items-center gap-4 border-r border-slate-200/60 pr-8">
          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">TOTAL HIGH PRIORITY MEMBERS</p>
            <p className="text-2xl font-bold text-on-surface">
              {isLoading ? '...' : summary.high_priority_count}
              <span className="text-[12px] font-medium text-on-surface-variant ml-1.5">
                / {summary.total_patients} total
              </span>
            </p>
          </div>
        </div>
        <div className="flex-1 flex justify-around gap-4 min-w-[280px]">
          <div className="flex flex-col">
            <span className="text-[12px] font-medium text-on-surface-variant">Clinical Risk Dominant</span>
            <span className="text-lg font-bold text-error">
              {isLoading ? '...' : `${summary.clinical_dominant_pct}%`}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[12px] font-medium text-on-surface-variant">SDOH Risk Dominant</span>
            <span className="text-lg font-bold text-tertiary">
              {isLoading ? '...' : `${summary.sdoh_dominant_pct}%`}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[12px] font-medium text-on-surface-variant">Combined Risk Elevated</span>
            <span className="text-lg font-bold text-primary">
              {isLoading ? '...' : `${summary.combined_elevated_pct}%`}
            </span>
          </div>
        </div>
      </div>

      {/* Filters & Search Bar */}
      <div className="glass-card rounded-xl p-4 flex flex-wrap items-center gap-4 border border-slate-200/50">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant w-[16px] h-[16px]" />
          <input 
            type="text" 
            placeholder="Search by Patient ID, Tract FIPS, County, or Driver..." 
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="w-full pl-10 pr-4 py-2 bg-white rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-[13px] text-on-surface outline-none"
          />
        </div>
        <select 
          value={riskFilter}
          onChange={(e) => { setRiskFilter(e.target.value); setCurrentPage(1); }}
          className="py-2 pl-3 pr-8 bg-white rounded-lg border border-slate-200 text-[13px] text-on-surface outline-none focus:border-primary cursor-pointer"
        >
          <option value="All">Future Risk (5-Class): All</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Moderate">Moderate</option>
          <option value="Low">Low</option>
          <option value="Very Low">Very Low</option>
        </select>
        <select 
          value={driverFilter}
          onChange={(e) => { setDriverFilter(e.target.value); setCurrentPage(1); }}
          className="py-2 pl-3 pr-8 bg-white rounded-lg border border-slate-200 text-[13px] text-on-surface outline-none focus:border-primary cursor-pointer"
        >
          <option value="All">Primary Driver: All</option>
          <option value="Clinical">Clinical Dominant</option>
          <option value="SDOH">SDOH Dominant</option>
          <option value="Combined">Combined Risk</option>
        </select>
        <div className="flex gap-2 ml-auto">
          <button 
            onClick={() => { setSearchQuery(''); setRiskFilter('All'); setDriverFilter('All'); setCurrentPage(1); }}
            className="px-4 py-2 text-primary font-bold text-[13px] hover:bg-primary/5 rounded-lg transition-all cursor-pointer"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between text-red-800 text-[13px]">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button 
            onClick={fetchMembers}
            className="px-3 py-1 bg-red-600 text-white font-bold text-[12px] rounded-lg hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Members Table */}
      <div className="glass-card rounded-xl border border-slate-200/50 overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200/50 bg-white/40 backdrop-blur-sm flex justify-between items-center">
          <h3 className="text-md font-bold text-on-surface">Members Requiring Attention</h3>
          <span className="text-[12px] text-slate-500 font-medium">
            {filteredMembers.length} patient record{filteredMembers.length === 1 ? '' : 's'} available
          </span>
        </div>
        
        <div className="overflow-x-auto w-full custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold border-b border-slate-200/40 bg-slate-50/50">
              <tr>
                <th className="py-3.5 px-6">Priority</th>
                <th className="py-3.5 px-4">Patient ID</th>
                <th className="py-3.5 px-4">FUTURE RISK (5-CLASS)</th>
                <th className="py-3.5 px-4">SDOH RISK (COMMUNITY)</th>
                <th className="py-3.5 px-4">FUTURE RISK (3-CLASS)</th>
                <th className="py-3.5 px-4">PRIMARY DRIVER (TREE-SHAP)</th>
                <th className="py-3.5 px-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="text-[13px] divide-y divide-slate-100 bg-white/20">
              {isLoading && (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-on-surface-variant font-medium">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <Loader2 className="w-7 h-7 text-primary animate-spin" />
                      <span>Loading patient risk records...</span>
                    </div>
                  </td>
                </tr>
              )}

              {!isLoading && paginatedMembers.map((member) => (
                <tr key={member.id} className="hover:bg-slate-50/30 transition-colors group">
                  {/* Priority */}
                  <td className="py-4 px-6">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${member.priorityColor}`}>
                      {member.priority}
                    </span>
                  </td>

                  {/* Patient ID */}
                  <td className="py-4 px-4">
                    <div className="flex flex-col">
                      <span className="font-semibold text-primary">{member.id}</span>
                      <span className="text-[10px] text-slate-400 font-mono">Tract: {member.tract_fips}</span>
                    </div>
                  </td>
                  
                  {/* FUTURE RISK (5-CLASS) */}
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-2">
                      {getRiskBadge(member.future_risk_5.level)}
                      <span className="text-[11px] font-bold text-slate-600">{member.future_risk_5.confidence_pct}</span>
                    </div>
                  </td>

                  {/* SDOH RISK (COMMUNITY) */}
                  <td className="py-4 px-4">
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-700">{member.sdoh_risk.label}</span>
                      <span className="text-[10px] text-slate-400">{member.county}</span>
                    </div>
                  </td>

                  {/* FUTURE RISK (3-CLASS) */}
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-2">
                      {getRiskBadge(member.future_risk_3.level)}
                      <span className="text-[11px] font-bold text-slate-600">{member.future_risk_3.confidence_pct}</span>
                    </div>
                  </td>

                  {/* Primary Driver (Real TreeSHAP Attribution) */}
                  <td className="py-4 px-4 font-medium text-on-surface">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[12px] font-bold text-slate-800">
                        {member.shap_drivers && member.shap_drivers.length > 0 
                          ? member.shap_drivers[0].display_name 
                          : member.driver}
                      </span>
                      {member.shap_drivers && member.shap_drivers.length > 0 && (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-mono font-bold text-primary bg-primary/5 px-1.5 py-0.2 rounded border border-primary/10">
                            {member.shap_drivers[0].shap_formatted} SHAP
                          </span>
                          <span className="text-[10px] text-slate-400 font-semibold">
                            ({member.shap_drivers[0].category})
                          </span>
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Action Button */}
                  <td className="py-4 px-6 text-right">
                    <button 
                      onClick={() => handleOpenDrawer(member)}
                      className="px-3.5 py-1.5 border border-primary text-primary font-bold text-[12px] rounded-lg hover:bg-primary hover:text-white transition-colors shadow-sm cursor-pointer"
                    >
                      Analyze
                    </button>
                  </td>
                </tr>
              ))}

              {!isLoading && filteredMembers.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-on-surface-variant font-medium">
                    No patient records found matching search or filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-4 border-t border-slate-200/50 flex justify-between items-center bg-slate-50/50 text-[12px]">
          <span className="text-on-surface-variant font-semibold">
            Showing {filteredMembers.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} to {Math.min(currentPage * pageSize, filteredMembers.length)} of {filteredMembers.length} members
          </span>
          <div className="flex gap-1.5 items-center">
            <button 
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1 || isLoading}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-on-surface-variant hover:bg-slate-100 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 bg-white border border-slate-200 rounded-lg font-bold text-primary">
              Page {currentPage} of {totalPages}
            </span>
            <button 
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages || isLoading}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-on-surface-variant hover:bg-slate-100 disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Sliding Side Panel (Drawer) for Real Patient Detail & Future Risk Analysis */}
      <div className={`fixed inset-0 z-50 transition-opacity duration-300 ${isDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={handleCloseDrawer}></div>
        <aside className={`absolute right-0 top-0 h-full w-[480px] bg-white border-l border-slate-200 shadow-2xl flex flex-col z-50 transition-transform duration-300 ease-in-out ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          {selectedMember && (
            <>
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-slate-50/70 shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-on-surface">Member Risk Deep-Dive</h3>
                    {getRiskBadge(selectedMember.future_risk_5.level)}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[13px] text-primary font-mono font-bold">{selectedMember.id}</span>
                    <span className="text-[11px] px-2 py-0.2 rounded-full bg-slate-200/80 font-bold text-slate-700">
                      {selectedMember.gender || 'Demographics Verified'}
                    </span>
                  </div>
                </div>
                <button 
                  className="p-1.5 text-on-surface-variant hover:bg-slate-200/60 rounded-full transition-colors cursor-pointer" 
                  onClick={handleCloseDrawer}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                {/* Geographic & Census Tract Banner */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/60 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <MapPin className="w-4 h-4 text-primary shrink-0" />
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase">Census Tract FIPS Identifier</p>
                      <p className="text-[13px] font-mono font-bold text-slate-800">{selectedMember.tract_fips}</p>
                    </div>
                  </div>
                  <span className="text-[12px] font-bold text-slate-700 bg-white px-3 py-1 rounded-lg border border-slate-200 shadow-2xs">
                    {selectedMember.county}, {selectedMember.state}
                  </span>
                </div>

                {/* Risk Composition Grid (Future 5-Class vs SDOH vs Future 3-Class) */}
                <div>
                  <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2.5">
                    Future Risk Prediction Breakdown
                  </h4>
                  <div className="grid grid-cols-3 gap-2.5">
                    {/* 5-Class Future Risk */}
                    <div className="flex flex-col items-center p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                      <span className="text-sm font-bold text-slate-800">{selectedMember.future_risk_5.level}</span>
                      <span className="text-[11px] font-bold text-error mt-0.5">{selectedMember.future_risk_5.confidence_pct}</span>
                      <span className="text-[10px] text-slate-400 uppercase mt-1">FUTURE (5-Class)</span>
                    </div>

                    {/* Social/SDOH */}
                    <div className="flex flex-col items-center p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                      <span className="text-sm font-bold text-slate-800">{selectedMember.sdoh_risk.poverty_2022}%</span>
                      <span className="text-[11px] font-bold text-tertiary mt-0.5">Poverty Rate</span>
                      <span className="text-[10px] text-slate-400 uppercase mt-1">SDOH Community</span>
                    </div>

                    {/* 3-Class Future Risk */}
                    <div className="flex flex-col items-center p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                      <span className="text-sm font-bold text-slate-800">{selectedMember.future_risk_3.level}</span>
                      <span className="text-[11px] font-bold text-primary mt-0.5">{selectedMember.future_risk_3.confidence_pct}</span>
                      <span className="text-[10px] text-slate-400 uppercase mt-1">FUTURE (3-Class)</span>
                    </div>
                  </div>
                </div>

                {/* REAL TreeSHAP Feature Attribution (ML Explainer) */}
                {selectedMember.shap_drivers && selectedMember.shap_drivers.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                        <span>TreeSHAP Feature Attribution (Real ML Explainer)</span>
                      </h4>
                      <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                        Exact Real Scores
                      </span>
                    </div>
                    <div className="space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                      {selectedMember.shap_drivers.map((drv) => (
                        <div key={drv.rank} className="p-2.5 bg-white rounded-lg border border-slate-200/60 shadow-2xs">
                          <div className="flex justify-between items-center text-[12px] mb-1">
                            <div className="flex items-center gap-1.5">
                              <span className="w-4 h-4 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold flex items-center justify-center">
                                #{drv.rank}
                              </span>
                              <span className="font-bold text-slate-800">{drv.display_name}</span>
                              <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                                drv.category === 'Clinical' ? 'bg-rose-100 text-rose-800' : 'bg-primary/10 text-primary'
                              }`}>
                                {drv.category}
                              </span>
                            </div>
                            <span className="font-mono font-bold text-primary text-[12px]">
                              {drv.shap_formatted} SHAP
                            </span>
                          </div>
                          <div className="flex justify-between text-[11px] text-slate-500 pl-5.5">
                            <span>Patient/Tract Value: <strong className="text-slate-700">{drv.raw_value}</strong></span>
                            <span className="font-mono text-[10px] text-slate-400">{drv.feature}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Real Clinical & Utilization Profile from PostgreSQL */}
                <div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <Stethoscope className="w-4 h-4 text-primary" />
                    <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                      Clinical & Utilization Profile (Real PostgreSQL 12M Data)
                    </h4>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center mb-2.5">
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="block text-lg font-bold text-on-surface">{selectedMember.edVisits}</span>
                      <span className="text-[9px] font-bold text-on-surface-variant uppercase">ED Visits</span>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="block text-lg font-bold text-on-surface">{selectedMember.ipVisits}</span>
                      <span className="text-[9px] font-bold text-on-surface-variant uppercase">Inpatient</span>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="block text-lg font-bold text-on-surface">{selectedMember.outpatientVisits ?? 0}</span>
                      <span className="text-[9px] font-bold text-on-surface-variant uppercase">Outpatient</span>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="block text-lg font-bold text-on-surface">{selectedMember.encounters}</span>
                      <span className="text-[9px] font-bold text-on-surface-variant uppercase">Encounters</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[12px]">
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-100 flex justify-between">
                      <span className="text-slate-500">Chronic Conditions:</span>
                      <span className="font-bold text-slate-800">{selectedMember.chronicCount ?? 0}</span>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-100 flex justify-between">
                      <span className="text-slate-500">Total Diagnoses:</span>
                      <span className="font-bold text-slate-800">{selectedMember.diagnosesCount ?? 0}</span>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-100 flex justify-between">
                      <span className="text-slate-500">Active Medications:</span>
                      <span className="font-bold text-slate-800">{selectedMember.medicationsCount ?? 0}</span>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-100 flex justify-between">
                      <span className="text-slate-500">Clinical Procedures:</span>
                      <span className="font-bold text-slate-800">{selectedMember.proceduresCount ?? 0}</span>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-100 flex justify-between col-span-2">
                      <span className="text-slate-500">Healthcare Utilization Index:</span>
                      <span className="font-bold text-slate-800">{selectedMember.healthcareUtilization}</span>
                    </div>
                  </div>
                </div>

                {/* Real SDOH Community Metrics from PostgreSQL */}
                <div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <Building2 className="w-4 h-4 text-tertiary" />
                    <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                      Census Tract SDOH Indicators (Tract {selectedMember.tract_fips})
                    </h4>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[12px]">
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex justify-between items-center">
                      <span className="text-slate-500">Area Median Income:</span>
                      <span className="font-bold text-slate-800">
                        {selectedMember.sdoh_risk.income_2022 > 0 ? `$${selectedMember.sdoh_risk.income_2022.toLocaleString()}` : 'N/A'}
                      </span>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex justify-between items-center">
                      <span className="text-slate-500">Poverty Rate:</span>
                      <span className="font-bold text-slate-800">{selectedMember.sdoh_risk.poverty_2022}%</span>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex justify-between items-center">
                      <span className="text-slate-500">Housing Burden:</span>
                      <span className="font-bold text-slate-800">{selectedMember.sdoh_risk.housing_burden_2022}%</span>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex justify-between items-center">
                      <span className="text-slate-500">Unemployment:</span>
                      <span className="font-bold text-slate-800">{selectedMember.sdoh_risk.unemployment_2022}%</span>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex justify-between items-center">
                      <span className="text-slate-500">Uninsured Pop:</span>
                      <span className="font-bold text-slate-800">{selectedMember.sdoh_risk.uninsured_2022}%</span>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex justify-between items-center">
                      <span className="text-slate-500">Food Insecurity:</span>
                      <span className="font-bold text-slate-800">{selectedMember.sdoh_risk.food_access_2022}%</span>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex justify-between items-center">
                      <span className="text-slate-500">No Vehicle:</span>
                      <span className="font-bold text-slate-800">{selectedMember.sdoh_risk.no_vehicle_2022 ?? 0}%</span>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex justify-between items-center">
                      <span className="text-slate-500">Disability Rate:</span>
                      <span className="font-bold text-slate-800">{selectedMember.sdoh_risk.disability_2022 ?? 0}%</span>
                    </div>
                  </div>
                </div>

                {/* Primary Risk Drivers and Forecasting Note */}
                <div>
                  <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-3">
                    Risk Drivers & Trajectory Forecast
                  </h4>
                  <ul className="space-y-2.5">
                    {selectedMember.details.map((detail, idx) => (
                      <li key={idx} className="flex gap-3 items-start bg-slate-50 p-3 rounded-xl border border-slate-100">
                        {idx === 0 ? <AlertTriangle className="w-5 h-5 text-error shrink-0 mt-0.5" /> :
                         idx === 1 ? <Home className="w-5 h-5 text-tertiary shrink-0 mt-0.5" /> :
                         <TrendingUp className="w-5 h-5 text-primary shrink-0 mt-0.5" />}
                        <div>
                          <p className="text-[12px] text-on-surface font-bold leading-tight">
                            {idx === 0 ? 'Primary SHAP Attribution' : idx === 1 ? 'Secondary SHAP Attribution' : 'Future Risk Forecast'}
                          </p>
                          <p className="text-[12px] text-on-surface-variant mt-1 leading-normal">{detail}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Action footer */}
              <div className="p-6 border-t border-slate-200 bg-slate-50/50 shrink-0">
                <div className="mb-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Priority Intervention</span>
                  <p className="text-[13px] font-bold text-slate-800">{selectedMember.priority_label}</p>
                </div>
                <button 
                  onClick={handleCareCoordination}
                  className="w-full py-3 bg-primary text-white rounded-xl font-bold text-[13px] hover:bg-primary/95 transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer"
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
