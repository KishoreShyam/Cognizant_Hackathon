import React from 'react';
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
  Minus
} from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

// Mock sparkline data
const generateSparkData = (trend: 'up' | 'down' | 'flat') => {
  if (trend === 'up') return [{ v: 10 }, { v: 15 }, { v: 13 }, { v: 22 }, { v: 18 }, { v: 25 }];
  if (trend === 'down') return [{ v: 25 }, { v: 20 }, { v: 22 }, { v: 15 }, { v: 18 }, { v: 12 }];
  return [{ v: 15 }, { v: 16 }, { v: 15 }, { v: 17 }, { v: 16 }, { v: 16 }];
};

const Overview: React.FC = () => {
  const navigate = useNavigate();

  // Summary Cards Data
  const summaryCards = [
    { title: 'Total Members', value: '24,500', trend: 'up', subtext: '2.4% vs last month', icon: Users, color: 'text-primary', bg: 'bg-primary/10', trendColor: 'text-teal-600', spark: generateSparkData('up'), stroke: '#005599' },
    { title: 'High Future Risk (5-Class)', value: '1,240', trend: 'up', subtext: '5.1% vs last month', icon: AlertTriangle, color: 'text-error', bg: 'bg-error/10', trendColor: 'text-error', spark: generateSparkData('up'), stroke: '#ba1a1a' },
    { title: 'High Social Risk', value: '850', trend: 'flat', subtext: 'Stable vs last month', icon: Globe, color: 'text-primary', bg: 'bg-primary/10', trendColor: 'text-slate-500', spark: generateSparkData('flat'), stroke: '#455668' },
    { title: 'High Future Risk (3-Class)', value: '420', trend: 'up', subtext: '12% vs last month', icon: Brain, color: 'text-error', bg: 'bg-error/10', trendColor: 'text-error', spark: generateSparkData('up'), stroke: '#ba1a1a' },
    { title: 'Priority Members', value: '156', trend: 'down', subtext: '-4.2% vs last month', icon: Flag, color: 'text-primary', bg: 'bg-primary/10', trendColor: 'text-teal-600', spark: generateSparkData('down'), stroke: '#046a64' },
    { title: 'Interventions Done', value: '89', trend: 'up', subtext: '42 completed today', icon: CheckCircle, color: 'text-secondary', bg: 'bg-secondary/10', trendColor: 'text-teal-600', spark: generateSparkData('up'), stroke: '#046a64' }
  ];

  // Social Risk Drivers Data
  const socialDrivers = [
    { name: 'Economic Stability', percentage: 42, color: 'bg-error', text: '42% High Risk' },
    { name: 'Housing', percentage: 38, color: 'bg-error', text: '38% High Risk' },
    { name: 'Food Access', percentage: 25, color: 'bg-primary', text: '25% Moderate Risk' },
    { name: 'Transportation', percentage: 22, color: 'bg-primary', text: '22% Moderate Risk' },
    { name: 'Education', percentage: 15, color: 'bg-secondary', text: '15% Low Risk' },
    { name: 'Healthcare Access', percentage: 12, color: 'bg-secondary', text: '12% Low Risk' }
  ];

  // Table Data
  const membersRequiringAttention = [
    { id: 'M-10231', priority: 'High', clinical: '84%', social: '72%', current: '86%', future6: '86%', future12: '89%', driver: 'Housing Instability', status: 'Pending', statusColor: 'bg-slate-400' },
    { id: 'M-44290', priority: 'High', clinical: '82%', social: '65%', current: '74%', future6: '81%', future12: '85%', driver: 'Economic Stability', status: 'Active', statusColor: 'bg-secondary' },
    { id: 'M-88102', priority: 'Medium', clinical: '70%', social: '38%', current: '54%', future6: '61%', future12: '65%', driver: 'Medication Adherence', status: 'Pending', statusColor: 'bg-slate-400' }
  ];

  return (
    <div className="flex flex-col gap-8 w-full">
      {/* Bento Grid: Summary Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-6">
        {summaryCards.map((card, i) => (
          <div key={i} className="glass-card p-4 flex flex-col justify-between h-[180px] relative overflow-hidden">
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-9 h-9 shrink-0 rounded-full ${card.bg} flex items-center justify-center ${card.color}`}>
                <card.icon className="w-5 h-5" />
              </div>
              <h3 className="text-[12px] font-bold text-on-surface leading-tight">{card.title}</h3>
            </div>
            <div className="mb-1 flex-1 flex flex-col justify-center">
              <div className="text-[28px] font-bold text-on-surface tracking-tight">{card.value}</div>
              <div className={`flex items-center gap-0.5 mt-0.5 text-[11px] font-semibold ${card.trendColor}`}>
                {card.trend === 'up' && <TrendingUp className="w-3.5 h-3.5" />}
                {card.trend === 'down' && <TrendingDown className="w-3.5 h-3.5" />}
                {card.trend === 'flat' && <Minus className="w-3.5 h-3.5" />}
                <span>{card.subtext}</span>
              </div>
            </div>
            {/* Sparkline */}
            <div className="w-full h-8 mt-1 opacity-60">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={card.spark}>
                  <Line type="monotone" dataKey="v" stroke={card.stroke} strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </section>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Population Risk Synthesis */}
        <section className="glass-card p-6 sm:p-8 flex flex-col relative overflow-hidden min-h-[440px]">
          <div className="flex justify-between items-center mb-6 shrink-0 z-10">
            <h2 className="text-lg font-bold text-on-surface">Population Risk Synthesis</h2>
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
                <div className="text-[11px] uppercase text-on-surface-variant tracking-wider font-bold mb-1">Clinical Risk</div>
                <div className="text-3xl font-extrabold text-primary">45%</div>
              </div>
              <div className="glass-panel p-4 text-center shadow-sm relative rounded-xl bg-white/70">
                <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-tertiary rounded-full shadow-[0_0_8px_#5d6e81]"></div>
                <div className="text-[11px] uppercase text-on-surface-variant tracking-wider font-bold mb-1">Social Risk</div>
                <div className="text-3xl font-extrabold text-tertiary">32%</div>
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
                    strokeDasharray="263.8" 
                    strokeDashoffset="60" 
                    strokeLinecap="round" 
                    strokeWidth="6" 
                  />
                </svg>
                <div className="text-center bg-white/90 w-32 h-32 sm:w-36 sm:h-36 rounded-full flex flex-col items-center justify-center border border-slate-100 shadow-inner">
                  <div className="text-[11px] uppercase text-primary font-bold tracking-wider mb-0.5 leading-tight">Combined<br />Risk</div>
                  <div className="text-4xl font-extrabold text-primary">77%</div>
                </div>
              </div>
            </div>
          </div>

          <div className="w-full text-center mt-6 shrink-0 z-10">
            <div className="inline-flex items-center gap-1.5 bg-primary/5 border border-primary/20 py-1.5 px-5 rounded-full backdrop-blur-sm shadow-sm">
              <Brain className="text-primary w-4 h-4" />
              <p className="text-[12px] text-primary font-semibold">AI Model Confidence: High (92%)</p>
            </div>
          </div>
        </section>

        {/* SDOH Risk Drivers */}
        <section className="glass-card p-6 sm:p-8 flex flex-col relative overflow-hidden min-h-[440px]">
          <div className="flex justify-between items-center mb-6 shrink-0">
            <h2 className="text-lg font-bold text-on-surface">Population Social Risk Drivers</h2>
            <span className="bg-error/10 text-error border border-error/20 text-[11px] font-bold px-3 py-1 rounded-full shadow-sm">High Impact</span>
          </div>
          <div className="flex flex-col gap-4.5 flex-1 justify-center">
            {socialDrivers.map((driver, index) => (
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
          <h2 className="text-lg font-bold text-on-surface">Impact of SDOH on Prioritization</h2>
          <button className="w-8 h-8 rounded-full bg-white/50 border border-slate-200/40 flex items-center justify-center text-primary hover:bg-white transition-colors shadow-sm shrink-0">
            <Info className="w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12 py-4 flex-1">
          <div className="glass-panel p-6 text-center w-full md:w-60 flex flex-col items-center shrink-0 bg-white/40">
            <div className="text-[12px] font-bold text-on-surface-variant mb-2 leading-tight">Clinical Only High-Risk<br />Members</div>
            <div className="text-3xl sm:text-4xl text-on-surface font-extrabold">842</div>
          </div>
          
          <div className="flex flex-col items-center px-4 shrink-0">
            <div className="text-3xl font-extrabold text-secondary mb-1">+398</div>
            <div className="text-[12px] text-on-surface-variant font-semibold text-center max-w-[150px]">Members elevated by SDOH information</div>
          </div>

          <div className="glass-panel p-6 text-center w-full md:w-60 bg-gradient-to-b from-white/80 to-primary/5 flex flex-col items-center border-primary/20 shadow-[0_8px_30px_rgba(0,85,153,0.06)] shrink-0">
            <div className="text-[12px] font-bold text-on-surface mb-2 leading-tight">Clinical + SDOH<br />High-Risk Members</div>
            <div className="text-3xl sm:text-4xl text-primary font-extrabold">1,240</div>
          </div>
        </div>
        <div className="mt-6 text-center border-t border-slate-200/40 pt-4 shrink-0">
          <p className="text-[13px] text-on-surface-variant font-medium">
            SDOH insights elevated <span className="text-primary font-bold">398</span> additional members into the high-risk group.
          </p>
        </div>
      </section>

      {/* Priority Members Table */}
      <section className="glass-card overflow-hidden flex flex-col border border-white/80">
        <div className="p-6 border-b border-slate-200/40 flex justify-between items-center bg-white/40 backdrop-blur-sm shrink-0">
          <h2 className="text-lg font-bold text-on-surface">Members Requiring Attention</h2>
          <button 
            onClick={() => navigate('/members')}
            className="text-[12px] font-bold text-primary bg-white/80 border border-primary/20 px-4 py-2 rounded-full hover:bg-primary hover:text-white transition-all duration-300 shadow-sm"
          >
            View All
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
                <th className="p-4 w-[180px]">Primary Driver</th>
                <th className="p-4 w-[120px]">Status</th>
                <th className="p-4 pr-6 text-right w-[120px]">Action</th>
              </tr>
            </thead>
            <tbody className="text-[13px] divide-y divide-slate-100 bg-white/20">
              {membersRequiringAttention.map((member) => (
                <tr key={member.id} className="hover:bg-slate-50/40 transition-colors">
                  <td className="p-4 pl-6">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-error/10 text-error border border-error/20 whitespace-nowrap">
                      {member.priority}
                    </span>
                  </td>
                  <td className="p-4 font-semibold text-primary whitespace-nowrap">{member.id}</td>
                  <td className="p-4 text-error font-semibold whitespace-nowrap">{member.clinical}</td>
                  <td className="p-4 text-error font-semibold whitespace-nowrap">{member.social}</td>
                  <td className="p-4 font-bold text-error whitespace-nowrap">{member.current}</td>
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
                      className="text-primary bg-primary/10 hover:bg-primary hover:text-white px-3.5 py-1 rounded-full text-[12px] font-semibold transition-all"
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
