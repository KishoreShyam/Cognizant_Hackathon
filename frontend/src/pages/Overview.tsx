import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  AlertTriangle, 
  Globe, 
  Brain, 
  Flag, 
  CheckCircle, 
  Info, 
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2
} from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

// Sparkline helper
const generateSparkData = (trend: 'up' | 'down' | 'flat') => {
  if (trend === 'up') return [{ v: 10 }, { v: 15 }, { v: 13 }, { v: 22 }, { v: 18 }, { v: 25 }];
  if (trend === 'down') return [{ v: 25 }, { v: 20 }, { v: 22 }, { v: 15 }, { v: 18 }, { v: 12 }];
  return [{ v: 15 }, { v: 16 }, { v: 15 }, { v: 17 }, { v: 16 }, { v: 16 }];
};

interface SummaryCardItem {
  title: string;
  value: string;
  trend: 'up' | 'down' | 'flat';
  subtext: string;
  trendType?: 'up' | 'down' | 'flat';
}

interface RiskSynthesisData {
  clinical_risk_pct: number;
  social_risk_pct: number;
  combined_risk_pct: number;
  model_confidence_label: string;
  model_confidence_pct: number;
}

interface SocialDriverItem {
  name: string;
  percentage: number;
  color: string;
  text: string;
}

interface SDOHImpactData {
  clinical_only_high: number;
  elevated_by_sdoh: number;
  combined_high: number;
  headline: string;
}

interface PriorityMemberItem {
  id: string;
  name?: string;
  priority: string;
  priorityColor: string;
  clinical: string;
  social: string;
  future_risk_5: string;
  future_risk_3: string;
  future6: string;
  future12: string;
  priorityScore: number;
  driver: string;
  action: string;
  status: string;
  statusColor: string;
}

interface OverviewApiResponse {
  summary_cards: SummaryCardItem[];
  risk_synthesis: RiskSynthesisData;
  social_drivers: SocialDriverItem[];
  sdoh_impact: SDOHImpactData;
  priority_members: PriorityMemberItem[];
}

