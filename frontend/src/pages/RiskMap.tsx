import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import { 
  AlertTriangle, 
  ArrowRight, 
  MapPin, 
  Users, 
  RefreshCw, 
  Loader2,
  ExternalLink,
  ShieldAlert,
  Sparkles
} from 'lucide-react';

interface CountyMember {
  id: string;
  tract_fips: string;
  future_risk_5: string;
  future_risk_5_confidence_pct: string;
  future_risk_3: string;
  future_risk_3_confidence_pct: string;
  driver: string;
  priority: string;
  encounters: number;
  ed_visits: number;
  ip_visits: number;
}

interface CountyData {
  name: string;
  lat: number;
  lng: number;
  total_members: number;
  high_risk_members: number;
  priorityScore: number;
  status: 'Critical' | 'Elevated' | 'Moderate' | 'Stable';
  statusColor: string;
  future_risk_5_breakdown: {
    Critical: number;
    High: number;
    Moderate: number;
    Low: number;
    'Very Low': number;
  };
  future_risk_3_breakdown: {
    High: number;
    Moderate: number;
    Low: number;
  };
  sdoh_averages: {
    poverty: number;
    housing_burden: number;
    unemployment: number;
    uninsured: number;
    food_access: number;
  };
  drivers: { name: string; count: number; percentage: number; color: string }[];
  members: CountyMember[];
}

interface MapApiResponse {
  total_counties: number;
  total_members: number;
  total_high_risk_members: number;
  counties: CountyData[];
}

// Sub-component to re-center map when county changes
const MapRecenter: React.FC<{ lat: number; lng: number }> = ({ lat, lng }) => {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      map.setView([lat, lng], Math.max(map.getZoom(), 7), { animate: true });
    }
  }, [lat, lng, map]);
  return null;
};

