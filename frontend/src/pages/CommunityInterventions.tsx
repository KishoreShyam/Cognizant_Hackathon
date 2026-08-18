import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Loader2, 
  AlertOctagon, 
  AlertTriangle, 
  CheckCircle, 
  MapPin, 
  Send, 
  History, 
  ShieldAlert, 
  Sparkles, 
  Mail, 
  ChevronRight,
  RefreshCw,

  CheckCircle2,
  X
} from 'lucide-react';


interface CountyData {
  county_fips: string;
  county_name: string;
  state: string;
  total_tracts: number;
  avg_risk: number;
  high_tracts: number;
  vhigh_tracts: number;
  pct_priority_tracts: number;
  risk_level: string;
  priority: string;
  top_driver: string;
  priority_domain: string;
  notification_status: string;
}

interface DriverData {
  rank: number;
  feature: string;
  display_name: string;
  domain: string;
  shap_value: number;
  shap_formatted: string;
  contribution_percentage: number;
  average_raw_value: number;
}

interface InterventionDomain {
  name: string;
  primary_driver: string;
  shap_value: number;
  shap_formatted: string;
  interventions: string[];
  reason: string;
}

interface NotificationData {
  notification_id: string;
  county_fips: string;
  county_name: string;
  municipality: string;
  risk_score: number;
  risk_level: string;
  primary_driver: string;
  primary_driver_shap: number;
  domain: string;
  priority: string;
  intervention: string;
  reason: string;
  recipient_email: string;
  email_type: string;
  status: string;
  ai_email_subject: string | null;
  ai_email_body: string | null;
  created_at: string;
  sent_at: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
}