const Overview: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<OverviewApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverviewData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('http://127.0.0.1:8000/api/overview/');
      if (!res.ok) {
        throw new Error(`Failed to load overview data (${res.status})`);
      }
      const json: OverviewApiResponse = await res.json();
      setData(json);
    } catch (err: any) {
      console.error('Error fetching overview data:', err);
      // Fallback relative path
      try {
        const resFallback = await fetch('/api/overview/');
        if (resFallback.ok) {
          const json: OverviewApiResponse = await resFallback.json();
          setData(json);
          return;
        }
      } catch {}
      setError(err.message || 'Unable to connect to backend server');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOverviewData();
  }, []);

  // Icon and theme mappings for summary cards
  const getCardIconAndStyle = (index: number) => {
    switch (index) {
      case 0:
        return { icon: Users, color: 'text-primary', bg: 'bg-primary/10', stroke: '#005599', trendColor: 'text-teal-600' };
      case 1:
        return { icon: AlertTriangle, color: 'text-error', bg: 'bg-error/10', stroke: '#ba1a1a', trendColor: 'text-error' };
      case 2:
        return { icon: Globe, color: 'text-primary', bg: 'bg-primary/10', stroke: '#455668', trendColor: 'text-slate-500' };
      case 3:
        return { icon: Brain, color: 'text-error', bg: 'bg-error/10', stroke: '#ba1a1a', trendColor: 'text-error' };
      case 4:
        return { icon: Flag, color: 'text-primary', bg: 'bg-primary/10', stroke: '#046a64', trendColor: 'text-teal-600' };
      case 5:
      default:
        return { icon: CheckCircle, color: 'text-secondary', bg: 'bg-secondary/10', stroke: '#046a64', trendColor: 'text-teal-600' };
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-9 h-9 text-primary animate-spin" />
        <span className="text-sm font-semibold text-on-surface-variant">Loading real-time SDOH population intelligence...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex flex-col items-center justify-center gap-4 text-center max-w-lg mx-auto my-12">
        <AlertTriangle className="w-8 h-8 text-red-600" />
        <div>
          <h3 className="font-bold text-red-900 mb-1">Failed to load real-time overview</h3>
          <p className="text-xs text-red-700">{error || 'Server error'}</p>
        </div>
        <button
          onClick={fetchOverviewData}
          className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 transition-colors"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  const { summary_cards, risk_synthesis, social_drivers, sdoh_impact, priority_members } = data;

  // Gauge calculation
  const gaugePercent = risk_synthesis.combined_risk_pct;
  const radius = 42;
  const circumference = 2 * Math.PI * radius; // ~263.8
  const offset = circumference - (gaugePercent / 100) * circumference;

  return (
    <div className="flex flex-col gap-8 w-full">
      {/* Bento Grid: Summary Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-6">
        {summary_cards.map((card, i) => {
          const style = getCardIconAndStyle(i);
          const IconComp = style.icon;
          return (
            <div key={i} className="glass-card p-4 flex flex-col justify-between h-[180px] relative overflow-hidden">
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-9 h-9 shrink-0 rounded-full ${style.bg} flex items-center justify-center ${style.color}`}>
                  <IconComp className="w-5 h-5" />
                </div>
                <h3 className="text-[12px] font-bold text-on-surface leading-tight">{card.title}</h3>
              </div>
              <div className="mb-1 flex-1 flex flex-col justify-center">
                <div className="text-[28px] font-bold text-on-surface tracking-tight">{card.value}</div>
                <div className={`flex items-center gap-0.5 mt-0.5 text-[11px] font-semibold ${style.trendColor}`}>
                  {card.trend === 'up' && <TrendingUp className="w-3.5 h-3.5" />}
                  {card.trend === 'down' && <TrendingDown className="w-3.5 h-3.5" />}
                  {card.trend === 'flat' && <Minus className="w-3.5 h-3.5" />}
                  <span>{card.subtext}</span>
                </div>
              </div>
              {/* Sparkline */}
              <div className="w-full h-8 mt-1 opacity-60">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={generateSparkData(card.trend)}>
                    <Line type="monotone" dataKey="v" stroke={style.stroke} strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </section>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Population Risk Synthesis */}
        <section className="glass-card p-6 sm:p-8 flex flex-col relative overflow-hidden min-h-[440px]">
          <div className="flex justify-between items-center mb-6 shrink-0 z-10">
            <div>
              <h2 className="text-lg font-bold text-on-surface">Population Risk Synthesis</h2>
              <p className="text-[12px] text-on-surface-variant">Real-time fusion of clinical records with census tract SDOH</p>
            </div>
            <button className="w-8 h-8 rounded-full bg-white/50 border border-slate-200/40 flex items-center justify-center text-primary hover:bg-white transition-colors shadow-sm shrink-0">
              <Info className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 flex items-center justify-between relative w-full h-full min-h-[260px]">
            {/* SVG Connecting Lines */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" style={{ zIndex: 0 }} viewBox="0 0 500 300">
              <path className="animated-path" d="M 120 70 Q 250 70, 320 135 T 450 135" fill="none" opacity="0.6" stroke="url(#grad1)" strokeWidth="2.5" />
              <path className="animated-path" d="M 120 200 Q 250 200, 320 135 T 450 135" fill="none" opacity="0.6" stroke="url(#grad2)" strokeWidth="2.5" />
              <defs>
                <linearGradient id="grad1" x1="0%" x2="100%" y1="0%" y2="0%">
                  <stop offset="0%" stopColor="#005599" stopOpacity="0.1" />
                  <stop offset="100%" stopColor="#005599" stopOpacity="0.7" />
                </linearGradient>
                <linearGradient id="grad2" x1="0%" x2="100%" y1="0%" y2="0%">
                  <stop offset="0%" stopColor="#5d6e81" stopOpacity="0.1" />
                  <stop offset="100%" stopColor="#005599" stopOpacity="0.7" />
                </linearGradient>
              </defs>
              <circle className="pulse-node" cx="220" cy="90" fill="#005599" opacity="0.6" r="3.5" />
              <circle className="pulse-node" cx="300" cy="135" fill="#005599" opacity="0.8" r="3.5" />
              <circle className="pulse-node" cx="220" cy="180" fill="#5d6e81" opacity="0.6" r="3.5" />
            </svg>

            {/* Inputs */}
            <div className="flex flex-col z-10 w-[42%] gap-6">
              <div className="glass-panel p-4 text-center shadow-sm relative rounded-xl bg-white/70">
                <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-primary rounded-full shadow-[0_0_8px_#005599]"></div>
                <div className="text-[11px] uppercase text-on-surface-variant tracking-wider font-bold mb-1">Clinical Risk Acuity</div>
                <div className="text-3xl font-extrabold text-primary">{risk_synthesis.clinical_risk_pct}%</div>
              </div>
              <div className="glass-panel p-4 text-center shadow-sm relative rounded-xl bg-white/70">
                <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-tertiary rounded-full shadow-[0_0_8px_#5d6e81]"></div>
                <div className="text-[11px] uppercase text-on-surface-variant tracking-wider font-bold mb-1">Community Social Risk</div>
                <div className="text-3xl font-extrabold text-tertiary">{risk_synthesis.social_risk_pct}%</div>
              </div>
            </div>

            {/* Output Circular Gauge */}
            <div className="z-10 flex justify-center w-[52%]">
              <div className="relative w-40 h-40 sm:w-48 sm:h-48 flex items-center justify-center bg-white/50 rounded-full shadow-md border border-white">
                <div className="absolute inset-[-8px] rounded-full bg-gradient-to-tr from-primary/10 to-primary-fixed/10 blur-lg -z-10"></div>
                <svg className="absolute inset-0 w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" fill="none" r="42" stroke="rgba(226,232,240,0.8)" strokeWidth="6" />
                  <circle 
                    cx="50" 
                    cy="50" 
                    fill="none" 
                    r="42" 
                    stroke="#005599" 
                    strokeDasharray={circumference} 
                    strokeDashoffset={offset} 
                    strokeLinecap="round" 
                    strokeWidth="6" 
                  />
                </svg>
                <div className="text-center bg-white/90 w-32 h-32 sm:w-36 sm:h-36 rounded-full flex flex-col items-center justify-center border border-slate-100 shadow-inner">
                  <div className="text-[11px] uppercase text-primary font-bold tracking-wider mb-0.5 leading-tight">Combined<br />Risk</div>
                  <div className="text-4xl font-extrabold text-primary">{risk_synthesis.combined_risk_pct}%</div>
                </div>
              </div>
            </div>
          </div>

          <div className="w-full text-center mt-6 shrink-0 z-10">
            <div className="inline-flex items-center gap-1.5 bg-primary/5 border border-primary/20 py-1.5 px-5 rounded-full backdrop-blur-sm shadow-sm">
              <Brain className="text-primary w-4 h-4" />
              <p className="text-[12px] text-primary font-semibold">
                AI Model Confidence: {risk_synthesis.model_confidence_label} ({risk_synthesis.model_confidence_pct}%)
              </p>
            </div>
          </div>
        </section>

        {/* SDOH Risk Drivers */}
        <section className="glass-card p-6 sm:p-8 flex flex-col relative overflow-hidden min-h-[440px]">
          <div className="flex justify-between items-center mb-6 shrink-0">
            <div>
              <h2 className="text-lg font-bold text-on-surface">Population Social Risk Drivers</h2>
              <p className="text-[12px] text-on-surface-variant">Prevalence across enrolled California Census Tracts</p>
            </div>
            <span className="bg-error/10 text-error border border-error/20 text-[11px] font-bold px-3 py-1 rounded-full shadow-sm">High Impact</span>
          </div>
          <div className="flex flex-col gap-4.5 flex-1 justify-center">
            {social_drivers.map((driver, index) => (
              <div key={index} className="flex flex-col gap-1">
                <div className="flex justify-between items-end">
                  <span className="text-[13px] text-on-surface font-semibold">{driver.name}</span>
                  <span className="text-[12px] font-bold text-on-surface-variant">{driver.text}</span>
                </div>
                <div className="h-2.5 w-full bg-slate-200/50 rounded-full overflow-hidden relative">
                  <div className={`h-full ${driver.color} rounded-full transition-all duration-1000`} style={{ width: `${driver.percentage}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Impact of SDOH on Prioritization */}
      <section className="glass-card p-6 sm:p-8 relative overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-6 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-on-surface">Impact of SDOH on Prioritization</h2>
            <p className="text-[12px] text-on-surface-variant">Evaluating additional high-risk members identified when combining community SDOH with clinical records</p>
          </div>
          <button className="w-8 h-8 rounded-full bg-white/50 border border-slate-200/40 flex items-center justify-center text-primary hover:bg-white transition-colors shadow-sm shrink-0">
            <Info className="w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12 py-4 flex-1">
          <div className="glass-panel p-6 text-center w-full md:w-60 flex flex-col items-center shrink-0 bg-white/40">
            <div className="text-[12px] font-bold text-on-surface-variant mb-2 leading-tight">Clinical Only High-Risk<br />Members</div>
            <div className="text-3xl sm:text-4xl text-on-surface font-extrabold">{sdoh_impact.clinical_only_high}</div>
          </div>
          
          <div className="flex flex-col items-center px-4 shrink-0">
            <div className="text-3xl font-extrabold text-secondary mb-1">+{sdoh_impact.elevated_by_sdoh}</div>
            <div className="text-[12px] text-on-surface-variant font-semibold text-center max-w-[150px]">Members elevated by SDOH information</div>
          </div>

          <div className="glass-panel p-6 text-center w-full md:w-60 bg-gradient-to-b from-white/80 to-primary/5 flex flex-col items-center border-primary/20 shadow-[0_8px_30px_rgba(0,85,153,0.06)] shrink-0">
            <div className="text-[12px] font-bold text-on-surface mb-2 leading-tight">Clinical + SDOH<br />High-Risk Members</div>
            <div className="text-3xl sm:text-4xl text-primary font-extrabold">{sdoh_impact.combined_high}</div>
          </div>
        </div>
        <div className="mt-6 text-center border-t border-slate-200/40 pt-4 shrink-0">
          <p className="text-[13px] text-on-surface-variant font-medium">
            SDOH insights elevated <span className="text-primary font-bold">{sdoh_impact.elevated_by_sdoh}</span> additional members into the high-risk group.
          </p>
        </div>
      </section>

      {/* Priority Members Table */}
      <section className="glass-card overflow-hidden flex flex-col border border-white/80">
        <div className="p-6 border-b border-slate-200/40 flex justify-between items-center bg-white/40 backdrop-blur-sm shrink-0">
          <div>
            <h2 className="text-lg font-bold text-on-surface">Members Requiring Immediate Attention</h2>
            <p className="text-[12px] text-slate-500">Top prioritized patient records based on real TreeSHAP explanations</p>
          </div>
          <button 
            onClick={() => navigate('/members')}
            className="text-[12px] font-bold text-primary bg-white/80 border border-primary/20 px-4 py-2 rounded-full hover:bg-primary hover:text-white transition-all duration-300 shadow-sm cursor-pointer"
          >
            View All Members
          </button>
        </div>
        <div className="overflow-x-auto w-full custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead className="text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold border-b border-slate-200/40 bg-slate-50/50">
              <tr>
                <th className="p-4 pl-6 w-[100px]">Priority</th>
                <th className="p-4 w-[120px]">Member ID</th>
                <th className="p-4 w-[110px]">Clinical Risk</th>
                <th className="p-4 w-[110px]">Social Risk</th>
                <th className="p-4 w-[150px]">FUTURE RISK (5-CLASS)</th>
                <th className="p-4 w-[100px]">Future 6M</th>
                <th className="p-4 w-[100px]">Future 12M</th>
                <th className="p-4 w-[180px]">Primary Driver (TreeSHAP)</th>
                <th className="p-4 w-[120px]">Status</th>
                <th className="p-4 pr-6 text-right w-[120px]">Action</th>
              </tr>
            </thead>
            <tbody className="text-[13px] divide-y divide-slate-100 bg-white/20">
              {priority_members.map((member) => (
                <tr key={member.id} className="hover:bg-slate-50/40 transition-colors group">
                  <td className="p-4 pl-6">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${member.priorityColor} whitespace-nowrap`}>
                      {member.priority}
                    </span>
                  </td>
                  <td className="p-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-900 text-[13px]">{member.name || member.id}</span>
                      <span className="text-[11px] font-mono text-primary font-semibold">{member.id}</span>
                    </div>
                  </td>
                  <td className="p-4 text-error font-semibold whitespace-nowrap">{member.clinical}</td>
                  <td className="p-4 text-error font-semibold whitespace-nowrap">{member.social}</td>
                  <td className="p-4 font-bold text-error whitespace-nowrap">{member.future_risk_5}</td>
                  <td className="p-4 text-error/80 font-semibold whitespace-nowrap">{member.future6}</td>
                  <td className="p-4 text-error/80 font-semibold whitespace-nowrap">{member.future12}</td>
                  <td className="p-4 text-on-surface font-medium leading-tight">{member.driver}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <span className={`w-2 h-2 rounded-full ${member.statusColor}`}></span>
                      <span className="text-on-surface-variant font-medium">{member.status}</span>
                    </div>
                  </td>
                  <td className="p-4 pr-6 text-right">
                    <button 
                      onClick={() => navigate(`/members?id=${member.id}`)}
                      className="text-primary bg-primary/10 hover:bg-primary hover:text-white px-3.5 py-1 rounded-full text-[12px] font-semibold transition-all cursor-pointer"
                    >
                      Analyze
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default Overview;