const RiskMap: React.FC = () => {
  const navigate = useNavigate();

  const [counties, setCounties] = useState<CountyData[]>([]);
  const [totalMembers, setTotalMembers] = useState(0);
  const [totalHighRisk, setTotalHighRisk] = useState(0);
  const [selectedCounty, setSelectedCounty] = useState<CountyData | null>(null);
  
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [selectedMemberTab, setSelectedMemberTab] = useState<'overview' | 'members'>('overview');

  const fetchCountyData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/map/counties/').catch(() =>
        fetch('http://127.0.0.1:8000/api/map/counties/')
      );

      if (!response.ok) {
        throw new Error(`Failed to load county map data (HTTP ${response.status})`);
      }

      const data: MapApiResponse = await response.json();
      setCounties(data.counties || []);
      setTotalMembers(data.total_members || 0);
      setTotalHighRisk(data.total_high_risk_members || 0);

      if (data.counties && data.counties.length > 0) {
        setSelectedCounty(data.counties[0]);
      }
    } catch (err: any) {
      console.error('Error fetching county map data:', err);
      setError(err.message || 'Unable to connect to the backend county map service.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCountyData();
  }, []);

  // Filter counts
  const filterCounts = useMemo(() => {
    return {
      all: counties.length,
      high: counties.filter(c => c.status === 'Critical' || c.status === 'Elevated').length,
      mod: counties.filter(c => c.status === 'Moderate').length,
      low: counties.filter(c => c.status === 'Stable').length,
    };
  }, [counties]);

  // Filter counties based on status filter
  const filteredCounties = useMemo(() => {
    return counties.filter(c => {
      if (statusFilter === 'All') return true;
      if (statusFilter === 'HighPriority') return c.status === 'Critical' || c.status === 'Elevated';
      if (statusFilter === 'Moderate') return c.status === 'Moderate';
      if (statusFilter === 'Stable') return c.status === 'Stable';
      return true;
    });
  }, [counties, statusFilter]);

  // Marker styling
  const getMarkerStyling = (county: CountyData) => {
    if (county.status === 'Critical') {
      return { fill: '#ba1a1a', stroke: '#93000a', radius: 10 + county.total_members * 0.8 };
    }
    if (county.status === 'Elevated') {
      return { fill: '#e11d48', stroke: '#be123c', radius: 9 + county.total_members * 0.7 };
    }
    if (county.status === 'Moderate') {
      return { fill: '#d97706', stroke: '#b45309', radius: 8 + county.total_members * 0.6 };
    }
    return { fill: '#0d9488', stroke: '#0f766e', radius: 7 + county.total_members * 0.5 };
  };

  const getRiskBadge = (level: string) => {
    switch (level) {
      case 'Critical':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-error/10 text-error border border-error/20">Critical</span>;
      case 'High':
      case 'Elevated':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">High</span>;
      case 'Moderate':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">Moderate</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200">Low / Stable</span>;
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full h-[calc(100vh-8.5rem)]">
      {/* Page Header */}
      <div className="shrink-0 flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-on-surface mb-1">California Population Risk Map</h2>
            {!isLoading && totalMembers > 0 && (
              <span className="px-2.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full text-[11px] font-bold">
                {totalMembers} Members • {totalHighRisk} High/Critical Priority
              </span>
            )}
          </div>
          <p className="text-[13px] text-on-surface-variant font-medium">
            County-level aggregation of real patient clinical records, 5-class & 3-class future ML predictions, and California SDOH environment.
          </p>
        </div>
        <button 
          onClick={fetchCountyData} 
          disabled={isLoading}
          className="flex items-center gap-2 px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[12px] font-semibold rounded-lg shadow-sm transition-all disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Map</span>
        </button>
      </div>

      {/* Control & Filter Bar */}
      <div className="glass-card rounded-xl p-3.5 flex flex-wrap items-center gap-4 shrink-0 justify-between border border-slate-200/50">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-primary" />
          <span className="text-[13px] font-bold text-slate-800">Population Risk Distribution</span>
          <span className="text-[11px] text-slate-500 font-medium">({filteredCounties.length} counties visible)</span>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 text-[12px]">
          <span className="text-[11px] font-bold text-slate-400 uppercase mr-1">Filter by Risk:</span>
          
          <button 
            onClick={() => setStatusFilter('All')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
              statusFilter === 'All' ? 'bg-primary text-white font-bold' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            All ({filterCounts.all})
          </button>

          <button 
            onClick={() => setStatusFilter('HighPriority')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
              statusFilter === 'HighPriority' ? 'bg-rose-600 text-white font-bold' : 'bg-slate-50 text-rose-700 hover:bg-rose-50 border border-rose-200'
            }`}
          >
            High/Critical Risk ({filterCounts.high})
          </button>

          <button 
            onClick={() => setStatusFilter('Moderate')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
              statusFilter === 'Moderate' ? 'bg-amber-600 text-white font-bold' : 'bg-slate-50 text-amber-700 hover:bg-amber-50 border border-amber-200'
            }`}
          >
            Moderate ({filterCounts.mod})
          </button>

          <button 
            onClick={() => setStatusFilter('Stable')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
              statusFilter === 'Stable' ? 'bg-teal-600 text-white font-bold' : 'bg-slate-50 text-teal-700 hover:bg-teal-50 border border-teal-200'
            }`}
          >
            Low / Stable ({filterCounts.low})
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-800 text-[12px] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span>{error}</span>
          </div>
          <button onClick={fetchCountyData} className="font-bold underline cursor-pointer">Retry</button>
        </div>
      )}

      {/* Main Map + County Details Layout */}
      <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-[350px] overflow-hidden">
        {/* Left/Center: Interactive Map Container */}
        <div className="flex-1 glass-card rounded-xl overflow-hidden relative border border-slate-200/50 min-h-[300px] lg:min-h-0 flex flex-col">
          {isLoading ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-slate-50/50">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-[13px] font-medium text-slate-500">Aggregating county-level future risk from PostgreSQL...</p>
            </div>
          ) : (
            <div className="relative w-full h-full">
              <MapContainer 
                center={[36.7783, -119.4179]} 
                zoom={6} 
                scrollWheelZoom={true}
                className="w-full h-full"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {selectedCounty && (
                  <MapRecenter lat={selectedCounty.lat} lng={selectedCounty.lng} />
                )}

                {filteredCounties.map((county) => {
                  const style = getMarkerStyling(county);
                  const isSelected = selectedCounty?.name === county.name;

                  return (
                    <CircleMarker
                      key={county.name}
                      center={[county.lat, county.lng]}
                      radius={isSelected ? style.radius + 3 : style.radius}
                      fillColor={style.fill}
                      color={isSelected ? '#0f172a' : style.stroke}
                      weight={isSelected ? 3 : 1.5}
                      fillOpacity={isSelected ? 0.85 : 0.65}
                      eventHandlers={{
                        click: () => {
                          setSelectedCounty(county);
                          setSelectedMemberTab('overview');
                        }
                      }}
                    >
                      <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                        <div className="font-bold text-[12px] text-slate-900">{county.name}</div>
                        <div className="text-[11px] text-slate-600 font-medium">
                          {county.total_members} Active Member{county.total_members === 1 ? '' : 's'}
                        </div>
                        {county.high_risk_members > 0 && (
                          <div className="text-[10px] text-rose-600 font-bold">
                            ⚠️ {county.high_risk_members} High / Critical Risk
                          </div>
                        )}
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Avg Poverty: {county.sdoh_averages.poverty}% • Housing: {county.sdoh_averages.housing_burden}%
                        </div>
                      </Tooltip>
                    </CircleMarker>
                  );
                })}
              </MapContainer>

              {/* Map Floating Legend */}
              <div className="absolute bottom-4 left-4 z-[1000] bg-white/95 backdrop-blur-md p-3 rounded-xl border border-slate-200/80 shadow-lg text-[11px] space-y-1.5">
                <p className="font-bold text-slate-700 uppercase tracking-wider text-[10px] border-b border-slate-100 pb-1 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-primary" />
                  <span>County Risk Legend</span>
                </p>

                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ba1a1a]"></span>
                  <span className="text-slate-600 font-semibold">Critical Priority</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#e11d48]"></span>
                  <span className="text-slate-600 font-semibold">Elevated High Risk</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#d97706]"></span>
                  <span className="text-slate-600 font-semibold">Moderate Risk</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#0d9488]"></span>
                  <span className="text-slate-600 font-semibold">Low / Stable Risk</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Detail Panel: County Intelligence & Member Cohort Drill-Down */}
        <div className="w-full lg:w-[430px] glass-card rounded-xl flex flex-col overflow-hidden border border-slate-200/50 shrink-0 h-full bg-white">
          {selectedCounty ? (
            <>
              {/* Header */}
              <div className="p-5 border-b border-slate-200 bg-slate-50/70 shrink-0">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-primary shrink-0" />
                      <h3 className="text-lg font-bold text-on-surface leading-tight">{selectedCounty.name}</h3>
                    </div>
                    <span className="text-[11px] font-bold text-slate-500 ml-6">
                      {selectedCounty.total_members} Active Patient{selectedCounty.total_members === 1 ? '' : 's'} • {selectedCounty.high_risk_members} High/Critical
                    </span>
                  </div>
                  <div className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 border ${selectedCounty.statusColor}`}>
                    <AlertTriangle className="w-3 h-3" />
                    <span>{selectedCounty.status}</span>
                  </div>
                </div>

                {/* Tab switcher: County Overview vs Member Drill-Down */}
                <div className="flex gap-2 mt-3 pt-2 border-t border-slate-200/60">
                  <button 
                    onClick={() => setSelectedMemberTab('overview')}
                    className={`flex-1 py-1.5 rounded-lg text-[12px] font-bold transition-all cursor-pointer ${
                      selectedMemberTab === 'overview' ? 'bg-primary text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    County Analytics
                  </button>
                  <button 
                    onClick={() => setSelectedMemberTab('members')}
                    className={`flex-1 py-1.5 rounded-lg text-[12px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      selectedMemberTab === 'members' ? 'bg-primary text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Members ({selectedCounty.members.length})</span>
                  </button>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="p-5 flex-1 overflow-y-auto space-y-5 bg-white custom-scrollbar">
                {selectedMemberTab === 'overview' ? (
                  <>
                    {/* 5-Class Current Risk Distribution */}
                    <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-100">
                      <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2.5 flex justify-between items-center">
                        <span>Current Risk Distribution (5 Classes)</span>
                        <span className="text-[10px] text-slate-400 font-mono">{selectedCounty.total_members} total</span>
                      </h4>
                      <div className="space-y-2">
                        {Object.entries(selectedCounty.future_risk_5_breakdown).map(([cls, count]) => {
                          const pct = selectedCounty.total_members > 0 ? (count / selectedCounty.total_members * 100).toFixed(0) : 0;
                          return (
                            <div key={cls} className="flex flex-col gap-1">
                              <div className="flex justify-between text-[11px] font-semibold">
                                <span className={count > 0 && (cls === 'Critical' || cls === 'High') ? 'text-error font-bold' : 'text-slate-600'}>
                                  {cls} ({count})
                                </span>
                                <span className="font-mono text-slate-500">{pct}%</span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full ${
                                    cls === 'Critical' ? 'bg-error' :
                                    cls === 'High' ? 'bg-rose-500' :
                                    cls === 'Moderate' ? 'bg-amber-500' :
                                    cls === 'Low' ? 'bg-teal-500' : 'bg-emerald-500'
                                  }`} 
                                  style={{ width: `${pct}%` }}
                                ></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 3-Class Future Risk Forecast (CatBoost) */}
                    <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-100">
                      <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2.5">
                        Future Risk Forecast (3-Class CatBoost)
                      </h4>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2 bg-white rounded-lg border border-slate-200/60">
                          <span className="block text-lg font-bold text-rose-600">{selectedCounty.future_risk_3_breakdown.High || 0}</span>
                          <span className="text-[10px] font-bold text-slate-500 uppercase">High</span>
                        </div>
                        <div className="p-2 bg-white rounded-lg border border-slate-200/60">
                          <span className="block text-lg font-bold text-amber-600">{selectedCounty.future_risk_3_breakdown.Moderate || 0}</span>
                          <span className="text-[10px] font-bold text-slate-500 uppercase">Moderate</span>
                        </div>
                        <div className="p-2 bg-white rounded-lg border border-slate-200/60">
                          <span className="block text-lg font-bold text-teal-600">{selectedCounty.future_risk_3_breakdown.Low || 0}</span>
                          <span className="text-[10px] font-bold text-slate-500 uppercase">Low</span>
                        </div>
                      </div>
                    </div>

                    {/* Community SDOH Indicators */}
                    <div>
                      <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2.5">
                        Census Tract SDOH Environment (County Averages)
                      </h4>
                      <div className="grid grid-cols-2 gap-2 text-[12px]">
                        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex justify-between">
                          <span className="text-slate-500 font-medium">Avg Poverty:</span>
                          <span className="font-bold text-slate-800">{selectedCounty.sdoh_averages.poverty}%</span>
                        </div>
                        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex justify-between">
                          <span className="text-slate-500 font-medium">Housing Burden:</span>
                          <span className="font-bold text-slate-800">{selectedCounty.sdoh_averages.housing_burden}%</span>
                        </div>
                        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex justify-between">
                          <span className="text-slate-500 font-medium">Unemployment:</span>
                          <span className="font-bold text-slate-800">{selectedCounty.sdoh_averages.unemployment}%</span>
                        </div>
                        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex justify-between">
                          <span className="text-slate-500 font-medium">Uninsured Pop:</span>
                          <span className="font-bold text-slate-800">{selectedCounty.sdoh_averages.uninsured}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Top Drivers in Selected County */}
                    {selectedCounty.drivers.length > 0 && (
                      <div>
                        <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2.5">
                          Dominant Risk Drivers in {selectedCounty.name}
                        </h4>
                        <div className="space-y-2.5">
                          {selectedCounty.drivers.map((drv, i) => (
                            <div key={i} className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                              <div className="flex justify-between text-[12px] font-semibold text-slate-800 mb-1">
                                <span>{drv.name}</span>
                                <span className="font-bold text-primary">{drv.percentage}% of cohort</span>
                              </div>
                              <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                                <div className={`h-full ${drv.color}`} style={{ width: `${drv.percentage}%` }}></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  /* Member Drill-Down List */
                  <div className="space-y-3">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[11px] font-bold text-slate-500 uppercase">
                        Patients Residing in {selectedCounty.name}
                      </span>
                      <span className="text-[11px] font-bold text-primary">{selectedCounty.members.length} members</span>
                    </div>

                    {selectedCounty.members.map((mem) => (
                      <div 
                        key={mem.id}
                        onClick={() => navigate(`/members?id=${mem.id}`)}
                        className="p-3 bg-slate-50/70 hover:bg-slate-100/80 rounded-xl border border-slate-200/70 transition-all cursor-pointer group"
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-bold text-[13px] text-primary group-hover:underline flex items-center gap-1">
                            {mem.id}
                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </span>
                          {getRiskBadge(mem.future_risk_5)}
                        </div>
                        <div className="text-[11px] text-slate-500 flex justify-between items-center mt-1">
                          <span>Tract: {mem.tract_fips}</span>
                          <span className="font-semibold text-slate-700">{mem.driver}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action footer */}
              <div className="p-4 border-t border-slate-200 bg-slate-50/50 shrink-0">
                <button 
                  onClick={() => navigate('/members')}
                  className="w-full py-2.5 bg-primary text-white rounded-xl font-bold text-[13px] hover:bg-primary/95 transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  <span>View All California Members</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center h-full">
              <MapPin className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm font-semibold">Select a county on the map to inspect risk distribution and patient cohort</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RiskMap;