const CommunityInterventions: React.FC = () => {


  // Active view: 'prioritization' or 'history'
  const [activeTab, setActiveTab] = useState<'prioritization' | 'history'>('prioritization');

  // Search & Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState('All');
  const [domainFilter, setDomainFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  // Selected County drawer state
  const [selectedCountyFips, setSelectedCountyFips] = useState<string | null>(null);
  const [countyDetails, setCountyDetails] = useState<any>(null);
  const [countyDrivers, setCountyDrivers] = useState<DriverData[]>([]);
  const [countyInterventions, setCountyInterventions] = useState<InterventionDomain[]>([]);
  const [activeNotification, setActiveNotification] = useState<NotificationData | null>(null);
  const [activeDomainTab, setActiveDomainTab] = useState<string>('');

  // Main lists state
  const [counties, setCounties] = useState<CountyData[]>([]);
  const [historyList, setHistoryList] = useState<NotificationData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);

  const [isAiLoading, setIsAiLoading] = useState(false);

  // Helper to ensure notification has default subject/body if empty
  const populateDefaultEmailDraft = (notif: any) => {
    if (!notif) return null;
    const updated = { ...notif };
    if (!updated.ai_email_subject) {
      updated.ai_email_subject = "";
    }
    if (!updated.ai_email_body) {
      updated.ai_email_body = "";
    }
    return updated;
  };

  // Load initial data
  const loadData = async () => {
    setIsLoading(true);
    try {
      const countiesRes = await fetch('http://127.0.0.1:8000/api/community/counties/').catch(() => fetch('/api/community/counties/'));
      if (countiesRes.ok) {
        const data = await countiesRes.json();
        setCounties(data);
      }

      const historyRes = await fetch('http://127.0.0.1:8000/api/community/notifications/').catch(() => fetch('/api/community/notifications/'));
      if (historyRes.ok) {
        const data = await historyRes.json();
        setHistoryList(data);
      }
    } catch (err) {
      console.error("Failed to load community interventions data", err);
      setNotice({ type: 'error', msg: 'Backend API connection failed. Please ensure the Django server is running on port 8000.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Fetch specific county detail drawer metrics
  useEffect(() => {
    if (selectedCountyFips) {
      // Clear previous county states immediately to prevent state leakage during loading
      setCountyDetails(null);
      setCountyDrivers([]);
      setCountyInterventions([]);
      setActiveNotification(null);

      const fetchCountyDetails = async () => {
        setIsDetailLoading(true);
        try {
          const detailRes = await fetch(`http://127.0.0.1:8000/api/community/counties/${selectedCountyFips}/`).catch(() => fetch(`/api/community/counties/${selectedCountyFips}/`));
          const driversRes = await fetch(`http://127.0.0.1:8000/api/community/counties/${selectedCountyFips}/drivers/`).catch(() => fetch(`/api/community/counties/${selectedCountyFips}/drivers/`));
          const intervRes = await fetch(`http://127.0.0.1:8000/api/community/counties/${selectedCountyFips}/interventions/`).catch(() => fetch(`/api/community/counties/${selectedCountyFips}/interventions/`));
          const notifsRes = await fetch(`http://127.0.0.1:8000/api/community/notifications/?county_fips=${selectedCountyFips}`).catch(() => fetch(`/api/community/notifications/?county_fips=${selectedCountyFips}`));

          if (detailRes.ok && driversRes.ok && intervRes.ok && notifsRes.ok) {
            const detailData = await detailRes.json();
            const driversData = await driversRes.json();
            const intervData = await intervRes.json();
            const notifsData = await notifsRes.json();

            setCountyDetails(detailData);
            setCountyDrivers(driversData.drivers);
            setCountyInterventions(intervData.domains);

            // Set active domain tab default
            const firstDomainName = intervData.domains.length > 0 ? intervData.domains[0].name : '';
            if (firstDomainName) {
              setActiveDomainTab(firstDomainName);
            }

            // Find or automatically create active notification in the background
            let activeNotif = notifsData.find((n: any) => n.status !== 'RESOLVED' && n.status !== 'FAILED') || null;
            
            if (!activeNotif && firstDomainName) {
              try {
                const autoGenRes = await fetch('http://127.0.0.1:8000/api/community/interventions/generate/', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ county_fips: selectedCountyFips, domain: firstDomainName })
                }).catch(() => fetch('/api/community/interventions/generate/', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ county_fips: selectedCountyFips, domain: firstDomainName })
                }));

                if (autoGenRes.ok) {
                  const autoGenData = await autoGenRes.json();
                  activeNotif = autoGenData.notification;
                  loadData(); // refresh parent count stats
                }
              } catch (e) {
                console.error("Auto-generate notification error", e);
              }
            }

            setActiveNotification(populateDefaultEmailDraft(activeNotif));
          }
        } catch (err) {
          console.error("Error fetching county details", err);
        } finally {
          setIsDetailLoading(false);
        }
      };

      fetchCountyDetails();
    } else {
      setCountyDetails(null);
      setCountyDrivers([]);
      setCountyInterventions([]);
      setActiveNotification(null);

    }
  }, [selectedCountyFips]);

  // Prevent background scroll when drawer is open
  useEffect(() => {
    if (selectedCountyFips) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [selectedCountyFips]);



  const handleDomainTabChange = async (domainName: string) => {
    setActiveDomainTab(domainName);
    if (!selectedCountyFips) return;
    
    setIsDetailLoading(true);
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/community/notifications/?county_fips=${selectedCountyFips}&domain=${domainName}`).catch(() => fetch(`/api/community/notifications/?county_fips=${selectedCountyFips}&domain=${domainName}`));
      if (res.ok) {
        const notifs = await res.json();
        let activeNotif = notifs.find((n: any) => n.status !== 'RESOLVED' && n.status !== 'FAILED') || null;
        
        if (!activeNotif) {
          // Auto-generate under the hood!
          const genRes = await fetch('http://127.0.0.1:8000/api/community/interventions/generate/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ county_fips: selectedCountyFips, domain: domainName })
          }).catch(() => fetch('/api/community/interventions/generate/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ county_fips: selectedCountyFips, domain: domainName })
          }));

          if (genRes.ok) {
            const genData = await genRes.json();
            activeNotif = genData.notification;
            loadData();
          }
        }
        setActiveNotification(populateDefaultEmailDraft(activeNotif));
      }
    } catch (err) {
      console.error("Failed to swap domain notification auto-generator:", err);
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleSendNotification = async (notifId: string, simulate: boolean) => {
    setIsActionLoading(true);
    const endpoint = simulate ? 'simulate' : 'send';
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/community/notifications/${notifId}/${endpoint}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ai_email_subject: activeNotification?.ai_email_subject,
          ai_email_body: activeNotification?.ai_email_body,
          recipient_email: activeNotification?.recipient_email
        })
      }).catch(() => fetch(`/api/community/notifications/${notifId}/${endpoint}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ai_email_subject: activeNotification?.ai_email_subject,
          ai_email_body: activeNotification?.ai_email_body,
          recipient_email: activeNotification?.recipient_email
        })
      }));

      if (res.ok) {
        const result = await res.json();
        setActiveNotification(populateDefaultEmailDraft(result.notification));
        setNotice({ type: 'success', msg: result.message || 'Intervention notification triggered.' });
        loadData();
      }
    } catch (err) {
      console.error(err);
      setNotice({ type: 'error', msg: 'Error sending intervention notification.' });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleUpdateStatus = async (notifId: string, newStatus: string) => {
    setIsActionLoading(true);
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/community/notifications/${notifId}/status/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      }).catch(() => fetch(`/api/community/notifications/${notifId}/status/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      }));

      if (res.ok) {
        const result = await res.json();
        setActiveNotification(populateDefaultEmailDraft(result.notification));
        setNotice({ type: 'success', msg: result.message || 'Intervention workflow status updated.' });
        loadData();
      }
    } catch (err) {
      console.error(err);
      setNotice({ type: 'error', msg: 'Failed to update intervention status.' });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleGenerateAIEmail = async (notifId: string) => {
    setIsAiLoading(true);
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/community/notifications/${notifId}/generate-ai-email/`, {
        method: 'POST'
      }).catch(() => fetch(`/api/community/notifications/${notifId}/generate-ai-email/`, {
        method: 'POST'
      }));

      if (res.ok) {
        const result = await res.json();
        setActiveNotification(populateDefaultEmailDraft(result.notification));
        setNotice({ type: 'success', msg: result.message || 'AI Email successfully generated.' });

        loadData();
      } else {
        const errorData = await res.json();
        setNotice({ type: 'error', msg: errorData.error || 'Failed to generate AI email.' });
      }
    } catch (err) {
      console.error(err);
      setNotice({ type: 'error', msg: 'Failed to connect to OpenAI API endpoint.' });
    } finally {
      setIsAiLoading(false);
    }
  };

  // Filter lists
  const filteredCounties = useMemo(() => {
    return counties.filter(county => {
      // Interventions prioritization should show only High and Critical risks
      const isHighOrCritical = county.risk_level.toUpperCase() === 'HIGH' || county.risk_level.toUpperCase() === 'VERY HIGH' || county.risk_level.toUpperCase() === 'CRITICAL';
      if (!isHighOrCritical) return false;

      const matchesSearch = county.county_name.toLowerCase().includes(searchQuery.toLowerCase()) || county.top_driver.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRisk = riskFilter === 'All' || county.risk_level.toLowerCase() === riskFilter.toLowerCase();
      const matchesDomain = domainFilter === 'All' || county.priority_domain.toLowerCase() === domainFilter.toLowerCase();
      const matchesStatus = statusFilter === 'All' || county.notification_status.toLowerCase() === statusFilter.toLowerCase();
      return matchesSearch && matchesRisk && matchesDomain && matchesStatus;
    });
  }, [counties, searchQuery, riskFilter, domainFilter, statusFilter]);

  const filteredHistory = useMemo(() => {
    return historyList.filter(item => {
      const matchesSearch = item.county_name.toLowerCase().includes(searchQuery.toLowerCase()) || item.domain.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDomain = domainFilter === 'All' || item.domain.toLowerCase() === domainFilter.toLowerCase();
      const matchesStatus = statusFilter === 'All' || item.status.toLowerCase() === statusFilter.toLowerCase();
      return matchesSearch && matchesDomain && matchesStatus;
    });
  }, [historyList, searchQuery, domainFilter, statusFilter]);

  // Aggregate dashboard metrics
  const kpis = useMemo(() => {
    const total = counties.length;
    const highVeryHigh = counties.filter(c => c.risk_level === 'HIGH' || c.risk_level === 'VERY HIGH' || c.risk_level === 'CRITICAL').length;
    const active = historyList.filter(h => h.status !== 'RESOLVED' && h.status !== 'FAILED').length;
    const pending = historyList.filter(h => h.status === 'PENDING').length;
    const sent = historyList.filter(h => h.status === 'SENT' || h.status === 'SIMULATED').length;
    const resolved = historyList.filter(h => h.status === 'RESOLVED').length;

    return { total, highVeryHigh, active, pending, sent, resolved };
  }, [counties, historyList]);

  // Risk badges
  const getRiskBadgeClass = (level: string) => {
    const l = level.toUpperCase();
    if (l === 'VERY HIGH' || l === 'CRITICAL') return 'bg-rose-100 text-rose-700 border-rose-200';
    if (l === 'HIGH') return 'bg-orange-100 text-orange-700 border-orange-200';
    if (l === 'MEDIUM' || l === 'MODERATE') return 'bg-amber-100 text-amber-700 border-amber-200';
    if (l === 'LOW') return 'bg-teal-100 text-teal-700 border-teal-200';
    return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  };

  const getPriorityBadgeClass = (level: string) => {
    const l = level.toUpperCase();
    if (l === 'CRITICAL') return 'bg-rose-50 text-rose-700 border-rose-200/50';
    if (l === 'HIGH') return 'bg-orange-50 text-orange-700 border-orange-200/50';
    if (l === 'MODERATE' || l === 'MEDIUM') return 'bg-amber-50 text-amber-700 border-amber-200/50';
    return 'bg-teal-50 text-teal-700 border-teal-200/50';
  };

  // Status badges
  const getStatusBadgeClass = (status: string) => {
    const s = status.toUpperCase();
    if (s === 'SENT') return 'bg-blue-100 text-blue-700 border-blue-200';
    if (s === 'SIMULATED') return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    if (s === 'ACKNOWLEDGED') return 'bg-purple-100 text-purple-700 border-purple-200';
    if (s === 'IN_PROGRESS') return 'bg-orange-100 text-orange-700 border-orange-200';
    if (s === 'RESOLVED') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (s === 'FAILED') return 'bg-red-100 text-red-700 border-red-200';
    if (s === 'PENDING') return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  return (
    <div className="flex flex-col gap-6 w-full flex-1">
      {/* Notice alert */}
      {notice && (
        <div className={`p-4 rounded-xl border text-xs font-semibold flex items-center justify-between shadow-sm shrink-0 ${
          notice.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 
          notice.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-950' : 'bg-blue-50 border-blue-200 text-blue-950'
        }`}>
          <div className="flex items-center gap-2">
            {notice.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />}
            <span>{notice.msg}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-slate-500 hover:text-slate-800 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="glass-card p-4 flex flex-col justify-between border-t-4 border-t-slate-800">
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">Total Counties</span>
          <div className="text-2xl font-black text-on-surface mt-2">{kpis.total}</div>
          <div className="text-[10px] text-slate-500 font-semibold mt-1">California state</div>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between border-t-4 border-t-rose-500">
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">Priority Counties</span>
          <div className="text-2xl font-black text-rose-600 mt-2">{kpis.highVeryHigh}</div>
          <div className="text-[10px] text-rose-600 font-bold mt-1 flex items-center gap-0.5"><AlertOctagon className="w-3 h-3" /> High/Critical Risk</div>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between border-t-4 border-t-orange-500">
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">Active Workflows</span>
          <div className="text-2xl font-black text-orange-600 mt-2">{kpis.active}</div>
          <div className="text-[10px] text-slate-500 font-semibold mt-1">Open notifications</div>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between border-t-4 border-t-amber-500">
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">Pending Actions</span>
          <div className="text-2xl font-black text-amber-600 mt-2">{kpis.pending}</div>
          <div className="text-[10px] text-slate-500 font-semibold mt-1">Requires send trigger</div>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between border-t-4 border-t-blue-500">
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">Notifications Sent</span>
          <div className="text-2xl font-black text-blue-600 mt-2">{kpis.sent}</div>
          <div className="text-[10px] text-blue-600 font-bold mt-1">Live/Simulated sends</div>
        </div>

        <div className="glass-card p-4 flex flex-col justify-between border-t-4 border-t-emerald-500 bg-emerald-500/5">
          <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">Resolved Cases</span>
          <div className="text-2xl font-black text-emerald-700 mt-2">{kpis.resolved}</div>
          <div className="text-[10px] text-emerald-700 font-bold mt-1 flex items-center gap-0.5"><CheckCircle className="w-3 h-3" /> Target achieved</div>
        </div>
      </div>

      {/* Main Workspace Frame */}
      <div className="glass-card flex flex-col min-h-[600px] border border-slate-200/60 overflow-hidden">
        {/* Workspace Tab Bar */}
        <div className="px-6 border-b border-slate-200/50 bg-white/40 backdrop-blur-sm flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0">
          <div className="flex border-b border-transparent">
            <button
              onClick={() => setActiveTab('prioritization')}
              className={`py-4 px-4 text-xs font-extrabold uppercase tracking-wider border-b-2 flex items-center gap-2 cursor-pointer transition-all ${
                activeTab === 'prioritization' ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              <MapPin className="w-4 h-4" /> County Prioritization
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`py-4 px-4 text-xs font-extrabold uppercase tracking-wider border-b-2 flex items-center gap-2 cursor-pointer transition-all ${
                activeTab === 'history' ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              <History className="w-4 h-4" /> Intervention History Log
            </button>
          </div>

          {/* Refresh Button */}
          <button onClick={loadData} className="py-2 px-3 text-xs font-extrabold text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-sm">
            <RefreshCw className="w-3.5 h-3.5" /> Reload Data
          </button>
        </div>

        {/* Filter bar */}
        <div className="p-4 bg-slate-50/50 border-b border-slate-200/40 flex flex-wrap items-center gap-4 shrink-0">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input 
              type="text" 
              placeholder={activeTab === 'prioritization' ? "Search County name or Driver..." : "Search County or Domain..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 border border-slate-200 rounded-md w-full bg-white text-xs font-semibold focus:outline-none focus:border-primary outline-none"
            />
          </div>

          {activeTab === 'prioritization' && (
            <select 
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              className="border border-slate-200 rounded-md px-3 py-1.5 bg-white text-xs font-semibold text-slate-600 focus:outline-none focus:border-primary min-w-[130px] cursor-pointer"
            >
              <option value="All">Risk Level: All</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
            </select>
          )}

          <select 
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            className="border border-slate-200 rounded-md px-3 py-1.5 bg-white text-xs font-semibold text-slate-600 focus:outline-none focus:border-primary min-w-[150px] cursor-pointer"
          >
            <option value="All">Domain: All</option>
            <option value="Healthcare Access">Healthcare Access</option>
            <option value="Social & Economic Services">Social & Economic Services</option>
            <option value="Food & Nutrition">Food & Nutrition</option>
            <option value="Transportation">Transportation</option>
            <option value="Housing">Housing</option>
          </select>

          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-slate-200 rounded-md px-3 py-1.5 bg-white text-xs font-semibold text-slate-600 focus:outline-none focus:border-primary min-w-[130px] cursor-pointer"
          >
            <option value="All">Status: All</option>
            {activeTab === 'prioritization' ? (
              <>
                <option value="None">No Active alert</option>
                <option value="PENDING">Pending Send</option>
                <option value="SIMULATED">Simulated Send</option>
                <option value="SENT">Sent Live</option>
                <option value="ACKNOWLEDGED">Acknowledged</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="RESOLVED">Resolved</option>
              </>
            ) : (
              <>
                <option value="PENDING">Pending</option>
                <option value="SIMULATED">Simulated</option>
                <option value="SENT">Sent</option>
                <option value="ACKNOWLEDGED">Acknowledged</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="RESOLVED">Resolved</option>
                <option value="FAILED">Failed</option>
              </>
            )}
          </select>
        </div>

        {/* Content list block */}
        <div className="flex-1 overflow-x-auto w-full custom-scrollbar min-h-[400px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-32 gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <span className="text-xs font-extrabold uppercase tracking-wider">Aggregating county risk data...</span>
            </div>
          ) : activeTab === 'prioritization' ? (
            /* Counties list table */
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead className="text-[10px] text-on-surface-variant uppercase tracking-wider font-extrabold border-b border-slate-200/40 bg-slate-50/50 shrink-0">
                <tr>
                  <th className="px-6 py-4">County</th>
                  <th className="px-6 py-4">Avg Tract Risk</th>
                  <th className="px-6 py-4">County Risk Level</th>
                  <th className="px-6 py-4">Top SDOH Driver</th>
                  <th className="px-6 py-4">Priority Intervention Domain</th>
                  <th className="px-6 py-4">Priority</th>
                  <th className="px-6 py-4">Active Alert Status</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="text-[13px] bg-white/20 divide-y divide-slate-100">
                {filteredCounties.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-20 text-slate-400 font-semibold">
                      No counties found matching the active search query and filters.
                    </td>
                  </tr>
                ) : (
                  filteredCounties.map((county) => (
                    <tr key={county.county_fips} className="hover:bg-slate-50/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-extrabold text-slate-800 text-[13px]">{county.county_name}</span>
                          <span className="text-[10px] font-mono text-primary font-bold">FIPS: {county.county_fips}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-black text-slate-900 text-base">{county.avg_risk}</span>
                        <span className="text-[10px] text-slate-400 font-extrabold"> / 100</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getRiskBadgeClass(county.risk_level)}`}>
                          {county.risk_level}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-700">{county.top_driver}</td>
                      <td className="px-6 py-4 font-medium text-slate-600">{county.priority_domain}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${getPriorityBadgeClass(county.priority)}`}>
                          {county.priority}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {county.notification_status !== 'None' ? (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadgeClass(county.notification_status)}`}>
                            {county.notification_status}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-bold uppercase">No Active Alert</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setSelectedCountyFips(county.county_fips)}
                          className="px-3 py-1.5 text-xs font-extrabold text-primary hover:bg-primary/5 rounded-md transition-colors border border-transparent cursor-pointer inline-flex items-center gap-1"
                        >
                          View Details <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            /* Notification History log */
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead className="text-[10px] text-on-surface-variant uppercase tracking-wider font-extrabold border-b border-slate-200/40 bg-slate-50/50">
                <tr>
                  <th className="px-6 py-4">Notification ID</th>
                  <th className="px-6 py-4">County</th>
                  <th className="px-6 py-4">Municipality</th>
                  <th className="px-6 py-4">Intervention Domain</th>
                  <th className="px-6 py-4">Recipient Contact</th>
                  <th className="px-6 py-4">Priority</th>
                  <th className="px-6 py-4">Created At</th>
                  <th className="px-6 py-4">Workflow Status</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="text-[13px] bg-white/20 divide-y divide-slate-100">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-20 text-slate-400 font-semibold">
                      No intervention notification records found matching filters.
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map((item) => (
                    <tr key={item.notification_id} className="hover:bg-slate-50/30 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-mono font-extrabold text-primary text-[12px]">{item.notification_id}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-extrabold text-slate-800">{item.county_name}</span>
                          <span className="text-[10px] font-mono text-slate-400">FIPS: {item.county_fips}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-700">{item.municipality}</td>
                      <td className="px-6 py-4 font-medium text-slate-600">{item.domain}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-800">{item.recipient_email}</span>
                          <span className="text-[9px] text-amber-600 font-bold uppercase tracking-wider">
                            {item.email_type.replace('_', ' ')}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${getPriorityBadgeClass(item.priority)}`}>
                          {item.priority}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-semibold">
                        {new Date(item.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadgeClass(item.status)}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedCountyFips(item.county_fips);
                            setActiveTab('prioritization');
                          }}
                          className="px-3 py-1.5 text-xs font-extrabold text-primary hover:bg-primary/5 border border-slate-200 rounded-md transition-all shadow-sm cursor-pointer inline-flex items-center gap-1"
                        >
                          Manager Workflow <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ─── DETAILED COUNTY WORKFLOW SIDE DRAWER ─── */}
      {selectedCountyFips && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex justify-end transition-opacity duration-300">
          <div className="w-full max-w-6xl bg-white h-screen shadow-2xl flex flex-col overflow-hidden animate-slide-in relative border-l border-slate-200">
            {/* Drawer Header */}
            <div className="px-6 py-5 border-b border-slate-200/60 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center shadow-inner">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-md font-black text-slate-800 leading-tight">
                    {countyDetails?.county_name || 'County Details'}
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-mono text-slate-400 font-bold uppercase">County FIPS: {selectedCountyFips}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">{countyDetails?.total_tracts} Census Tracts</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {countyDetails && (
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${getRiskBadgeClass(countyDetails.risk_level)}`}>
                    {countyDetails.risk_level} RISK
                  </span>
                )}
                <button 
                  onClick={() => setSelectedCountyFips(null)} 
                  className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer border border-transparent"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {isDetailLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <span className="text-xs font-bold uppercase tracking-wider">Loading risk attributions...</span>
              </div>
            ) : (
              <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-y-auto lg:overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
                {/* ── LEFT PANEL: Community Risk Components & Drivers Chart ── */}
                <div className="w-full lg:w-[38%] p-6 flex flex-col gap-6 overflow-y-auto min-h-0 custom-scrollbar">
                  {/* Community Risk Score Card */}
                  <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center justify-between shrink-0">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Average Tract Risk Score</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-black text-slate-900">{countyDetails?.avg_risk}</span>
                        <span className="text-xs font-bold text-slate-400">/ 100</span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium leading-relaxed mt-1">
                        Derived from the aggregated risk profiles of all {countyDetails?.total_tracts} Census tracts in {countyDetails?.county_name}.
                      </p>
                    </div>

                    {/* Progress Circle Visualizer */}
                    <div className="relative w-18 h-18 shrink-0 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="36" cy="36" r="30" stroke="#f1f5f9" strokeWidth="8" fill="transparent" />
                        <circle 
                          cx="36" cy="36" r="30" 
                          stroke={countyDetails?.avg_risk >= 30 ? "#f43f5e" : countyDetails?.avg_risk >= 27 ? "#f97316" : countyDetails?.avg_risk >= 24 ? "#f59e0b" : "#14b8a6"} 
                          strokeWidth="8" fill="transparent" 
                          strokeDasharray={2 * Math.PI * 30}
                          strokeDashoffset={2 * Math.PI * 30 * (1 - (countyDetails?.avg_risk || 0) / 100)}
                        />
                      </svg>
                      <span className="absolute text-[10px] font-black text-slate-700 uppercase">{countyDetails?.priority}</span>
                    </div>
                  </div>

                  {/* Top SDOH Drivers TreeSHAP Bar Chart */}
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-primary" /> SDOH Risk Attribution (TreeSHAP)
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Ranked features contributing most strongly to the aggregated community determinants of health risk.
                      </p>
                    </div>

                    <div className="space-y-4 pt-1">
                      {countyDrivers.slice(0, 5).map((driver, dIdx) => (
                        <div key={driver.feature} className="space-y-1.5">
                          <div className="flex justify-between items-center text-xs font-bold">
                            <span className="text-slate-700">#{driver.rank} {driver.display_name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-400 font-extrabold">Value: {driver.average_raw_value}%</span>
                              <span className="font-mono text-primary font-black">{driver.shap_formatted} impact</span>
                            </div>
                          </div>
                          <div className="relative w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${
                                dIdx === 0 ? 'bg-primary' : dIdx === 1 ? 'bg-primary/80' : 'bg-primary/50'
                              }`} 
                              style={{ width: `${driver.contribution_percentage * 3.5}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[9px] font-semibold text-slate-400">
                            <span>Contribution: {driver.contribution_percentage.toFixed(1)}%</span>
                            <span>{driver.domain}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── RIGHT PANEL: Recommended Interventions & Contacts Alert Router ── */}
                <div className="w-full lg:w-[62%] p-6 flex flex-col gap-6 overflow-y-auto min-h-0 custom-scrollbar bg-slate-50/20">
                  {/* Tab Selector for Recommended Interventions Domains */}
                  <div className="space-y-3 shrink-0">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Recommended Domains</label>
                    <div className="flex flex-wrap gap-2 border-b border-slate-200/50 pb-2">
                      {countyInterventions.map((dom) => (
                        <button
                          key={dom.name}
                          onClick={() => {
                            handleDomainTabChange(dom.name);
                          }}
                          className={`px-3 py-1.5 text-[11px] font-extrabold rounded-md border transition-all cursor-pointer ${
                            activeDomainTab === dom.name 
                              ? 'bg-primary text-white border-primary shadow-sm' 
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {dom.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Active Domain content card */}
                  {countyInterventions.map((dom) => {
                    if (dom.name !== activeDomainTab) return null;
                    return (
                      <div key={dom.name} className="space-y-4 animate-fade-in flex-1 flex flex-col min-h-0">
                        {/* Domain description */}
                        <div className="space-y-2 shrink-0">
                          <h4 className="text-[13px] font-extrabold text-slate-800 uppercase tracking-wider">{dom.name} Suggested Action</h4>
                          <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl space-y-1.5">
                            <span className="text-[9px] font-bold text-blue-700 uppercase tracking-wider block">TreeSHAP Explainability Driver</span>
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-sm font-black text-blue-800">{dom.primary_driver}</span>
                              <span className="text-xs font-mono text-blue-600 font-bold">{dom.shap_formatted} impact</span>
                            </div>
                            <p className="text-[11px] text-slate-600 font-medium leading-relaxed pt-0.5">
                              {dom.reason}
                            </p>
                          </div>
                        </div>

                        {/* List of recommended interventions */}
                        <div className="space-y-2 shrink-0">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Potential Outreach Interventions</label>
                          <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 space-y-2">
                            {dom.interventions.map((intv, idx) => (
                              <div key={idx} className="flex items-start gap-2 text-xs font-bold text-slate-700 leading-tight">
                                <span className="text-primary mt-0.5">•</span>
                                <span>{intv}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* MUNICIPALITY ROUTER AND WORKFLOW CONTROL */}
                        <div className="border-t border-slate-200/60 pt-4 flex-1 flex flex-col gap-4 min-h-0">
                          <div className="shrink-0">
                            <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Sector Notification Router</h4>
                            <p className="text-[10px] text-slate-500 mt-1">Routes county-level alerts directly to the responsible municipality authority.</p>
                          </div>

                          {/* Recipient Contact Card */}
                          <div className="p-3 bg-white border border-slate-200/60 rounded-xl space-y-2 shrink-0 shadow-sm">
                            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Recipient Details</span>
                            </div>
                            
                            {/* Contact Fields */}
                            <div className="grid grid-cols-2 gap-3 text-xs">
                              <div className="space-y-0.5">
                                <span className="text-[10px] text-slate-400 font-bold block">Authority Municipality</span>
                                <span className="font-extrabold text-slate-800 flex items-center gap-1">
                                  <MapPin className="w-3.5 h-3.5 text-primary shrink-0" /> {countyDetails?.county_name.replace('County', '').trim()} Region
                                </span>
                              </div>
                              <div className="space-y-0.5">
                                <span className="text-[10px] text-slate-400 font-bold block">Contact Email Address</span>
                                <span className="font-extrabold text-slate-800 flex items-center gap-1">
                                  <Mail className="w-3.5 h-3.5 text-primary shrink-0" /> {activeNotification?.recipient_email || (countyDetails?.county_name.replace(' ', '').replace('County', '').toLowerCase() + '.' + dom.name.split(' ')[0].toLowerCase() + '@municipal.gov')}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Alert workflow controls */}
                          <div className="space-y-3 shrink-0">
                            {!activeNotification ? (
                            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400 py-10">
                              <Loader2 className="w-6 h-6 text-primary animate-spin" />
                              <span className="text-[10px] font-bold uppercase tracking-wider">Provisioning intervention alert...</span>
                            </div>
                          ) : (
                            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 space-y-4 shadow-sm flex flex-col">
                              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Notification ID</span>
                                  <span className="font-mono font-extrabold text-primary text-xs">{activeNotification.notification_id}</span>
                                </div>
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadgeClass(activeNotification.status)}`}>
                                  {activeNotification.status}
                                </span>
                              </div>

                              {/* Flow triggers - Notify Mail */}
                              {activeNotification.status === 'PENDING' && (
                                <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 space-y-4 shadow-inner flex flex-col shrink-0">
                                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                                    <div className="flex items-center gap-1.5">
                                      <Mail className="w-4 h-4 text-primary" />
                                      <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Notify Mail</span>
                                    </div>
                                    <button
                                      onClick={() => handleGenerateAIEmail(activeNotification.notification_id)}
                                      disabled={isAiLoading || isActionLoading}
                                      className="py-1 px-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:from-indigo-600/50 disabled:to-violet-600/50 text-white text-[10px] font-black rounded-md cursor-pointer transition-all flex items-center justify-center gap-1 shadow-sm uppercase tracking-wider shrink-0"
                                    >
                                      {isAiLoading ? (
                                        <>
                                          <Loader2 className="w-3 h-3 animate-spin" /> Drafting AI...
                                        </>
                                      ) : (
                                        <>
                                          <Sparkles className="w-3 h-3 text-indigo-200" /> Generate AI Email (GPT)
                                        </>
                                      )}
                                    </button>
                                  </div>

                                  {/* To Option */}
                                  <div className="flex flex-col gap-1.5">
                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">To</label>
                                    <input
                                      type="text"
                                      value={activeNotification.recipient_email || ''}
                                      onChange={(e) => setActiveNotification(prev => prev ? { ...prev, recipient_email: e.target.value } : null)}
                                      className="w-full text-xs text-slate-800 font-sans p-2 border border-slate-200 rounded-lg bg-white outline-none focus:border-primary font-medium"
                                      placeholder="recipient@authority.gov"
                                    />
                                  </div>

                                  {/* Subject Option */}
                                  <div className="flex flex-col gap-1.5">
                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Subject</label>
                                    <input
                                      type="text"
                                      value={activeNotification.ai_email_subject || ''}
                                      onChange={(e) => setActiveNotification(prev => prev ? { ...prev, ai_email_subject: e.target.value } : null)}
                                      className="w-full text-xs text-slate-800 font-sans p-2 border border-slate-200 rounded-lg bg-white outline-none focus:border-primary font-medium"
                                      placeholder="Enter email subject or click 'Generate AI Email (GPT)' above..."
                                    />
                                  </div>

                                  {/* Body Option */}
                                  <div className="flex flex-col gap-1.5">
                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Draft Email Body</label>
                                    <textarea
                                      rows={10}
                                      value={activeNotification.ai_email_body || ''}
                                      onChange={(e) => setActiveNotification(prev => prev ? { ...prev, ai_email_body: e.target.value } : null)}
                                      className="w-full text-xs text-slate-800 font-sans p-3.5 bg-white border border-slate-200 rounded-lg leading-relaxed outline-none focus:border-primary resize-none custom-scrollbar min-h-[220px] max-h-[300px] overflow-y-auto font-medium shadow-sm"
                                      placeholder="Write custom outreach draft here, or click 'Generate AI Email (GPT)' above to automatically write a professional, county-tailored outreach letter..."
                                    />
                                  </div>

                                  <button
                                    onClick={() => handleSendNotification(activeNotification.notification_id, false)}
                                    disabled={isActionLoading || isAiLoading}
                                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 text-white text-xs font-black rounded-lg cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-sm uppercase tracking-wider mt-2"
                                  >
                                    {isActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send
                                  </button>
                                </div>
                              )}

                                {/* Advanced Workflow status triggers */}
                                {activeNotification.status !== 'PENDING' && activeNotification.status !== 'RESOLVED' && activeNotification.status !== 'FAILED' && (
                                  <div className="space-y-3 shrink-0">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Update Intervention Status</label>
                                    <div className="flex gap-2">
                                      {activeNotification.status === 'SIMULATED' || activeNotification.status === 'SENT' ? (
                                        <button
                                          onClick={() => handleUpdateStatus(activeNotification.notification_id, 'ACKNOWLEDGED')}
                                          disabled={isActionLoading}
                                          className="flex-1 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors shadow-sm"
                                        >
                                          Acknowledge Alert
                                        </button>
                                      ) : null}

                                      {activeNotification.status === 'ACKNOWLEDGED' && (
                                        <button
                                          onClick={() => handleUpdateStatus(activeNotification.notification_id, 'IN_PROGRESS')}
                                          disabled={isActionLoading}
                                          className="flex-1 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors shadow-sm"
                                        >
                                          Mark In Progress
                                        </button>
                                      )}

                                      {activeNotification.status === 'IN_PROGRESS' && (
                                        <button
                                          onClick={() => handleUpdateStatus(activeNotification.notification_id, 'RESOLVED')}
                                          disabled={isActionLoading}
                                          className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors shadow-sm"
                                        >
                                          Resolve Intervention
                                        </button>
                                      )}

                                      <button
                                        onClick={() => handleUpdateStatus(activeNotification.notification_id, 'FAILED')}
                                        disabled={isActionLoading}
                                        className="py-1.5 px-3 border border-red-200 text-red-700 hover:bg-red-50 text-xs font-bold rounded-lg cursor-pointer transition-colors"
                                      >
                                        Mark Failed
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* Resolved status state info card */}
                                {activeNotification.status === 'RESOLVED' && (
                                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-semibold flex items-center gap-2">
                                    <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                                    <div>
                                      <p className="font-extrabold text-emerald-900">Intervention Case Resolved</p>
                                      <p className="text-[10px] text-emerald-700 font-medium mt-0.5">
                                        Resolved on: {new Date(activeNotification.resolved_at || '').toLocaleDateString()}
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {/* Failed state info card */}
                                {activeNotification.status === 'FAILED' && (
                                  <div className="p-3 bg-red-50 border border-red-200 text-red-900 rounded-xl text-xs font-semibold flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                                    <div>
                                      <p className="font-extrabold text-red-900">Intervention Flagged Failed</p>
                                      <p className="text-[10px] text-red-700 font-medium mt-0.5">
                                        Case flagged failed. Try generating a new alert or checking contact endpoints.
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>


                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CommunityInterventions;
