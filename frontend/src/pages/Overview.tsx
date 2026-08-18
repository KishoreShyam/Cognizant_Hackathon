import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, AlertTriangle, Globe, Brain, Flag, TrendingUp, TrendingDown, Minus, 
  CheckCircle2, ArrowRight,
  Loader2, X
} from 'lucide-react';
import { 
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Tooltip, Sector
} from 'recharts';

interface SummaryCardItem {
  title: string;
  value: string;
  trend: string;
  subtext: string;
  trendType: string;
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

interface PriorityMemberItem {
  id: string;
  name: string;
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

interface RiskDistributionItem {
  name: string;
  value: number;
  color: string;
  clinical: number;
  social: number;
  deterioration: number;
  meaning: string;
  actions: string[];
}

interface SdohImpactData {
  clinical_only_high: number;
  elevated_by_sdoh: number;
  combined_high: number;
  headline: string;
}

interface OverviewApiResponse {
  summary_cards: SummaryCardItem[];
  risk_synthesis: RiskSynthesisData;
  social_drivers: SocialDriverItem[];
  risk_distribution: RiskDistributionItem[];
  priority_members: PriorityMemberItem[];
  sdoh_impact: SdohImpactData;
}

const ALL_12_SDOH_FACTORS = [
  { name: "Housing Cost Burden", domain: "Neighborhood & Built Environment", risk: "HIGH", concern: "Housing instability, eviction stress & overcrowding", intervention: "Refer to social worker & local housing aid programs" },
  { name: "Poverty Rate", domain: "Economic Stability", risk: "HIGH", concern: "Severe financial strain & trade-offs between medicine vs utilities", intervention: "Enroll in copay discount vouchers & local food pantry networks" },
  { name: "Social Vulnerability Index (SVI)", domain: "Social & Community Context", risk: "HIGH", concern: "Community vulnerability to social or natural stressors", intervention: "Assign a health navigator for coordinated resource assistance" },
  { name: "Low Access Population (Food)", domain: "Neighborhood & Built Environment", risk: "MODERATE", concern: "Nutritional deficits & clinical complications in diabetic patients", intervention: "Coordinate delivery of medically-tailored pantry hampers" },
  { name: "Median Household Income", domain: "Economic Stability", risk: "MODERATE", concern: "Cost-related medication or therapy rationing", intervention: "Link to manufacturer drug coupons & copay subsidies" },
  { name: "No Vehicle Rate", domain: "Neighborhood & Built Environment", risk: "MODERATE", concern: "Missed clinical visits & delayed emergency treatments", intervention: "Arrange non-emergency medical transportation (NEMT) rides" },
  { name: "Transportation Barriers", domain: "Neighborhood & Built Environment", risk: "MODERATE", concern: "Lack of access to physical pharmacies or care locations", intervention: "Transition client to home pharmacy delivery services" },
  { name: "Education Deficits", domain: "Education", risk: "LOW", concern: "Difficulties understanding diagnostic terms or care plans", intervention: "Utilize simplified leaflets & structured teach-back checks" },
  { name: "Healthcare & Uninsured Rate", domain: "Health Care Access", risk: "LOW", concern: "Lack of access to regular preventive and primary care", intervention: "Financial counseling to verify Medicaid/ACA eligibility" },
  { name: "Unemployment Rate", domain: "Economic Stability", risk: "LOW", concern: "Loss of employer insurance & acute household financial crises", intervention: "Refer to vocational specialists & community care navigators" },
  { name: "Disability Rate", domain: "Neighborhood & Built Environment", risk: "LOW", concern: "Physical mobility barriers & limitations in daily activities", intervention: "Arrange durable medical equipment (DME) evaluation" },
  { name: "No Internet Access", domain: "Social & Community Context", risk: "LOW", concern: "Inability to perform video telehealth or use patient portals", intervention: "Initiate telephone-only care outreach & mail-out packets" }
];

const Overview: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<OverviewApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTier, setActiveTier] = useState<string>('Critical');
  const [isDriversModalOpen, setIsDriversModalOpen] = useState<boolean>(false);
  const [activeFactorTab, setActiveFactorTab] = useState<string>('All');

