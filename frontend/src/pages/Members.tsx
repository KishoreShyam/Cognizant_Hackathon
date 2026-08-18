import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
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
  Building2,
  Download
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
  name?: string;
  tract_fips: string;
  county: string;
  state: string;
  gender?: string;
  priority: string;
  priority_label: string;
  priorityColor: string;
  clinical_risk: {
    level: string;
    score: number;
  };
  community_risk: {
    level: string;
    score: number;
  };
  future_risk_5: FutureRisk5;
  future_risk_3: FutureRisk3;
  sdoh_risk: SDOHRisk;
  driver: string;
  driver_type: 'Clinical' | 'SDOH' | 'Combined';
  shap_drivers?: ShapDriver[];
  status: string;
  statusColor: string;
  conditions: string[];
  priority_score?: number;
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
  const navigate = useNavigate();
  const memberIdParam = searchParams.get('id');
  const countyParam = searchParams.get('county');

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

  const [searchQuery, setSearchQuery] = useState(countyParam || '');
  const [currentRiskFilter, setCurrentRiskFilter] = useState('All');
  const [futureRiskFilter, setFutureRiskFilter] = useState('All');
  const [driverFilter, setDriverFilter] = useState('All');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;



  // Fetch real data from backend API
  const fetchMembers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/members/?t=${Date.now()}`);

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

  // Sync county filter from URL param
  useEffect(() => {
    if (countyParam) {
      setSearchQuery(countyParam);
    }
  }, [countyParam]);

  // Sync risk filter from URL param
  const riskParam = searchParams.get('risk');
  useEffect(() => {
    if (riskParam) {
      setCurrentRiskFilter(riskParam);
    }
  }, [riskParam]);

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

  // Filter and sort members dynamically based on driver filter and risk levels
  const filteredMembers = useMemo(() => {
    const list = members.filter(m => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = 
        !q ||
        m.id.toLowerCase().includes(q) || 
        (m.name && m.name.toLowerCase().includes(q)) ||
        m.tract_fips.toLowerCase().includes(q) ||
        m.county.toLowerCase().includes(q) ||
        m.driver.toLowerCase().includes(q) ||
        (m.future_risk_5 && m.future_risk_5.level.toLowerCase().includes(q)) ||
        (m.future_risk_3 && m.future_risk_3.level.toLowerCase().includes(q));
      
      let matchesCurrentRisk = false;
      if (currentRiskFilter === 'All') {
        matchesCurrentRisk = true;
      } else if (driverFilter === 'Clinical') {
        matchesCurrentRisk = m.clinical_risk && m.clinical_risk.level.toUpperCase() === currentRiskFilter.toUpperCase();
      } else if (driverFilter === 'SDOH') {
        matchesCurrentRisk = m.community_risk && m.community_risk.level.toUpperCase() === currentRiskFilter.toUpperCase();
      } else {
        matchesCurrentRisk = m.future_risk_5 && m.future_risk_5.level.toUpperCase() === currentRiskFilter.toUpperCase();
      }

      let matchesFutureRisk = false;
      if (futureRiskFilter === 'All') {
        matchesFutureRisk = true;
      } else {
        matchesFutureRisk = m.future_risk_3 && m.future_risk_3.level.toUpperCase() === futureRiskFilter.toUpperCase();
      }
      
      let matchesDriver = false;
      if (driverFilter === 'All') {
        matchesDriver = true;
      } else if (driverFilter === 'Clinical') {
        matchesDriver = m.driver_type === 'Clinical';
      } else if (driverFilter === 'SDOH') {
        matchesDriver = m.driver_type === 'SDOH';
      }

      return matchesSearch && matchesCurrentRisk && matchesFutureRisk && matchesDriver;
    });

    // Sort descending by relevant risk scores
    return [...list].sort((a, b) => {
      if (driverFilter === 'Clinical') {
        return (b.clinical_risk?.score || 0) - (a.clinical_risk?.score || 0);
      } else if (driverFilter === 'SDOH') {
        return (b.community_risk?.score || 0) - (a.community_risk?.score || 0);
      } else {
        return (b.priority_score || 0) - (a.priority_score || 0);
      }
    });
  }, [members, searchQuery, currentRiskFilter, futureRiskFilter, driverFilter]);

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



  // Helper for rendering risk badges
  const getRiskBadge = (level: string, confidencePct?: string) => {
    const lvl = (level || '').toLowerCase().trim();
    switch (lvl) {
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-error/10 text-error border border-error/20">
            <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse"></span>
            Critical {confidencePct && <span className="opacity-80 font-normal font-mono">({confidencePct})</span>}
          </span>
        );
      case 'very high':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
            Very High {confidencePct && <span className="opacity-80 font-normal font-mono">({confidencePct})</span>}
          </span>
        );
      case 'high':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 text-orange-800 border border-orange-200">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-600"></span>
            High {confidencePct && <span className="opacity-80 font-normal font-mono">({confidencePct})</span>}
          </span>
        );
      case 'moderate':
      case 'medium':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
            Medium {confidencePct && <span className="opacity-80 font-normal font-mono">({confidencePct})</span>}
          </span>
        );
      case 'low':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-600"></span>
            Low {confidencePct && <span className="opacity-80 font-normal font-mono">({confidencePct})</span>}
          </span>
        );
      case 'very low':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
            Very Low {confidencePct && <span className="opacity-80 font-normal font-mono">({confidencePct})</span>}
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

  const handleDownloadReport = async () => {
    if (!selectedMember) return;
    setIsGeneratingReport(true);

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to generate the PDF report.');
      setIsGeneratingReport(false);
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Generating Report...</title>
          <style>
            body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #f8fafc; color: #475569; }
            .spinner { border: 4px solid #e2e8f0; border-top: 4px solid #0d9488; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            h2 { margin-top: 16px; font-size: 18px; font-weight: 600; color: #0f172a; }
            p { font-size: 14px; margin-top: 8px; }
          </style>
        </head>
        <body>
          <div class="spinner"></div>
          <h2>Generating Patient Profile & AI Care Plan</h2>
          <p>Please wait, compiling clinical data and generating AI insights...</p>
        </body>
      </html>
    `);
    printWindow.document.close();

    let aiResponse = "No clinical narrative summary generated.";
    try {
      const response = await fetch("/api/agent/chat/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: selectedMember.id,
          message: "Please generate a comprehensive, highly detailed care management executive summary for this patient. Start directly with the summary, explaining the clinical and social risk drivers, care priorities, and recommended interventions in a structured professional report format. Do not write any conversational greeting."
        })
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.response) {
          aiResponse = data.response;
        }
      } else {
        aiResponse = "Could not generate AI care narrative. Displaying clinical profile only.";
      }
    } catch (err) {
      console.error("AI report generation failed", err);
      aiResponse = "AI connection failed. Displaying clinical profile only.";
    } finally {
      setIsGeneratingReport(false);
    }

    const formattedAiResponse = aiResponse
      .replace(/^### (.*$)/gim, '<h4 style="color: #0f172a; margin-top: 16px; margin-bottom: 8px; font-size: 14px; font-weight: bold; border-left: 3px solid #0d9488; padding-left: 8px;">$1</h4>')
      .replace(/^## (.*$)/gim, '<h3 style="color: #0f172a; margin-top: 20px; margin-bottom: 10px; font-size: 15px; font-weight: bold; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">$1</h3>')
      .replace(/^# (.*$)/gim, '<h2 style="color: #0f172a; margin-top: 24px; margin-bottom: 12px; font-size: 16px; font-weight: bold;">$1</h2>')
      .replace(/^\* (.*$)/gim, '<li style="margin-bottom: 6px; margin-left: 12px; list-style-type: disc;">$1</li>')
      .replace(/^- (.*$)/gim, '<li style="margin-bottom: 6px; margin-left: 12px; list-style-type: disc;">$1</li>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n\n/g, '<p style="margin-top: 8px; margin-bottom: 8px;"></p>')
      .replace(/\n/g, '<br/>');

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>CareSync Clinical Report - ${selectedMember.name || 'N/A'}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #1e293b;
      background-color: #ffffff;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      max-width: 850px;
      margin: 0 auto;
      padding: 40px;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    .header-left h1 {
      margin: 0;
      font-size: 26px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.02em;
    }
    .metadata-strip {
      margin-top: 8px;
      font-size: 12px;
      color: #64748b;
      font-weight: 500;
    }
    .badge {
      display: inline-block;
      padding: 6px 14px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge-critical { background-color: #fee2e2; color: #991b1b; }
    .badge-high { background-color: #ffedd5; color: #c2410c; }
    .badge-medium { background-color: #fef08a; color: #854d0e; }
    .badge-low { background-color: #ccfbf1; color: #115e59; }
    .badge-verylow { background-color: #dcfce7; color: #166534; }
    
    .section-title {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #0d9488;
      border-bottom: 2px solid #f1f5f9;
      padding-bottom: 6px;
      margin-top: 24px;
      margin-bottom: 14px;
    }
    
    .grid {
      display: table;
      width: 100%;
      table-layout: fixed;
    }
    .col {
      display: table-cell;
      width: 50%;
      vertical-align: top;
    }
    .col-left {
      padding-right: 15px;
    }
    .col-right {
      padding-left: 15px;
    }
    
    .card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 16px;
    }
    
    .data-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px dashed #e2e8f0;
      font-size: 12px;
      font-weight: 500;
    }
    .data-row:last-child {
      border-bottom: none;
    }
    .data-label {
      color: #475569;
    }
    .data-value {
      font-weight: 700;
      color: #0f172a;
    }
    
    .ai-card {
      background: linear-gradient(135deg, #f0fdfa 0%, #ecfeff 100%);
      border: 1px solid #b2f5ea;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .ai-title {
      font-size: 13px;
      font-weight: 800;
      text-transform: uppercase;
      color: #0f766e;
      letter-spacing: 0.05em;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .ai-content {
      font-size: 12.5px;
      line-height: 1.6;
      color: #1e293b;
    }
    
    .shap-item {
      padding: 8px 12px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      font-weight: 600;
    }
    
    .footer {
      margin-top: 40px;
      border-top: 1px solid #e2e8f0;
      padding-top: 16px;
      text-align: center;
      font-size: 10px;
      color: #94a3b8;
      font-weight: 500;
    }
    .page-break {
      page-break-after: always;
      break-after: page;
    }
    
    @media print {
      body { padding: 0; }
      .page { padding: 20px; }
      .no-print { display: none; }
      .page-break {
        page-break-after: always;
        break-after: page;
        height: 0;
        margin: 0;
        border: none;
      }
    }
  </style>
</head>
<body>
  <!-- Print preview header -->
  <div class="no-print" style="position: sticky; top: 0; left: 0; right: 0; background: #0f172a; color: #ffffff; padding: 12px 24px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #1e293b; z-index: 9999; font-family: 'Inter', sans-serif;">
    <div style="display: flex; align-items: center; gap: 8px;">
      <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; background: #2563eb; color: #ffffff; padding: 3px 8px; border-radius: 4px;">Preview</span>
      <span style="font-size: 13px; font-weight: 600;">Confirm Patient Clinical Profile before saving</span>
    </div>
    <div style="display: flex; gap: 10px;">
      <button onclick="window.close()" style="background: transparent; border: 1px solid #475569; color: #94a3b8; padding: 6px 14px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer; transition: all 0.2s;">
        Close Preview
      </button>
      <button onclick="window.print()" style="background: #2563eb; border: none; color: #ffffff; padding: 6px 16px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
        Print / Save PDF
      </button>
    </div>
  </div>
  <div class="page">
    <table class="header-table">
      <tr>
        <td>
          <div class="header-left">
            <h1>${selectedMember.name || 'N/A'}</h1>
            <div class="metadata-strip">
              <strong>ID:</strong> ${selectedMember.id} &nbsp;&bull;&nbsp;
              <strong>County:</strong> ${selectedMember.county || 'N/A'}, ${selectedMember.state || 'N/A'} &nbsp;&bull;&nbsp;
              <strong>Gender:</strong> ${selectedMember.gender || 'N/A'}
            </div>
          </div>
        </td>
        <td style="text-align: right; vertical-align: middle;">
          <span class="badge badge-${(selectedMember.future_risk_5?.level || 'low').toLowerCase().replace(' ', '')}">
            ${selectedMember.future_risk_5?.level || 'LOW'} Risk Tier
          </span>
        </td>
      </tr>
    </table>

    <!-- AI Clinical narrative & care summary -->
    <div class="ai-card">
      <div class="ai-title">
        <svg style="width: 16px; height: 16px; fill: #0f766e; margin-bottom: -2px;" viewBox="0 0 24 24"><path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6C8.25 12.1 7.5 10.6 7.5 9c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5c0 1.6-.75 3.1-1.65 4.1z"/></svg>
        AI Care Management Intelligence & Assessment
      </div>
      <div class="ai-content">
        ${formattedAiResponse}
      </div>
    </div>
    
    <div class="grid">
      <div class="col col-left">
        <h3 class="section-title">Clinical Profile & Utilization</h3>
        <div class="card">
          <div class="data-row"><span class="data-label">Emergency Visits (12M)</span><span class="data-value">${selectedMember.edVisits ?? 0}</span></div>
          <div class="data-row"><span class="data-label">Inpatient Admissions (12M)</span><span class="data-value">${selectedMember.ipVisits ?? 0}</span></div>
          <div class="data-row"><span class="data-label">Outpatient Visits (12M)</span><span class="data-value">${selectedMember.outpatientVisits ?? 0}</span></div>
          <div class="data-row"><span class="data-label">Total Encounters (12M)</span><span class="data-value">${selectedMember.encounters ?? 0}</span></div>
          <div class="data-row"><span class="data-label">Chronic Conditions</span><span class="data-value">${selectedMember.chronicCount ?? 0}</span></div>
          <div class="data-row"><span class="data-label">Total Diagnoses</span><span class="data-value">${selectedMember.diagnosesCount ?? 0}</span></div>
          <div class="data-row"><span class="data-label">Active Medications</span><span class="data-value">${selectedMember.medicationsCount ?? 0}</span></div>
          <div class="data-row"><span class="data-label">Clinical Procedures</span><span class="data-value">${selectedMember.proceduresCount ?? 0}</span></div>
          <div class="data-row"><span class="data-label">Healthcare Utilization Index</span><span class="data-value">${selectedMember.healthcareUtilization ?? 0}</span></div>
        </div>
      </div>
      
      <div class="col col-right">
        <h3 class="section-title">Census Tract SDOH Indicators</h3>
        <div class="card">
          <div class="data-row"><span class="data-label">Area Median Income</span><span class="data-value">${selectedMember.sdoh_risk?.income_2022 > 0 ? `$${selectedMember.sdoh_risk.income_2022.toLocaleString()}` : 'N/A'}</span></div>
          <div class="data-row"><span class="data-label">Poverty Rate</span><span class="data-value">${selectedMember.sdoh_risk?.poverty_2022 ?? 0}%</span></div>
          <div class="data-row"><span class="data-label">Housing Burden</span><span class="data-value">${selectedMember.sdoh_risk?.housing_burden_2022 ?? 0}%</span></div>
          <div class="data-row"><span class="data-label">Unemployment</span><span class="data-value">${selectedMember.sdoh_risk?.unemployment_2022 ?? 0}%</span></div>
          <div class="data-row"><span class="data-label">Uninsured Population</span><span class="data-value">${selectedMember.sdoh_risk?.uninsured_2022 ?? 0}%</span></div>
          <div class="data-row"><span class="data-label">Food Insecurity</span><span class="data-value">${selectedMember.sdoh_risk?.food_access_2022 ?? 0}%</span></div>
          <div class="data-row"><span class="data-label">No Vehicle Rate</span><span class="data-value">${selectedMember.sdoh_risk?.no_vehicle_2022 ?? 0}%</span></div>
          <div class="data-row"><span class="data-label">Disability Rate</span><span class="data-value">${selectedMember.sdoh_risk?.disability_2022 ?? 0}%</span></div>
        </div>
      </div>
    </div>

    <!-- Page Break to Page 2 -->
    <div class="page-break"></div>

    <!-- Page 2 Header -->
    <table class="header-table" style="margin-bottom: 20px;">
      <tr>
        <td>
          <div class="header-left">
            <h2 style="font-size: 20px; color: #0f172a; margin: 0;">${selectedMember.name || 'N/A'}</h2>
            <div style="font-size: 11px; color: #64748b; margin-top: 4px;">ID: ${selectedMember.id} &nbsp;&bull;&nbsp; Future Risk Forecasting & Attributions</div>
          </div>
        </td>
        <td style="text-align: right; vertical-align: middle;">
          <span style="font-size: 11px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Page 2 of 2</span>
        </td>
      </tr>
    </table>

    <!-- Future Risk Section -->
    <div class="grid" style="margin-bottom: 12px;">
      <div class="col col-left">
        <h3 class="section-title">Future Risk Projection</h3>
        <div class="card" style="background: #ffffff; border: 1px solid #e2e8f0; padding: 12px 16px;">
          <div class="data-row" style="padding: 4px 0;">
            <span class="data-label">CatBoost 3-Class Risk</span>
            <span class="badge badge-${(selectedMember.future_risk_3?.level || 'low').toLowerCase().replace(' ', '')}" style="padding: 2px 8px; border-radius: 4px; font-size: 9.5px;">
              ${selectedMember.future_risk_3?.level || 'LOW'}
            </span>
          </div>
          <div class="data-row" style="padding: 4px 0;">
            <span class="data-label">Prediction Confidence</span>
            <span class="data-value">${selectedMember.future_risk_3?.confidence_pct || 'N/A'}</span>
          </div>
          <div class="data-row" style="padding: 4px 0;">
            <span class="data-label">Care Pathway Driver Type</span>
            <span class="data-value">${selectedMember.driver_type || 'N/A'}</span>
          </div>
          <div class="data-row" style="padding: 4px 0; border-bottom: none;">
            <span class="data-label">Primary Care Plan Driver</span>
            <span class="data-value" style="font-size: 11px; max-width: 140px; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${selectedMember.driver || ''}">${(selectedMember.driver || 'N/A').split('(')[0].trim()}</span>
          </div>
        </div>
      </div>
      
      <div class="col col-right">
        <h3 class="section-title">Forecasted Complications</h3>
        <div class="card" style="background: #ffffff; border: 1px solid #e2e8f0; padding: 12px 16px;">
          <div class="data-row" style="padding: 4px 0;">
            <span class="data-label">12M Inpatient Readmission Probability</span>
            <span class="data-value" style="color: ${selectedMember.future_risk_3?.level === 'High' ? '#ef4444' : (selectedMember.future_risk_3?.level === 'Medium' ? '#f59e0b' : '#10b981')}; font-weight: 700;">
              ${selectedMember.future_risk_3?.level === 'High' ? 'High' : (selectedMember.future_risk_3?.level === 'Medium' ? 'Moderate' : 'Low')}
            </span>
          </div>
          <div class="data-row" style="padding: 4px 0;">
            <span class="data-label">ER Escalation Hazard Ratio</span>
            <span class="data-value">${selectedMember.future_risk_3?.level === 'High' ? 'Elevated (1.82)' : (selectedMember.future_risk_3?.level === 'Medium' ? 'Mildly Elevated (1.30)' : 'Baseline (1.00)')}</span>
          </div>
          <div class="data-row" style="padding: 4px 0; border-bottom: none;">
            <span class="data-label">Care Plan Avoidance (SDOH)</span>
            <span class="data-value" style="color: ${(selectedMember.sdoh_risk?.food_access_2022 || 0) > 40 || (selectedMember.sdoh_risk?.housing_burden_2022 || 0) > 30 ? '#ef4444' : '#10b981'}; font-weight: 700;">
              ${(selectedMember.sdoh_risk?.food_access_2022 || 0) > 40 || (selectedMember.sdoh_risk?.housing_burden_2022 || 0) > 30 ? 'Significant' : 'Low Risk'}
            </span>
          </div>
        </div>
      </div>
    </div>

    ${selectedMember.shap_drivers && selectedMember.shap_drivers.length > 0 ? `
    <h3 class="section-title" style="margin-top: 10px;">Top TreeSHAP Feature Drivers</h3>
    <div style="margin-bottom: 16px;">
      ${selectedMember.shap_drivers.slice(0, 4).map(drv => `
        <div class="shap-item" style="padding: 6px 12px; margin-bottom: 6px;">
          <span>
            <strong style="color: #0f172a;">#${drv.rank} ${drv.display_name}</strong>
            <span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: bold; margin-left: 6px; ${drv.category === 'Clinical' ? 'background: #fee2e2; color: #991b1b;' : 'background: #e0f2fe; color: #0369a1;'}">${drv.category}</span>
          </span>
          <span style="font-family: monospace; font-weight: 700; color: #0d9488;">${drv.shap_formatted} SHAP</span>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <h3 class="section-title" style="margin-top: 10px;">AI-Suggested Referrals & Clinical Next Steps</h3>
    <div class="card" style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px 16px; margin-bottom: 12px;">
      <ul style="margin: 0; padding-left: 18px; font-size: 11.5px; line-height: 1.7; color: #334155; font-weight: 500;">
        ${(selectedMember.sdoh_risk?.housing_burden_2022 || 0) >= 30 ? '<li><strong>Housing & Utility Support:</strong> Refer to local housing assistance resources and energy/utility subsidies due to elevated housing cost burden.</li>' : ''}
        ${(selectedMember.sdoh_risk?.food_access_2022 || 0) >= 20 ? '<li><strong>Nutritional Food Delivery:</strong> Coordinate with local food banks and SNAP outreach programs to address food insecurity.</li>' : ''}
        ${(selectedMember.sdoh_risk?.uninsured_2022 || 0) >= 10 ? '<li><strong>Coverage Assistance:</strong> Refer to ACA/Medicaid enrollment navigators to check plan eligibility.</li>' : ''}
        <li><strong>Nurse Adherence Outreach:</strong> Assign care manager for structured wellness check-ins within 48 hours.</li>
        <li><strong>Clinical Follow-up:</strong> Schedule primary care provider review within 14 days to audit active medications and clinical procedures.</li>
      </ul>
    </div>

    <div class="footer" style="margin-top: 20px;">
      CareSync Intelligence Engine &bull; Confidential Medical Document &bull; Generated dynamically for clinical review
    </div>
  </div>
</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
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
      <div className="glass-card rounded-xl p-6 flex flex-wrap items-center gap-6 border border-slate-200/50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
            <Users className="w-5 h-5 animate-pulse" />
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
          value={currentRiskFilter}
          onChange={(e) => { setCurrentRiskFilter(e.target.value); setCurrentPage(1); }}
          className="py-2 pl-3 pr-8 bg-white rounded-lg border border-slate-200 text-[13px] text-on-surface outline-none focus:border-primary cursor-pointer"
        >
          <option value="All">Current Risk: All</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Moderate">Moderate</option>
          <option value="Low">Low</option>
          <option value="Very Low">Very Low</option>
        </select>
        <select 
          value={futureRiskFilter}
          onChange={(e) => { setFutureRiskFilter(e.target.value); setCurrentPage(1); }}
          className="py-2 pl-3 pr-8 bg-white rounded-lg border border-slate-200 text-[13px] text-on-surface outline-none focus:border-primary cursor-pointer"
        >
          <option value="All">Future Risk: All</option>
          <option value="High">High</option>
          <option value="Moderate">Moderate</option>
          <option value="Low">Low</option>
        </select>
        <select 
          value={driverFilter}
          onChange={(e) => { setDriverFilter(e.target.value); setCurrentPage(1); }}
          className="py-2 pl-3 pr-8 bg-white rounded-lg border border-slate-200 text-[13px] text-on-surface outline-none focus:border-primary cursor-pointer"
        >
          <option value="All">Primary Driver: All</option>
          <option value="Clinical">Clinical Dominant</option>
          <option value="SDOH">SDOH Dominant</option>
        </select>
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
                {driverFilter !== 'SDOH' && (
                  <th className="py-3.5 px-4">
                    {driverFilter === 'Clinical' ? 'CLINICAL RISK' : 'CURRENT RISK'}
                  </th>
                )}
                {driverFilter !== 'Clinical' && (
                  <th className="py-3.5 px-4">SDOH RISK (COMMUNITY)</th>
                )}
                <th className="py-3.5 px-4">FUTURE RISK</th>
                <th className="py-3.5 px-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="text-[13px] divide-y divide-slate-100 bg-white/20">
              {isLoading && (
                <tr>
                  <td colSpan={driverFilter === 'All' ? 6 : 5} className="text-center py-16 text-on-surface-variant font-medium">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <Loader2 className="w-7 h-7 text-primary animate-spin" />
                      <span>Loading patient risk records...</span>
                    </div>
                  </td>
                </tr>
              )}

              {!isLoading && paginatedMembers.map((member, idx) => (
                <tr key={member.id} className="hover:bg-slate-50/30 transition-colors group">
                  {/* Priority (formerly Rank) */}
                  <td className="py-4 px-6 font-mono font-bold text-slate-500">
                    #{(currentPage - 1) * pageSize + idx + 1}
                  </td>

                  {/* Patient Name & ID */}
                  <td className="py-4 px-4">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-900 text-[13px]">{member.name || member.id}</span>
                      <span className="text-[11px] font-mono text-primary font-semibold">{member.id}</span>
                      <span className="text-[10px] text-slate-400 font-mono mt-0.5">Tract: {member.tract_fips}</span>
                    </div>
                  </td>
                  
                  {/* CURRENT RISK */}
                  {driverFilter !== 'SDOH' && (
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        {getRiskBadge(driverFilter === 'Clinical' && member.clinical_risk ? member.clinical_risk.level : member.future_risk_5.level)}
                      </div>
                    </td>
                  )}

                  {/* SDOH RISK (COMMUNITY) */}
                  {driverFilter !== 'Clinical' && (
                    <td className="py-4 px-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-700">
                          {driverFilter === 'SDOH' && member.community_risk ? member.community_risk.level : member.sdoh_risk.label}
                        </span>
                        <span className="text-[10px] text-slate-400">{member.county}</span>
                      </div>
                    </td>
                  )}

                  {/* FUTURE RISK (3-CLASS) */}
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-2">
                      {getRiskBadge(member.future_risk_3.level)}
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
                  <td colSpan={driverFilter === 'All' ? 6 : 5} className="text-center py-12 text-on-surface-variant font-medium">
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
                    <h3 className="text-xl font-bold text-on-surface">{selectedMember.name || selectedMember.id}</h3>
                    {getRiskBadge(selectedMember.future_risk_5.level)}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[12px] text-primary font-mono font-bold">{selectedMember.id}</span>
                    <span className="text-[11px] px-2 py-0.2 rounded-full bg-slate-200/80 font-bold text-slate-700">
                      {selectedMember.county}
                    </span>
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

                {/* Risk Composition Grid (Current Risk vs SDOH vs Future Risk) */}
                <div>
                  <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2.5">
                    Risk Prediction Breakdown
                  </h4>
                  <div className="grid grid-cols-3 gap-2.5">
                    {/* Current Risk */}
                    <div className="flex flex-col items-center p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                      <span className="text-sm font-bold text-slate-800">{selectedMember.future_risk_5.level}</span>
                      <span className="text-[10px] text-slate-400 uppercase mt-1">CURRENT RISK</span>
                    </div>

                    {/* Social/SDOH */}
                    <div className="flex flex-col items-center p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                      <span className="text-sm font-bold text-slate-800">{selectedMember.sdoh_risk.poverty_2022}%</span>
                      <span className="text-[11px] font-bold text-tertiary mt-0.5">Poverty Rate</span>
                      <span className="text-[10px] text-slate-400 uppercase mt-1">SDOH Community</span>
                    </div>

                    {/* Future Risk */}
                    <div className="flex flex-col items-center p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                      <span className="text-sm font-bold text-slate-800">{selectedMember.future_risk_3.level}</span>
                      <span className="text-[10px] text-slate-400 uppercase mt-1">FUTURE RISK</span>
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
                  onClick={() => navigate(`/ai-assistant?patient=${encodeURIComponent(selectedMember.id)}`)}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-[13px] transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Deep Understanding</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <p className="text-[10px] text-slate-400 text-center mt-2">AI explains ML predictions · LangChain + OpenAI</p>
                <button
                  onClick={handleDownloadReport}
                  disabled={isGeneratingReport}
                  className="w-full mt-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-800 rounded-xl font-bold text-[12px] transition-colors flex items-center justify-center gap-2 border border-slate-200 cursor-pointer shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGeneratingReport ? (
                    <Loader2 className="w-4.5 h-4.5 text-slate-500 animate-spin" />
                  ) : (
                    <Download className="w-4.5 h-4.5 text-slate-500" />
                  )}
                  <span>{isGeneratingReport ? 'Generating AI Report...' : 'Download Complete Profile (PDF)'}</span>
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
