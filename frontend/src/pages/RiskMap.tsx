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
  Sparkles, 
  Search 
} from 'lucide-react';

interface MemberDetail {
  id: string;
  name?: string;
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

interface RegionData {
  id: string;
  name: string;
  county?: string;
  tract_fips?: string;
  type: 'county' | 'tract';
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
  primary_driver?: string;
  driver_type?: string;
  sdoh_metrics?: {
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
  };
  sdoh_averages: {
    poverty: number;
    housing_burden: number;
    unemployment: number;
    uninsured: number;
    food_access: number;
  };
  drivers: { name: string; count: number; percentage: number; color: string }[];
  members: MemberDetail[];
}

interface MapApiResponse {
  total_counties: number;
  total_tracts: number;
  total_members: number;
  total_high_risk_members: number;
  counties: RegionData[];
  tracts: RegionData[];
}

// Sub-component to re-center map when selection changes
const MapRecenter: React.FC<{ lat: number; lng: number; zoom?: number }> = ({ lat, lng, zoom }) => {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      map.setView([lat, lng], zoom || Math.max(map.getZoom(), 7), { animate: true });
    }
  }, [lat, lng, zoom, map]);
  return null;
};

const RiskMap: React.FC = () => {
  const navigate = useNavigate();

  const [counties, setCounties] = useState<RegionData[]>([]);
  const [tracts, setTracts] = useState<RegionData[]>([]);
  const [totalMembers, setTotalMembers] = useState(0);
  const [totalHighRisk, setTotalHighRisk] = useState(0);
  
  // Selection
  const [selectedRegion, setSelectedRegion] = useState<RegionData | null>(null);
  
  // View Modes: 'county' | 'tract'
  const [viewMode, setViewMode] = useState<'county' | 'tract'>('county');
  
  // Risk Perspective / Metric Layer: 'future5' | 'future3' | 'sdoh'
  const [riskPerspective, setRiskPerspective] = useState<'future5' | 'future3' | 'sdoh'>('future5');
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedMemberTab, setSelectedMemberTab] = useState<'overview' | 'members'>('overview');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMapData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('http://127.0.0.1:8000/api/map/counties/').catch(() =>
        fetch('/api/map/counties/')
      );

      if (!response.ok) {
        throw new Error(`Failed to load map data (HTTP ${response.status})`);
      }

      const data: MapApiResponse = await response.json();
      setCounties(data.counties || []);
      setTracts(data.tracts || []);
      setTotalMembers(data.total_members || 0);
      setTotalHighRisk(data.total_high_risk_members || 0);

      if (viewMode === 'county' && data.counties && data.counties.length > 0) {
        setSelectedRegion(data.counties[0]);
      } else if (viewMode === 'tract' && data.tracts && data.tracts.length > 0) {
        setSelectedRegion(data.tracts[0]);
      }
    } catch (err: any) {
      console.error('Error fetching map data:', err);
      setError(err.message || 'Unable to connect to the backend map service.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMapData();
  }, []);

  // When viewMode switches, select the top item in that dataset
  useEffect(() => {
    if (viewMode === 'county' && counties.length > 0) {
      setSelectedRegion(counties[0]);
    } else if (viewMode === 'tract' && tracts.length > 0) {
      setSelectedRegion(tracts[0]);
    }
  }, [viewMode]);

  // Current active dataset based on viewMode
  const activeDataset = viewMode === 'county' ? counties : tracts;

  // Filter counts
  const filterCounts = useMemo(() => {
    return {
      all: activeDataset.length,
      high: activeDataset.filter(c => c.status === 'Critical' || c.status === 'Elevated').length,
      mod: activeDataset.filter(c => c.status === 'Moderate').length,
      low: activeDataset.filter(c => c.status === 'Stable').length,
    };
  }, [activeDataset]);

  // Filtered items based on statusFilter and searchQuery
  const filteredRegions = useMemo(() => {
    return activeDataset.filter(region => {
      // Search
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        region.name.toLowerCase().includes(q) || 
        (region.county && region.county.toLowerCase().includes(q)) ||
        (region.tract_fips && region.tract_fips.includes(q)) ||
        region.members.some(m => m.id.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      // Status Filter
      if (statusFilter === 'All') return true;
      if (statusFilter === 'HighPriority') return region.status === 'Critical' || region.status === 'Elevated';
      if (statusFilter === 'Moderate') return region.status === 'Moderate';
      if (statusFilter === 'Stable') return region.status === 'Stable';
      return true;
    });
  }, [activeDataset, statusFilter, searchQuery]);

  // Marker styling based on Risk Perspective
  const getMarkerStyling = (region: RegionData) => {
    const isTract = region.type === 'tract';
    const baseRadius = isTract ? 7 : (9 + region.total_members * 0.7);

    if (riskPerspective === 'future5') {
      if (region.status === 'Critical') {
        return { fill: '#ba1a1a', stroke: '#93000a', radius: baseRadius + 3 };
      }
      if (region.status === 'Elevated') {
        return { fill: '#e11d48', stroke: '#be123c', radius: baseRadius + 2 };
      }
      if (region.status === 'Moderate') {
        return { fill: '#d97706', stroke: '#b45309', radius: baseRadius + 1 };
      }
      return { fill: '#0d9488', stroke: '#0f766e', radius: baseRadius };
    } 
    else if (riskPerspective === 'future3') {
      const high3 = region.future_risk_3_breakdown.High || 0;
      const mod3 = region.future_risk_3_breakdown.Moderate || 0;
      if (high3 > 0) {
        return { fill: '#ba1a1a', stroke: '#93000a', radius: baseRadius + 3 };
      }
      if (mod3 > 0) {
        return { fill: '#d97706', stroke: '#b45309', radius: baseRadius + 1 };
      }
      return { fill: '#0d9488', stroke: '#0f766e', radius: baseRadius };
    } 
    else {
      // SDOH Vulnerability
      const pov = region.sdoh_averages.poverty || 0;
      const house = region.sdoh_averages.housing_burden || 0;
      if (pov >= 20 || house >= 30) {
        return { fill: '#ba1a1a', stroke: '#93000a', radius: baseRadius + 3 };
      }
      if (pov >= 12 || house >= 20) {
        return { fill: '#d97706', stroke: '#b45309', radius: baseRadius + 1 };
      }
      return { fill: '#0d9488', stroke: '#0f766e', radius: baseRadius };
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full h-[calc(100vh-8.5rem)]">
      {/* Page Header */}
      <div className="shrink-0 flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-on-surface mb-1">Geographic Risk Analysis</h2>
            {!isLoading && totalMembers > 0 && (
              <span className="px-2.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full text-[11px] font-bold">
                {totalMembers} Members • {totalHighRisk} High/Critical Priority
              </span>
            )}
          </div>
          <p className="text-[13px] text-on-surface-variant font-medium">
            Real-time geospatial mapping across California Counties and Census Tracts combining 5-Class Future Risk, 3-Class CatBoost, and Census SDOH.
          </p>
        </div>
        <button 
          onClick={fetchMapData} 
          disabled={isLoading}
          className="flex items-center gap-2 px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[12px] font-semibold rounded-lg shadow-sm transition-all disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Map</span>
        </button>
      </div>

      {/* Control & View Switcher Bar */}
      <div className="glass-card rounded-xl p-3.5 flex flex-wrap items-center gap-4 shrink-0 justify-between border border-slate-200/50">
        <div className="flex items-center gap-3">
          {/* 1. View Mode Switcher: County vs Tract */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setViewMode('county')}
              className={`px-3 py-1 rounded-lg text-[12px] font-bold transition-all cursor-pointer ${
                viewMode === 'county' ? 'bg-white text-primary shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              County Level ({counties.length})
            </button>
            <button
              onClick={() => setViewMode('tract')}
              className={`px-3 py-1 rounded-lg text-[12px] font-bold transition-all cursor-pointer ${
                viewMode === 'tract' ? 'bg-white text-primary shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Census Tract Level ({tracts.length})
            </button>
          </div>

          {/* 2. Risk Perspective Selector */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setRiskPerspective('future5')}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                riskPerspective === 'future5' ? 'bg-primary text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Future Risk (5-Class)
            </button>
            <button
              onClick={() => setRiskPerspective('future3')}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                riskPerspective === 'future3' ? 'bg-primary text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Future Risk (3-Class)
            </button>
            <button
              onClick={() => setRiskPerspective('sdoh')}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                riskPerspective === 'sdoh' ? 'bg-primary text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              SDOH Environment
            </button>
          </div>
        </div>

        {/* 3. Filter Pills */}
        <div className="flex items-center gap-1.5 text-[12px]">
          <span className="text-[11px] font-bold text-slate-400 uppercase mr-1">Filter:</span>
          
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
            High/Critical ({filterCounts.high})
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
            Low/Stable ({filterCounts.low})
          </button>
        </div>

        {/* 4. Search Box */}
        <div className="relative min-w-[210px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder={`Search ${viewMode === 'county' ? 'county or patient ID...' : 'tract FIPS or patient...'}`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-3 py-1 text-xs border border-slate-200 rounded-lg w-full bg-white text-slate-700 focus:outline-none focus:border-primary outline-none"
          />
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-800 text-[12px] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span>{error}</span>
          </div>
          <button onClick={fetchMapData} className="font-bold underline cursor-pointer">Retry</button>
        </div>
      )}

      {/* Main Map + Details Layout */}
      <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-[350px] overflow-hidden">
        {/* Interactive Map */}
        <div className="flex-1 glass-card rounded-xl overflow-hidden relative border border-slate-200/50 min-h-[300px] lg:min-h-0 flex flex-col">
          {isLoading ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-slate-50/50">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-[13px] font-medium text-slate-500">Loading geospatial {viewMode === 'county' ? 'county' : 'census tract'} risk layers...</p>
            </div>
          ) : (
            <div className="relative w-full h-full">
              <MapContainer 
                center={[36.7783, -119.4179]} 
                zoom={viewMode === 'tract' ? 7 : 6} 
                scrollWheelZoom={true}
                className="w-full h-full"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {selectedRegion && (
                  <MapRecenter lat={selectedRegion.lat} lng={selectedRegion.lng} zoom={viewMode === 'tract' ? 9 : 7} />
                )}

                {filteredRegions.map((region) => {
                  const style = getMarkerStyling(region);
                  const isSelected = selectedRegion?.id === region.id;

                  return (
                    <CircleMarker
                      key={region.id}
                      center={[region.lat, region.lng]}
                      radius={isSelected ? style.radius + 3 : style.radius}
                      fillColor={style.fill}
                      color={isSelected ? '#0f172a' : style.stroke}
                      weight={isSelected ? 3 : (region.type === 'tract' ? 1.5 : 2)}
                      fillOpacity={isSelected ? 0.9 : 0.7}
                      eventHandlers={{
                        click: () => {
                          setSelectedRegion(region);
                          setSelectedMemberTab('overview');
                        }
                      }}
                    >
                      <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                        <div className="font-bold text-[12px] text-slate-900">
                          {region.name} {region.county && region.type === 'tract' ? `(${region.county})` : ''}
                        </div>
                        <div className="text-[11px] text-slate-600 font-medium mt-0.5">
                          {region.total_members} Active Member{region.total_members === 1 ? '' : 's'}
                        </div>
                        <div className="text-[10px] text-slate-700 font-semibold mt-0.5">
                          Future 5-Class: <span className="font-bold text-rose-600">{region.status}</span>
                        </div>
                        {region.primary_driver && (
                          <div className="text-[10px] text-slate-500 truncate max-w-[200px]">
                            Driver: {region.primary_driver}
                          </div>
                        )}
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Poverty: {region.sdoh_averages.poverty}% • Housing: {region.sdoh_averages.housing_burden}%
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
                  <span>
                    {riskPerspective === 'future5' ? '5-Class Future Risk' : (riskPerspective === 'future3' ? '3-Class Future Risk' : 'SDOH Hardship Level')}
                  </span>
                </p>

                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ba1a1a]"></span>
                  <span className="text-slate-600 font-semibold">Critical / High Risk</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#e11d48]"></span>
                  <span className="text-slate-600 font-semibold">Elevated Risk</span>
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

        {/* Right Detail Panel: Region / Tract Intelligence */}
        <div className="w-full lg:w-[430px] glass-card rounded-xl flex flex-col overflow-hidden border border-slate-200/50 shrink-0 h-full bg-white">
          {selectedRegion ? (
            <>
              {/* Header */}
              <div className="p-5 border-b border-slate-200 bg-slate-50/70 shrink-0">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-primary shrink-0" />
                      <h3 className="text-lg font-bold text-on-surface leading-tight">{selectedRegion.name}</h3>
                    </div>
                    <span className="text-[11px] font-bold text-slate-500 ml-6">
                      {selectedRegion.county ? `${selectedRegion.county} • ` : ''}
                      {selectedRegion.total_members} Active Patient{selectedRegion.total_members === 1 ? '' : 's'} • {selectedRegion.high_risk_members} High/Critical
                    </span>
                  </div>
                  <div className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 border ${selectedRegion.statusColor}`}>
                    <AlertTriangle className="w-3 h-3" />
                    <span>{selectedRegion.status}</span>
                  </div>
                </div>

                {/* Tab Switcher */}
                <div className="flex gap-2 mt-3 pt-2 border-t border-slate-200/60">
                  <button 
                    onClick={() => setSelectedMemberTab('overview')}
                    className={`flex-1 py-1.5 rounded-lg text-[12px] font-bold transition-all cursor-pointer ${
                      selectedMemberTab === 'overview' ? 'bg-primary text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    {selectedRegion.type === 'tract' ? 'Tract Analytics' : 'County Analytics'}
                  </button>
                  <button 
                    onClick={() => setSelectedMemberTab('members')}
                    className={`flex-1 py-1.5 rounded-lg text-[12px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      selectedMemberTab === 'members' ? 'bg-primary text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Members ({selectedRegion.members.length})</span>
                  </button>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="p-5 flex-1 overflow-y-auto space-y-5 bg-white custom-scrollbar">
                {selectedMemberTab === 'overview' ? (
                  <>
                    {/* 5-Class Future Risk Breakdown */}
                    <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-100">
                      <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2.5 flex justify-between items-center">
                        <span>Future Risk Distribution (5 Classes)</span>
                        <span className="text-[10px] text-slate-400 font-mono">{selectedRegion.total_members} total</span>
                      </h4>
                      <div className="space-y-2">
                        {Object.entries(selectedRegion.future_risk_5_breakdown).map(([cls, count]) => {
                          const pct = selectedRegion.total_members > 0 ? (count / selectedRegion.total_members * 100).toFixed(0) : 0;
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
                          <span className="block text-lg font-bold text-rose-600">{selectedRegion.future_risk_3_breakdown.High || 0}</span>
                          <span className="text-[10px] font-bold text-slate-500 uppercase">High</span>
                        </div>
                        <div className="p-2 bg-white rounded-lg border border-slate-200/60">
                          <span className="block text-lg font-bold text-amber-600">{selectedRegion.future_risk_3_breakdown.Moderate || 0}</span>
                          <span className="text-[10px] font-bold text-slate-500 uppercase">Moderate</span>
                        </div>
                        <div className="p-2 bg-white rounded-lg border border-slate-200/60">
                          <span className="block text-lg font-bold text-teal-600">{selectedRegion.future_risk_3_breakdown.Low || 0}</span>
                          <span className="text-[10px] font-bold text-slate-500 uppercase">Low</span>
                        </div>
                      </div>
                    </div>

                    {/* SDOH Environment Grid */}
                    <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-100">
                      <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2.5">
                        {selectedRegion.type === 'tract' ? 'Census Tract SDOH Environment' : 'County SDOH Environmental Profile'}
                      </h4>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="p-2.5 bg-white rounded-lg border border-slate-200/60">
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Poverty Rate</span>
                          <span className={`text-base font-extrabold ${selectedRegion.sdoh_averages.poverty >= 20 ? 'text-error' : 'text-slate-800'}`}>
                            {selectedRegion.sdoh_averages.poverty}%
                          </span>
                        </div>
                        <div className="p-2.5 bg-white rounded-lg border border-slate-200/60">
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Housing Burden</span>
                          <span className={`text-base font-extrabold ${selectedRegion.sdoh_averages.housing_burden >= 30 ? 'text-error' : 'text-slate-800'}`}>
                            {selectedRegion.sdoh_averages.housing_burden}%
                          </span>
                        </div>
                        <div className="p-2.5 bg-white rounded-lg border border-slate-200/60">
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Unemployment</span>
                          <span className="text-base font-extrabold text-slate-800">
                            {selectedRegion.sdoh_averages.unemployment}%
                          </span>
                        </div>
                        <div className="p-2.5 bg-white rounded-lg border border-slate-200/60">
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Uninsured Rate</span>
                          <span className="text-base font-extrabold text-slate-800">
                            {selectedRegion.sdoh_averages.uninsured}%
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Dominant TreeSHAP Feature Drivers */}
                    {selectedRegion.drivers && selectedRegion.drivers.length > 0 && (
                      <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-100">
                        <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2.5">
                          Top Risk Drivers (TreeSHAP)
                        </h4>
                        <div className="space-y-2">
                          {selectedRegion.drivers.map((d, idx) => (
                            <div key={idx} className="flex justify-between items-center p-2 bg-white rounded-lg border border-slate-100 text-[12px]">
                              <span className="font-semibold text-slate-800 truncate max-w-[240px]">{d.name}</span>
                              <span className="text-[11px] font-bold text-primary px-2 py-0.5 rounded-md bg-primary/5 border border-primary/10">
                                {d.percentage}%
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  /* Members Tab */
                  <div className="space-y-3">
                    <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">
                      Enrolled Patients ({selectedRegion.members.length})
                    </h4>
                    {selectedRegion.members.map((member) => (
                      <div 
                        key={member.id}
                        className="p-3.5 bg-slate-50/70 hover:bg-slate-100/70 transition-all rounded-xl border border-slate-200/60 flex flex-col gap-2"
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900 text-[13px]">{member.name || member.id}</span>
                            <span className="text-[11px] font-mono text-primary font-semibold">{member.id}</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            member.future_risk_5 === 'Critical' ? 'bg-error/10 text-error border border-error/20' :
                            member.future_risk_5 === 'High' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                            member.future_risk_5 === 'Moderate' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                            'bg-teal-100 text-teal-800 border border-teal-200'
                          }`}>
                            {member.future_risk_5} (5-Class)
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-600 font-medium">
                          <span className="font-semibold text-slate-800">Primary Driver:</span> {member.driver}
                        </div>

                        <div className="flex justify-between items-center pt-1 border-t border-slate-200/40 text-[11px] text-slate-500">
                          <span>ED: {member.ed_visits} • IP: {member.ip_visits} • Enc: {member.encounters}</span>
                          <button
                            onClick={() => navigate(`/members?id=${member.id}`)}
                            className="text-primary hover:underline font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <span>Analyze</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-slate-200 bg-slate-50/50 shrink-0 flex gap-2">
                <button
                  onClick={() => navigate('/members')}
                  className="w-full py-2.5 bg-primary text-white text-[12px] font-bold rounded-lg hover:bg-primary-hover transition-colors shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>View All California Members</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center h-full">
              <MapPin className="w-8 h-8 text-slate-300 mb-2" />
              <p className="text-sm font-semibold">Select a {viewMode === 'county' ? 'county' : 'census tract'} on the map</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RiskMap;