  const fetchOverviewData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/overview/?t=${Date.now()}`);
      if (!res.ok) {
        throw new Error(`Failed to load overview data (${res.status})`);
      }
      const json: OverviewApiResponse = await res.json();
      setData(json);
      // Auto-select the first risk distribution tier that has values
      if (json.risk_distribution && json.risk_distribution.length > 0) {
        const firstNonEmpty = json.risk_distribution.find(t => t.value > 0);
        if (firstNonEmpty) {
          setActiveTier(firstNonEmpty.name);
        } else {
          setActiveTier(json.risk_distribution[0].name);
        }
      }
    } catch (err: any) {
      console.error('Error fetching overview data:', err);
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
      default:
        return { icon: Flag, color: 'text-primary', bg: 'bg-primary/10', stroke: '#046a64', trendColor: 'text-teal-600' };
    }
  };

  // Sparkline data generator
  const generateSparkData = (trend: string) => {
    if (trend === 'up') return [{ v: 30 }, { v: 45 }, { v: 40 }, { v: 60 }, { v: 55 }, { v: 75 }];
    if (trend === 'down') return [{ v: 70 }, { v: 55 }, { v: 60 }, { v: 40 }, { v: 45 }, { v: 25 }];
    return [{ v: 45 }, { v: 47 }, { v: 44 }, { v: 48 }, { v: 46 }, { v: 47 }];
  };

  // Filtered factors for the drawer modal
  const filteredFactors = useMemo(() => {
    if (activeFactorTab === 'All') return ALL_12_SDOH_FACTORS;
    return ALL_12_SDOH_FACTORS.filter(f => f.domain.includes(activeFactorTab) || f.risk === activeFactorTab);
  }, [activeFactorTab]);

  // Selected Risk Tier details
  const selectedTier = useMemo(() => {
    if (!data || !data.risk_distribution) return null;
    return data.risk_distribution.find(t => t.name === activeTier) || data.risk_distribution[0];
  }, [data, activeTier]);

  // Donut chart active index calculation
  const activePieIndex = useMemo(() => {
    if (!data || !data.risk_distribution) return 0;
    return data.risk_distribution.findIndex(t => t.name === activeTier);
  }, [data, activeTier]);

  // Custom active sector slice drawer for glowing/highlight effect
  const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
    return (
      <g>
        {/* Sleek outer halo backing */}
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius}
          outerRadius={outerRadius + 8}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
          opacity={0.15}
        />
        {/* Raised active sector */}
        <Sector
          cx={cx}
          cy={cy}
          startAngle={startAngle}
          endAngle={endAngle}
          innerRadius={innerRadius}
          outerRadius={outerRadius + 3}
          fill={fill}
        />
      </g>
    );
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

  const { summary_cards, risk_distribution } = data;

  const totalPatients = risk_distribution.reduce((acc, curr) => acc + curr.value, 0);

  const housingPct = data.social_drivers.find(d => d.name.includes("Housing"))?.percentage || 57;
  const housingCount = Math.round((totalPatients * housingPct) / 100);

  const foodPct = data.social_drivers.find(d => d.name.includes("Food"))?.percentage || 78;
  const foodCount = Math.round((totalPatients * foodPct) / 100);

  const povertyPct = data.social_drivers.find(d => d.name.includes("Poverty"))?.percentage || 31;
  const povertyCount = Math.round((totalPatients * povertyPct) / 100);

  const uninsuredPct = data.social_drivers.find(d => d.name.includes("Healthcare"))?.percentage || 22;
  const uninsuredCount = Math.round((totalPatients * uninsuredPct) / 100);



  return (
    <div className="flex flex-col gap-8 w-full">
      {/* Bento Grid: Summary Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
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

      {/* Main Row Grid */}
      <div className="w-full">
        
        {/* LEFT/MID: Cohort Risk & Care Priority (Donut + Details Card) */}
        <section className="glass-card p-6 sm:p-8 flex flex-col relative overflow-hidden min-h-[520px]">
          <div className="flex justify-between items-center mb-6 shrink-0 z-10">
            <div>
              <h2 className="text-lg font-bold text-on-surface">Cohort Risk & Care Priority</h2>
              <p className="text-[12px] text-on-surface-variant">Interactive view of clinical severity, social vulnerability, and care priority</p>
            </div>
            <span className="bg-primary/5 text-primary border border-primary/20 text-[11px] font-bold px-3 py-1 rounded-full shadow-sm">Interactive Analytics</span>
          </div>

          <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-8 items-center z-10">
            {/* Left: Recharts Donut */}
            <div className="md:col-span-2 flex flex-col items-center justify-center relative">
              <div className="relative w-56 h-56 flex items-center justify-center">
                
                {/* Visual framing ring */}
                <div className="absolute inset-[8px] rounded-full border border-slate-100 shadow-inner -z-10 bg-slate-50/20"></div>
                <div className="absolute inset-[36px] rounded-full border border-slate-100/60 shadow-sm -z-10"></div>
                
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    {/* Background track circle */}
                    <Pie
                      data={[{ value: 1 }]}
                      cx="50%"
                      cy="50%"
                      innerRadius={68}
                      outerRadius={92}
                      fill="rgba(241, 245, 249, 0.95)"
                      stroke="none"
                      isAnimationActive={false}
                    />
                    {React.createElement(Pie, {
                      data: risk_distribution,
                      cx: "50%",
                      cy: "50%",
                      innerRadius: 68,
                      outerRadius: 92,
                      paddingAngle: 4,
                      dataKey: "value",
                      activeIndex: activePieIndex,
                      activeShape: renderActiveShape,
                      onClick: (data: any) => {
                        if (data && data.name) {
                          setActiveTier(data.name);
                        }
                      },
                      cursor: "pointer"
                    } as any, 
                      risk_distribution.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.color} 
                          opacity={entry.name === activeTier ? 1.0 : 0.45}
                          stroke={entry.name === activeTier ? '#ffffff' : 'none'}
                          strokeWidth={2}
                        />
                      ))
                    )}
                    <Tooltip 
                      formatter={(value, name) => [`${value} Patients`, name]}
                      contentStyle={{ background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center Label */}
                <div className="absolute text-center flex flex-col items-center">
                  <span className="text-[9px] font-bold text-slate-400 tracking-wider uppercase">Active Cohort</span>
                  <span className="text-3xl font-black text-slate-800 leading-tight">
                    {risk_distribution.reduce((acc, curr) => acc + curr.value, 0)}
                  </span>
                  <span className="text-[10px] font-black text-primary tracking-wide">{activeTier.toUpperCase()} TIER</span>
                </div>
              </div>

              {/* Legends list */}
              <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 justify-center mt-5">
                {risk_distribution.map((entry, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveTier(entry.name)}
                    className={`flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded-md transition-all ${
                      entry.name === activeTier ? 'bg-slate-200/50 shadow-sm border border-slate-300/10' : 'opacity-65 hover:opacity-100'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }}></span>
                    <span>{entry.name}</span>
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 bg-slate-200/40 rounded text-slate-600">{entry.value}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Selected Category Guidelines Details Panel */}
            <div className="md:col-span-3 h-full flex flex-col justify-between">
              {selectedTier ? (
                <div className="glass-panel p-5 bg-white/70 border border-white flex-1 flex flex-col justify-between rounded-2xl shadow-sm">
                  <div>
                    {/* Header info */}
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="text-base font-extrabold text-on-surface flex items-center gap-1.5">
                          <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: selectedTier.color }}></span>
                          {selectedTier.name.toUpperCase()} RISK TIER
                        </h3>
                        <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">{selectedTier.meaning}</p>
                      </div>
                      <span className="text-xs font-bold bg-slate-200/60 text-slate-700 px-3 py-1 rounded-full whitespace-nowrap">
                        {selectedTier.value} patients · {((selectedTier.value / risk_distribution.reduce((acc, curr) => acc + curr.value, 0)) * 100).toFixed(1)}% of cohort
                      </span>
                    </div>

                    {/* Progress bars: Why they're at risk */}
                    <div className="space-y-2.5 my-4 border-t border-b border-slate-100 py-3.5">
                      <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Convergence Drivers</h4>
                      
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between text-xs font-bold">
                          <span className="text-on-surface-variant">Clinical Risk Acuity</span>
                          <span className="text-slate-800">{selectedTier.clinical}%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-200/50 rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${selectedTier.clinical}%` }}></div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between text-xs font-bold">
                          <span className="text-on-surface-variant">Social Vulnerability</span>
                          <span className="text-slate-800">{selectedTier.social}%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-200/50 rounded-full overflow-hidden">
                          <div className="h-full bg-error rounded-full" style={{ width: `${selectedTier.social}%` }}></div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between text-xs font-bold">
                          <span className="text-on-surface-variant">Recent Deterioration (ML confidence)</span>
                          <span className="text-slate-800">{selectedTier.deterioration}%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-200/50 rounded-full overflow-hidden">
                          <div className="h-full bg-secondary rounded-full" style={{ width: `${selectedTier.deterioration}%` }}></div>
                        </div>
                      </div>
                    </div>

                    {/* Recommended Actions */}
                    <div>
                      <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Recommended Interventions</h4>
                      <ul className="grid grid-cols-1 gap-1.5 text-xs text-on-surface font-semibold pl-1">
                        {selectedTier.actions.map((act, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
                            <span>{act}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Navigation click button */}
                  <div className="mt-5 pt-3 border-t border-slate-100 flex justify-end">
                    <button
                      onClick={() => navigate(`/members?risk=${selectedTier.name}`)}
                      className="text-xs font-bold text-white bg-primary hover:bg-primary-container px-5 py-2.5 rounded-full flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                    >
                      <span>View {selectedTier.name} Patients</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center text-slate-500 my-auto">Select a segment to view priority details</div>
              )}
            </div>
          </div>
        </section>

      </div>

      {/* Member Care Pathways */}
      <section className="glass-card p-6 sm:p-8 relative overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-6 shrink-0">
          <div>
            <h2 className="text-base font-extrabold text-on-surface uppercase tracking-wider">Member Care Pathways</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">Strategic care management referrals mapped to active population SDOH drivers</p>
          </div>
          <span className="bg-teal-50 text-teal-700 border border-teal-100 text-[10px] font-bold px-3 py-1 rounded-full shadow-sm">Operational Ready</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full">
          
          {/* Card 1: Housing Stability */}
          <div className="p-5 rounded-2xl border border-slate-100 bg-white shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center font-bold text-sm">🏠</span>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Housing Stability</h3>
              </div>
              <p className="text-[11px] text-slate-700 font-bold mb-1">{housingPct}% Prevalence ({housingCount} Members Affected)</p>
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mb-3">
                <div className="h-full bg-red-500 rounded-full" style={{ width: `${housingPct}%` }}></div>
              </div>
              <ul className="space-y-1.5 text-[11px] text-slate-600 font-medium">
                <li className="flex items-start gap-1.5">
                  <span className="text-green-500">✓</span>
                  <span>Connect with municipal housing agencies</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-green-500">✓</span>
                  <span>Coordinate utility aid & grant programs</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-green-500">✓</span>
                  <span>Rent assistance counseling referrals</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Card 2: Food & Transport */}
          <div className="p-5 rounded-2xl border border-slate-100 bg-white shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center font-bold text-sm">🍎</span>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Food & Transport</h3>
              </div>
              <p className="text-[11px] text-slate-700 font-bold mb-1">{foodPct}% Prevalence ({foodCount} Members Affected)</p>
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mb-3">
                <div className="h-full bg-orange-500 rounded-full" style={{ width: `${foodPct}%` }}></div>
              </div>
              <ul className="space-y-1.5 text-[11px] text-slate-600 font-medium">
                <li className="flex items-start gap-1.5">
                  <span className="text-green-500">✓</span>
                  <span>Enroll in SNAP & local nutrition assistance</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-green-500">✓</span>
                  <span>Coordinate non-emergency shuttle van service</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-green-500">✓</span>
                  <span>Partner food pantry home delivery</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Card 3: Economic Stability */}
          <div className="p-5 rounded-2xl border border-slate-100 bg-white shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-sm">💵</span>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Economic Stability</h3>
              </div>
              <p className="text-[11px] text-slate-700 font-bold mb-1">{povertyPct}% Prevalence ({povertyCount} Members Affected)</p>
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mb-3">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${povertyPct}%` }}></div>
              </div>
              <ul className="space-y-1.5 text-[11px] text-slate-600 font-medium">
                <li className="flex items-start gap-1.5">
                  <span className="text-green-500">✓</span>
                  <span>Coordinate federal utility subsidies (LIHEAP)</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-green-500">✓</span>
                  <span>Referrals to local job assistance centers</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-green-500">✓</span>
                  <span>Coordinate financial assistance counseling</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Card 4: Healthcare Access */}
          <div className="p-5 rounded-2xl border border-slate-100 bg-white shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center font-bold text-sm">🏥</span>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Healthcare Access</h3>
              </div>
              <p className="text-[11px] text-slate-700 font-bold mb-1">{uninsuredPct}% Prevalence ({uninsuredCount} Members Affected)</p>
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mb-3">
                <div className="h-full bg-teal-500 rounded-full" style={{ width: `${uninsuredPct}%` }}></div>
              </div>
              <ul className="space-y-1.5 text-[11px] text-slate-600 font-medium">
                <li className="flex items-start gap-1.5">
                  <span className="text-green-500">✓</span>
                  <span>Medicaid/ACA enrollment assistance</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-green-500">✓</span>
                  <span>Coordinate prescription co-pay cards</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-green-500">✓</span>
                  <span>Charitable financial advisor consult</span>
                </li>
              </ul>
            </div>
          </div>

        </div>
      </section>

      {/* ALL 12 SDOH FACTORS MODAL DIALOG */}
      {isDriversModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-slate-100 animate-scale-up">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-lg font-extrabold text-on-surface flex items-center gap-2">
                  <Globe className="text-primary w-5 h-5" />
                  SDOH Care Pathways Directory
                </h3>
                <p className="text-[12px] text-slate-500">Comprehensive view of all 12 social determinants of health and recommended actions</p>
              </div>
              <button 
                onClick={() => setIsDriversModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Modal Tabs / Filters */}
            <div className="px-6 py-3 border-b border-slate-100 bg-white flex flex-wrap gap-2 shrink-0">
              {['All', 'Economic', 'Neighborhood', 'Social', 'Health Care Access', 'Education', 'HIGH', 'MODERATE', 'LOW'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveFactorTab(tab)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    activeFactorTab === tab 
                      ? 'bg-primary text-white shadow-sm' 
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Modal Scroll Content */}
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-slate-50/30">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredFactors.map((factor, idx) => (
                  <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between hover:border-slate-200 transition-all">
                    <div>
                      {/* Factor Info Header */}
                      <div className="flex justify-between items-start gap-3 mb-2">
                        <span className="text-sm font-bold text-on-surface">{factor.name}</span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded border whitespace-nowrap ${
                          factor.risk === 'HIGH' ? 'bg-red-50 text-red-700 border-red-200' : (
                            factor.risk === 'MODERATE' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-green-50 text-green-700 border-green-200'
                          )
                        }`}>
                          {factor.risk} RISK
                        </span>
                      </div>
                      <span className="text-[10px] text-primary font-bold uppercase tracking-wider">{factor.domain}</span>
                      
                      {/* Clinical concerns */}
                      <div className="mt-3.5 space-y-2 text-xs">
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          <span className="font-bold text-on-surface-variant block text-[10px] uppercase tracking-wider">Primary Clinical Concern</span>
                          <span className="text-slate-700 font-medium block mt-0.5 leading-snug">{factor.concern}</span>
                        </div>
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          <span className="font-bold text-secondary block text-[10px] uppercase tracking-wider">Suggested Care Intervention</span>
                          <span className="text-slate-700 font-medium block mt-0.5 leading-snug">{factor.intervention}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="p-5 border-t border-slate-100 flex justify-end bg-slate-50/50">
              <button 
                onClick={() => setIsDriversModalOpen(false)}
                className="px-5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-full hover:bg-slate-50 cursor-pointer shadow-sm"
              >
                Close Directory
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Impact of SDOH on Prioritization */}
      <section className="glass-card p-6 sm:p-8 relative overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-6 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-on-surface">Impact of SDOH on Prioritization</h2>
            <p className="text-[12px] text-on-surface-variant">Evaluating additional high-risk members identified when combining community SDOH with clinical records</p>
          </div>
        </div>
        <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12 py-4 flex-1">
          <div className="glass-panel p-6 text-center w-full md:w-60 flex flex-col items-center shrink-0 bg-white/40">
            <div className="text-[12px] font-bold text-on-surface-variant mb-2 leading-tight">Clinical Only High-Risk<br />Members</div>
            <div className="text-3xl sm:text-4xl text-on-surface font-extrabold">{data.sdoh_impact?.clinical_only_high ?? 12}</div>
          </div>
          
          <div className="flex flex-col items-center px-4 shrink-0">
            <div className="text-3xl font-extrabold text-secondary mb-1">
              +{data.sdoh_impact?.elevated_by_sdoh ?? 44}
            </div>
            <div className="text-[12px] text-on-surface-variant font-semibold text-center max-w-[150px]">Members elevated by SDOH information</div>
          </div>

          <div className="glass-panel p-6 text-center w-full md:w-60 bg-gradient-to-b from-white/80 to-primary/5 flex flex-col items-center border-primary/20 shadow-[0_8px_30px_rgba(0,85,153,0.06)] shrink-0">
            <div className="text-[12px] font-bold text-on-surface mb-2 leading-tight">Clinical + SDOH<br />High-Risk Members</div>
            <div className="text-3xl sm:text-4xl text-primary font-extrabold">{data.sdoh_impact?.combined_high ?? 56}</div>
          </div>
        </div>
        <div className="mt-6 text-center border-t border-slate-200/40 pt-4 shrink-0">
          <p className="text-[13px] text-on-surface-variant font-medium">
            SDOH insights elevated <span className="text-primary font-bold">{data.sdoh_impact?.elevated_by_sdoh ?? 44}</span> additional members into the high-risk group.
          </p>
        </div>
      </section>
    </div>
  );
};

export default Overview;
