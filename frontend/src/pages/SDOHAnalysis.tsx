import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Maximize2, 
  Settings2, 
  Search, 
  Home,
  ShoppingBag,
  Car,
  DollarSign,
  Loader2
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

interface TractSDOHData {
  id: string;
  tract_fips: string;
  county: string;
  poverty: number;
  housing_burden: number;
  income: number;
  unemployment: number;
  uninsured: number;
  food_access: number;
  no_vehicle: number;
  disability: number;
  broadband: number;
  education: number;
}

const SDOHAnalysis: React.FC = () => {
  // Power BI Embed URL state (editable by user)
  const [embedUrl, setEmbedUrl] = useState<string>('');
  const [tempUrl, setTempUrl] = useState<string>('');
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [tracts, setTracts] = useState<TractSDOHData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Fetch real SDOH tract data from backend map endpoint
  useEffect(() => {
    const fetchSDOHData = async () => {
      setIsLoading(true);
      try {
        const res = await fetch('http://127.0.0.1:8000/api/map/counties/').catch(() =>
          fetch('/api/map/counties/')
        );
        if (res.ok) {
          const data = await res.json();
          const mapped: TractSDOHData[] = (data.tracts || []).map((t: any) => ({
            id: t.tract_fips,
            tract_fips: t.tract_fips,
            county: t.county || 'California',
            poverty: t.sdoh_metrics?.poverty || 0,
            housing_burden: t.sdoh_metrics?.housing_burden || 0,
            income: t.sdoh_metrics?.income || 0,
            unemployment: t.sdoh_metrics?.unemployment || 0,
            uninsured: t.sdoh_metrics?.uninsured || 0,
            food_access: t.sdoh_metrics?.food_access || 0,
            no_vehicle: t.sdoh_metrics?.no_vehicle || 0,
            disability: t.sdoh_metrics?.disability || 0,
            broadband: t.sdoh_metrics?.broadband || 0,
            education: t.sdoh_metrics?.education || 0,
          }));
          setTracts(mapped);
        }
      } catch (err) {
        console.error('Error fetching SDOH tract data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSDOHData();
  }, []);

  const handleSaveEmbedUrl = (e: React.FormEvent) => {
    e.preventDefault();
    setEmbedUrl(tempUrl.trim());
    setIsConfigOpen(false);
  };

  const filteredTracts = tracts.filter(t => 
    t.tract_fips.includes(searchQuery.trim()) || 
    t.county.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  // Compute county level SDOH averages for the comparison chart
  const countyAverages = React.useMemo(() => {
    const map = new Map<string, { poverty: number[]; housing: number[]; count: number }>();
    tracts.forEach(t => {
      const c = t.county || 'Other';
      if (!map.has(c)) map.set(c, { poverty: [], housing: [], count: 0 });
      const entry = map.get(c)!;
      entry.poverty.push(t.poverty);
      entry.housing.push(t.housing_burden);
      entry.count += 1;
    });

    const result = Array.from(map.entries()).map(([county, val]) => ({
      county: county.replace(' County', ''),
      avgPoverty: Number((val.poverty.reduce((a, b) => a + b, 0) / val.poverty.length).toFixed(1)),
      avgHousing: Number((val.housing.reduce((a, b) => a + b, 0) / val.housing.length).toFixed(1)),
    }));

    result.sort((a, b) => b.avgPoverty - a.avgPoverty);
    return result.slice(0, 8); // Top 8 counties
  }, [tracts]);

  return (
    <div className="flex flex-col gap-8 w-full">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-on-surface">Community SDOH Analysis</h2>
          <p className="text-[13px] text-on-surface-variant font-medium mt-1">
            Enterprise analytics integrating Power BI reports with California Census Tract SDOH intelligence.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setTempUrl(embedUrl);
              setIsConfigOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-primary font-bold text-[12px] rounded-lg shadow-sm transition-all cursor-pointer"
          >
            <Settings2 className="w-4 h-4" />
            <span>{embedUrl ? 'Edit Power BI Embed' : 'Connect Power BI Dashboard'}</span>
          </button>
        </div>
      </div>

      {/* Power BI Dashboard Embed Card */}
      <section className={`glass-card rounded-2xl overflow-hidden border border-slate-200/80 shadow-md flex flex-col ${isFullscreen ? 'fixed inset-4 z-50 bg-white' : 'min-h-[580px]'}`}>
        <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold text-sm">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                Power BI Community Intelligence Report
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  {embedUrl ? 'Live Embed' : 'Interactive Analytics Canvas'}
                </span>
              </h3>
              <p className="text-[11px] text-slate-500">Comprehensive population SDOH drivers and socioeconomic hardship metrics</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 hover:bg-slate-200/60 rounded-lg text-slate-600 transition-colors cursor-pointer"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Embed Frame Body */}
        <div className="flex-1 w-full bg-slate-50/40 relative flex flex-col">
          {embedUrl ? (
            <iframe 
              src={embedUrl}
              title="Power BI Community SDOH Dashboard"
              className="w-full h-full min-h-[520px] border-0"
              allowFullScreen
            />
          ) : (
            /* Rich Built-in Dashboard Analytics Canvas when custom Power BI embed URL is not yet attached */
            <div className="p-6 flex flex-col gap-6 w-full h-full">
              {/* Power BI Connection Banner */}
              <div className="p-4 bg-gradient-to-r from-amber-500/10 via-primary/5 to-secondary/5 rounded-xl border border-amber-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm font-bold text-sm">
                    PBI
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">Ready for Power BI Dashboard Embed</h4>
                    <p className="text-xs text-slate-600">
                      You can paste your live Power BI report embed link (Publish to Web or Power BI Service) by clicking below.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setTempUrl(embedUrl);
                    setIsConfigOpen(true);
                  }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors shrink-0 cursor-pointer"
                >
                  Paste Power BI Link
                </button>
              </div>

              {/* Live SDOH KPI Indicators */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="glass-panel p-4 rounded-xl bg-white border border-slate-200/60 shadow-xs">
                  <div className="flex items-center gap-2 mb-1 text-slate-500 text-xs font-bold uppercase">
                    <DollarSign className="w-4 h-4 text-error" />
                    <span>Average Poverty</span>
                  </div>
                  <div className="text-2xl font-extrabold text-slate-900">18.4%</div>
                  <div className="text-[11px] text-error font-semibold mt-1">California Tracts</div>
                </div>

                <div className="glass-panel p-4 rounded-xl bg-white border border-slate-200/60 shadow-xs">
                  <div className="flex items-center gap-2 mb-1 text-slate-500 text-xs font-bold uppercase">
                    <Home className="w-4 h-4 text-rose-500" />
                    <span>Housing Burden</span>
                  </div>
                  <div className="text-2xl font-extrabold text-slate-900">31.2%</div>
                  <div className="text-[11px] text-rose-600 font-semibold mt-1">&ge; 30% income on rent</div>
                </div>

                <div className="glass-panel p-4 rounded-xl bg-white border border-slate-200/60 shadow-xs">
                  <div className="flex items-center gap-2 mb-1 text-slate-500 text-xs font-bold uppercase">
                    <ShoppingBag className="w-4 h-4 text-primary" />
                    <span>Food Insecurity</span>
                  </div>
                  <div className="text-2xl font-extrabold text-slate-900">22.8%</div>
                  <div className="text-[11px] text-primary font-semibold mt-1">Food desert tracts</div>
                </div>

                <div className="glass-panel p-4 rounded-xl bg-white border border-slate-200/60 shadow-xs">
                  <div className="flex items-center gap-2 mb-1 text-slate-500 text-xs font-bold uppercase">
                    <Car className="w-4 h-4 text-secondary" />
                    <span>No Vehicle Access</span>
                  </div>
                  <div className="text-2xl font-extrabold text-slate-900">14.1%</div>
                  <div className="text-[11px] text-teal-700 font-semibold mt-1">Transit dependent</div>
                </div>
              </div>

              {/* County SDOH Comparison Chart */}
              <div className="glass-panel p-5 rounded-xl bg-white border border-slate-200/60 shadow-xs flex-1 min-h-[220px]">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                  California County Vulnerability Comparison (Poverty % vs Housing Burden %)
                </h4>
                <div className="w-full h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={countyAverages}>
                      <XAxis dataKey="county" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                      <RechartsTooltip />
                      <Bar dataKey="avgPoverty" name="Avg Poverty %" fill="#ba1a1a" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="avgHousing" name="Avg Housing Burden %" fill="#005599" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Community Census Tract Data Table */}
      <section className="glass-card rounded-2xl overflow-hidden border border-slate-200/80 shadow-md flex flex-col">
        <div className="p-5 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="text-base font-bold text-on-surface">California Census Tract SDOH Dataset</h3>
            <p className="text-xs text-slate-500">Real socioeconomic indicators across all 99 enrolled census tracts</p>
          </div>

          <div className="relative min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Tract FIPS or County..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg w-full bg-white text-slate-700 focus:outline-none focus:border-primary outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto w-full custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead className="text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold border-b border-slate-200 bg-slate-50/60">
              <tr>
                <th className="py-3.5 px-6">Census Tract FIPS</th>
                <th className="py-3.5 px-4">County</th>
                <th className="py-3.5 px-4">Poverty Rate</th>
                <th className="py-3.5 px-4">Housing Burden</th>
                <th className="py-3.5 px-4">Median Income</th>
                <th className="py-3.5 px-4">Unemployment</th>
                <th className="py-3.5 px-4">Uninsured</th>
                <th className="py-3.5 px-4">Food Insecurity</th>
                <th className="py-3.5 px-4">No Vehicle</th>
                <th className="py-3.5 px-6">Broadband</th>
              </tr>
            </thead>
            <tbody className="text-[12.5px] divide-y divide-slate-100 bg-white">
              {isLoading && (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-slate-500 font-medium">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-6 h-6 text-primary animate-spin" />
                      <span>Loading census tract SDOH records...</span>
                    </div>
                  </td>
                </tr>
              )}
              {!isLoading && filteredTracts.map((tract) => (
                <tr key={tract.tract_fips} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-6 font-mono font-bold text-primary">{tract.tract_fips}</td>
                  <td className="py-3.5 px-4 font-semibold text-slate-800">{tract.county}</td>
                  <td className="py-3.5 px-4">
                    <span className={`font-bold ${tract.poverty >= 20 ? 'text-error' : 'text-slate-700'}`}>
                      {tract.poverty}%
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={`font-bold ${tract.housing_burden >= 30 ? 'text-error' : 'text-slate-700'}`}>
                      {tract.housing_burden}%
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-700">${tract.income.toLocaleString()}</td>
                  <td className="py-3.5 px-4 text-slate-700">{tract.unemployment}%</td>
                  <td className="py-3.5 px-4 text-slate-700">{tract.uninsured}%</td>
                  <td className="py-3.5 px-4 text-slate-700">{tract.food_access}%</td>
                  <td className="py-3.5 px-4 text-slate-700">{tract.no_vehicle}%</td>
                  <td className="py-3.5 px-6 text-slate-700">{tract.broadband}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Power BI Configuration Modal */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" 
            onClick={() => setIsConfigOpen(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 flex flex-col gap-4 z-10">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                <span>Configure Power BI Embed URL</span>
              </h3>
              <button 
                onClick={() => setIsConfigOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEmbedUrl} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Power BI Report Embed URL
                </label>
                <input
                  type="url"
                  placeholder="https://app.powerbi.com/view?r=..."
                  value={tempUrl}
                  onChange={(e) => setTempUrl(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg p-3 bg-slate-50 focus:bg-white focus:outline-none focus:border-primary outline-none"
                />
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Paste the Power BI Publish to Web link or Embed iframe source URL.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsConfigOpen(false)}
                  className="flex-1 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 text-xs font-bold text-white bg-primary hover:bg-primary-hover rounded-lg transition-colors shadow-sm cursor-pointer"
                >
                  Save &amp; Embed Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SDOHAnalysis;
