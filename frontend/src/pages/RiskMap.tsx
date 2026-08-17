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
  DollarSign,
  Home,
  ShoppingBag,
  Car,
  Wifi,
  GraduationCap,
  Activity,
  Stethoscope,
  Pill,
  ShieldAlert,
  TrendingUp,
  CheckCircle2,
  X,
  Info,
  Heart,
  BarChart2,
} from 'lucide-react';

interface DriverItem {
  feature: string;
  display_name: string;
  mean_abs_shap: number;
  mean_shap: number;
  shap_formatted: string;
  affected_members: number;
  total_members: number;
  affected_percentage: number;
  affected_display: string;
  average_value: string;
  average_value_raw: number;
  category: 'Clinical' | 'SDOH';
}

interface MemberDetail {
  id: string;
  patient_id?: string;
  name?: string;
  tract_fips: string;
  future_risk_5: string;
  future_risk_5_confidence_pct: string;
  future_risk_3: string;
  future_risk_3_confidence_pct: string;
  driver: string;
  driver_type?: string;
  priority: string;
  encounters: number;
  ed_visits: number;
  ip_visits: number;
}

interface RegionData {
  id: string;
  name: string;
  county?: string;
  state?: string;
  tract_fips?: string;
  type: 'county' | 'tract';
  lat: number;
  lng: number;
  total_members: number;
  high_risk_members: number;
  priorityScore: number;
  status: 'Critical' | 'Elevated' | 'Moderate' | 'Stable';
  statusColor: string;
  average_future_risk?: number;
  sdoh_environment?: string;
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
  sdoh_metrics?: Record<string, number>;
  sdoh_averages: {
    poverty: number;
    housing_burden: number;
    income?: number;
    unemployment: number;
    uninsured: number;
    food_access: number;
  };
  sdoh_drivers?: DriverItem[];
  clinical_drivers?: DriverItem[];
  drivers?: { name: string; count: number; percentage: number; color: string }[];
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

// Map recentering helper
const MapRecenter: React.FC<{ lat: number; lng: number; zoom?: number }> = ({ lat, lng, zoom }) => {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      map.setView([lat, lng], zoom || Math.max(map.getZoom(), 7), { animate: true });
    }
  }, [lat, lng, zoom, map]);
  return null;
};

// Helper for factor icons
const getFeatureIcon = (featureKey: string, category: 'Clinical' | 'SDOH') => {
  const k = featureKey.toLowerCase();
  if (k.includes('poverty') || k.includes('unemploy')) return <DollarSign className="w-3.5 h-3.5 text-rose-500" />;
  if (k.includes('income')) return <DollarSign className="w-3.5 h-3.5 text-amber-600" />;
  if (k.includes('housing')) return <Home className="w-3.5 h-3.5 text-rose-500" />;
  if (k.includes('food')) return <ShoppingBag className="w-3.5 h-3.5 text-orange-500" />;
  if (k.includes('vehicle') || k.includes('transport')) return <Car className="w-3.5 h-3.5 text-blue-500" />;
  if (k.includes('broadband') || k.includes('digital')) return <Wifi className="w-3.5 h-3.5 text-indigo-500" />;
  if (k.includes('education')) return <GraduationCap className="w-3.5 h-3.5 text-amber-600" />;
  if (k.includes('emergency') || k.includes('ed_visit')) return <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />;
  if (k.includes('medication') || k.includes('adherence')) return <Pill className="w-3.5 h-3.5 text-purple-500" />;
  if (k.includes('hba1c') || k.includes('blood') || k.includes('bp')) return <Heart className="w-3.5 h-3.5 text-rose-500" />;
  if (k.includes('hospitalization') || k.includes('inpatient')) return <Activity className="w-3.5 h-3.5 text-rose-600" />;
  if (k.includes('procedure') || k.includes('condition') || k.includes('burden') || k.includes('utilization')) return <BarChart2 className="w-3.5 h-3.5 text-blue-500" />;
  if (category === 'Clinical') return <Stethoscope className="w-3.5 h-3.5 text-blue-500" />;
  return <Sparkles className="w-3.5 h-3.5 text-slate-400" />;
};

const statusBadgeStyle = (status: string) => {
  if (status === 'Critical') return 'bg-red-100 text-red-700 border-red-200';
  if (status === 'Elevated') return 'bg-orange-100 text-orange-700 border-orange-200';
  if (status === 'Moderate') return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-teal-100 text-teal-700 border-teal-200';
};

const RiskMap: React.FC = () => {
  const navigate = useNavigate();

  const [counties, setCounties] = useState<RegionData[]>([]);
  const [tracts, setTracts] = useState<RegionData[]>([]);

  const [selectedRegion, setSelectedRegion] = useState<RegionData | null>(null);
  const [viewMode, setViewMode] = useState<'county' | 'tract'>('county');
  const [activeCountyTab, setActiveCountyTab] = useState<'overview' | 'sdoh' | 'clinical' | 'interventions'>('overview');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [interventionNotice, setInterventionNotice] = useState<string | null>(null);

  const fetchMapData = async (forceRefresh = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const url = forceRefresh
        ? 'http://127.0.0.1:8000/api/map/counties/?refresh=1'
        : 'http://127.0.0.1:8000/api/map/counties/';
      const fallbackUrl = forceRefresh
        ? '/api/map/counties/?refresh=1'
        : '/api/map/counties/';
      const response = await fetch(url).catch(() => fetch(fallbackUrl));
      if (!response.ok) throw new Error(`Failed to load map data (HTTP ${response.status})`);
      const data: MapApiResponse = await response.json();
      setCounties(data.counties || []);
      setTracts(data.tracts || []);
      if (viewMode === 'county' && data.counties?.length > 0) {
        const sac = data.counties.find(c => c.name.includes('Sacramento'));
        setSelectedRegion(sac || data.counties[0]);
      } else if (viewMode === 'tract' && data.tracts?.length > 0) {
        setSelectedRegion(data.tracts[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Unable to connect to the backend geographic risk service.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchMapData(); }, []);

  useEffect(() => {
    if (viewMode === 'county' && counties.length > 0) {
      const sac = counties.find(c => c.name.includes('Sacramento'));
      setSelectedRegion(sac || counties[0]);
    } else if (viewMode === 'tract' && tracts.length > 0) {
      setSelectedRegion(tracts[0]);
    }
  }, [viewMode]);

  const activeDataset = viewMode === 'county' ? counties : tracts;

  const filterCounts = useMemo(() => ({
    all: activeDataset.length,
    high: activeDataset.filter(c => c.status === 'Critical' || c.status === 'Elevated').length,
    mod: activeDataset.filter(c => c.status === 'Moderate').length,
    low: activeDataset.filter(c => c.status === 'Stable').length,
  }), [activeDataset]);

  const filteredRegions = useMemo(() => {
    return activeDataset.filter(region => {
      if (statusFilter === 'All') return true;
      if (statusFilter === 'HighPriority') return region.status === 'Critical' || region.status === 'Elevated';
      if (statusFilter === 'Moderate') return region.status === 'Moderate';
      if (statusFilter === 'Stable') return region.status === 'Stable';
      return true;
    });
  }, [activeDataset, statusFilter]);

  const getMarkerStyling = (region: RegionData) => {
    const isTract = region.type === 'tract';
    const baseRadius = isTract ? 7 : (9 + region.total_members * 0.7);
    if (region.status === 'Critical') return { fill: '#dc2626', stroke: '#991b1b', radius: baseRadius + 3 };
    if (region.status === 'Elevated') return { fill: '#f97316', stroke: '#c2410c', radius: baseRadius + 2 };
    if (region.status === 'Moderate') return { fill: '#f59e0b', stroke: '#b45309', radius: baseRadius + 1 };
    return { fill: '#22c55e', stroke: '#15803d', radius: baseRadius };
  };

  const top5SdohDrivers = useMemo(() => (selectedRegion?.sdoh_drivers || []).slice(0, 5), [selectedRegion]);
  const top5ClinicalDrivers = useMemo(() => (selectedRegion?.clinical_drivers || []).slice(0, 5), [selectedRegion]);

  // Driver table row renderer
  const DriverRow = ({ driver, idx }: { driver: DriverItem; idx: number }) => {
    const barPct = Math.min(100, Math.max(8, Math.abs(driver.mean_shap) * 350));
    const isPositive = driver.mean_shap >= 0;
    return (
      <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
        <td className="py-2.5 pr-3">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center shrink-0">
              {getFeatureIcon(driver.feature, driver.category)}
            </span>
            <span className="text-[12px] font-semibold text-slate-800 leading-tight">{driver.display_name}</span>
          </div>
        </td>
        <td className="py-2.5 px-3 text-[12px] font-medium text-slate-600 whitespace-nowrap">
          {driver.affected_display}
        </td>
        <td className="py-2.5 px-3 text-[12px] font-semibold text-slate-700 whitespace-nowrap">
          {driver.average_value}
        </td>
        <td className="py-2.5 pl-3">
          <div className="flex flex-col items-end gap-1">
            <span className={`text-[12px] font-bold font-mono ${isPositive ? 'text-rose-600' : 'text-teal-700'}`}>
              {driver.shap_formatted}
            </span>
            <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isPositive
                    ? barPct > 60 ? 'bg-rose-600' : barPct > 35 ? 'bg-orange-500' : 'bg-amber-400'
                    : 'bg-teal-500'
                }`}
                style={{ width: `${barPct}%` }}
              />
            </div>
          </div>
        </td>
      </tr>
    );
  };

  const tabs = [
    { key: 'overview', label: 'Risk Overview' },
    { key: 'sdoh', label: 'SDOH Drivers' },
    { key: 'clinical', label: 'Clinical Drivers' },
    { key: 'interventions', label: 'Interventions' },
  ] as const;

  return (
    <div className="flex flex-col gap-4 w-full flex-1 min-h-0">

      {/* Intervention Banner */}
      {interventionNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-semibold flex items-center justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{interventionNotice}</span>
          </div>
          <button onClick={() => setInterventionNotice(null)} className="text-emerald-700 hover:text-emerald-900 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 text-red-800 text-xs flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={fetchMapData} className="font-bold underline cursor-pointer">Retry</button>
        </div>
      )}

      {/* ── Filter / Control Bar ── */}
      <div className="shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-2.5 flex flex-wrap items-center gap-3 justify-between">
        {/* Level toggles */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('county')}
            className={`px-3.5 py-1.5 rounded-lg text-[12px] font-bold transition-all cursor-pointer border ${
              viewMode === 'county'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >
            County Level ({counties.length})
          </button>
          <button
            onClick={() => setViewMode('tract')}
            className={`px-3.5 py-1.5 rounded-lg text-[12px] font-bold transition-all cursor-pointer border ${
              viewMode === 'tract'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >
            Census Tract Level ({tracts.length})
          </button>
        </div>

        {/* Status filter pills */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Filter:</span>
          <button
            onClick={() => setStatusFilter('All')}
            className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer border ${
              statusFilter === 'All'
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
            }`}
          >
            All ({filterCounts.all})
          </button>
          <button
            onClick={() => setStatusFilter('HighPriority')}
            className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer border ${
              statusFilter === 'HighPriority'
                ? 'bg-rose-600 text-white border-rose-600'
                : 'bg-white text-rose-600 border-rose-300 hover:bg-rose-50'
            }`}
          >
            High/Critical ({filterCounts.high})
          </button>
          <button
            onClick={() => setStatusFilter('Moderate')}
            className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer border ${
              statusFilter === 'Moderate'
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-white text-amber-600 border-amber-300 hover:bg-amber-50'
            }`}
          >
            Moderate ({filterCounts.mod})
          </button>
          <button
            onClick={() => setStatusFilter('Stable')}
            className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer border ${
              statusFilter === 'Stable'
                ? 'bg-teal-600 text-white border-teal-600'
                : 'bg-white text-teal-600 border-teal-300 hover:bg-teal-50'
            }`}
          >
            Low/Stable ({filterCounts.low})
          </button>
        </div>

        {/* Refresh */}
        <button
          onClick={() => fetchMapData(true)}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[12px] font-semibold rounded-lg shadow-sm transition-all disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Map</span>
        </button>
      </div>

      {/* ── MAP + COUNTY PANEL ROW ── */}
      <div className="flex gap-4 shrink-0" style={{ height: '440px' }}>

        {/* LEFT: Map - always rendered, loading overlay shown on top */}
        <div className="flex-1 bg-white rounded-xl overflow-hidden relative border border-slate-200 shadow-sm min-w-0">
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
              {!isLoading && filteredRegions.map((region) => {
                const style = getMarkerStyling(region);
                const isSelected = selectedRegion?.id === region.id;
                return (
                  <CircleMarker
                    key={region.id}
                    center={[region.lat, region.lng]}
                    radius={isSelected ? style.radius + 3 : style.radius}
                    fillColor={style.fill}
                    color={isSelected ? '#1e293b' : style.stroke}
                    weight={isSelected ? 3 : (region.type === 'tract' ? 1.5 : 2)}
                    fillOpacity={isSelected ? 0.95 : 0.78}
                    eventHandlers={{
                      click: () => {
                        setSelectedRegion(region);
                        setActiveCountyTab('overview');
                      }
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                      <div className="font-bold text-[12px] text-slate-900">
                        {region.name}{region.county && region.type === 'tract' ? ` (${region.county})` : ''}
                      </div>
                      <div className="text-[11px] text-slate-600 font-medium mt-0.5">
                        {region.total_members} Active Member{region.total_members === 1 ? '' : 's'} &bull; {region.high_risk_members} High/Critical
                      </div>
                      <div className="text-[10px] text-slate-700 font-semibold mt-0.5">
                        Risk: <span className="font-bold text-rose-600">{region.status}</span>
                      </div>
                    </Tooltip>
                  </CircleMarker>
                );
              })}
            </MapContainer>

            {/* Loading overlay - subtle banner over the map */}
            {isLoading && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2 z-[1000] pointer-events-none">
                <div className="flex items-center gap-2.5 bg-white/95 border border-slate-200 shadow-lg rounded-xl px-5 py-3">
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
                  <p className="text-[13px] font-semibold text-slate-700">Loading California risk layers...</p>
                </div>
              </div>
            )}

            {/* Floating Legend */}
            {!isLoading && (
              <div className="absolute bottom-4 left-4 z-[1000] bg-white/95 backdrop-blur-sm p-3 rounded-xl border border-slate-200 shadow-lg text-[11px] space-y-1.5 pointer-events-none">
                <p className="font-extrabold text-slate-600 uppercase tracking-wider text-[9px] border-b border-slate-100 pb-1.5">
                  5-CLASS FUTURE RISK
                </p>
                {[
                  { color: '#dc2626', label: 'Critical / High Risk' },
                  { color: '#f97316', label: 'Elevated Risk' },
                  { color: '#f59e0b', label: 'Moderate Risk' },
                  { color: '#22c55e', label: 'Low / Stable Risk' },
                  { color: '#86efac', label: 'Very Low Risk' },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-slate-600 font-semibold">{label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: County Intelligence Panel */}
        <div className="w-[430px] xl:w-[470px] bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden shrink-0">
          {selectedRegion ? (
            <>
              {/* County Header */}
              <div className="px-4 pt-4 pb-3 border-b border-slate-100 shrink-0">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                      selectedRegion.status === 'Critical' ? 'bg-rose-100 border-rose-200' :
                      selectedRegion.status === 'Elevated' ? 'bg-orange-100 border-orange-200' :
                      selectedRegion.status === 'Moderate' ? 'bg-amber-100 border-amber-200' :
                      'bg-teal-100 border-teal-200'
                    }`}>
                      <MapPin className={`w-4 h-4 ${
                        selectedRegion.status === 'Critical' ? 'text-rose-600' :
                        selectedRegion.status === 'Elevated' ? 'text-orange-600' :
                        selectedRegion.status === 'Moderate' ? 'text-amber-600' :
                        'text-teal-600'
                      }`} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-extrabold text-slate-900 leading-tight truncate">{selectedRegion.name}</h3>
                      <p className="text-[11px] text-slate-500 font-medium">
                        {selectedRegion.total_members} Active Members • <span className="text-rose-600 font-bold">{selectedRegion.high_risk_members} High/Critical</span>
                      </p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap shrink-0 ${statusBadgeStyle(selectedRegion.status)}`}>
                    {selectedRegion.status}
                  </span>
                </div>



                {/* Tabs */}
                <div className="flex items-center gap-0 mt-3 border-b border-slate-100 overflow-x-auto">
                  {tabs.map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveCountyTab(tab.key)}
                      className={`px-3 py-2 text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer border-b-2 ${
                        activeCountyTab === tab.key
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {/* RISK OVERVIEW TAB */}
                {activeCountyTab === 'overview' && (
                  <div className="p-4 space-y-3">
                    {/* Future Risk Distribution — full width on top */}
                    <div>
                      <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-2">
                        Future Risk Distribution (5 Classes)
                      </p>
                      <div className="space-y-2">
                        {(Object.entries(selectedRegion.future_risk_5_breakdown) as [string, number][]).map(([cls, count]) => {
                          const pct = selectedRegion.total_members > 0
                            ? Math.round(count / selectedRegion.total_members * 100)
                            : 0;
                          const barColor =
                            cls === 'Critical' ? 'bg-rose-600' :
                            cls === 'High' ? 'bg-orange-500' :
                            cls === 'Moderate' ? 'bg-amber-500' :
                            cls === 'Low' ? 'bg-teal-500' : 'bg-emerald-400';
                          return (
                            <div key={cls}>
                              <div className="flex justify-between text-[11px] mb-0.5">
                                <span className={`font-semibold ${cls === 'Critical' || cls === 'High' ? 'text-rose-700' : 'text-slate-600'}`}>
                                  {cls}
                                </span>
                                <span className="font-bold text-slate-600">{count} ({pct}%)</span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Metric cards — 3 in a row below the chart */}
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      {/* Total Members */}
                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col items-start gap-1">
                        <Users className="w-4 h-4 text-slate-400" />
                        <span className="text-xl font-extrabold text-slate-900 leading-none">{selectedRegion.total_members}</span>
                        <span className="text-[9px] font-bold text-slate-500 uppercase leading-tight">Total Members</span>
                      </div>
                      {/* High / Critical */}
                      <div className="p-2.5 bg-rose-50 rounded-xl border border-rose-100 flex flex-col items-start gap-1">
                        <AlertTriangle className="w-4 h-4 text-rose-500" />
                        <span className="text-xl font-extrabold text-rose-600 leading-none">{selectedRegion.high_risk_members}</span>
                        <span className="text-[9px] font-bold text-rose-600 uppercase leading-tight">High / Critical</span>
                      </div>
                      {/* Avg Future Risk */}
                      <div className="p-2.5 bg-blue-50 rounded-xl border border-blue-100 flex flex-col items-start gap-1">
                        <TrendingUp className="w-4 h-4 text-blue-500" />
                        <span className="text-xl font-extrabold text-blue-700 leading-none">
                          {selectedRegion.average_future_risk ? selectedRegion.average_future_risk.toFixed(1) : '—'}
                        </span>
                        <span className="text-[9px] font-bold text-blue-600 uppercase leading-tight">Avg. Future Risk</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* SDOH DRIVERS FULL TAB */}
                {activeCountyTab === 'sdoh' && (
                  <div className="p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Full SDOH Attribution</h4>
                        <p className="text-[11px] text-slate-400">Ranked by mean absolute TreeSHAP</p>
                      </div>
                      <button onClick={() => navigate('/sdoh-analysis')} className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer">
                        SDOH Analysis <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="space-y-2">
                      {(selectedRegion.sdoh_drivers || []).map((driver, idx) => (
                        <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col gap-1.5">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-md bg-white border border-slate-200 text-slate-600 text-[10px] font-mono font-bold flex items-center justify-center">{idx + 1}</span>
                              <span className="font-bold text-xs text-slate-900">{driver.display_name}</span>
                            </div>
                            <span className={`font-mono text-xs font-bold ${driver.mean_shap >= 0 ? 'text-rose-600' : 'text-teal-700'}`}>{driver.shap_formatted}</span>
                          </div>
                          <div className="flex justify-between text-[11px] text-slate-500">
                            <span>Affected: <strong className="text-slate-700">{driver.affected_display}</strong></span>
                            <span>County Avg: <strong className="text-slate-700">{driver.average_value}</strong></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* CLINICAL DRIVERS FULL TAB */}
                {activeCountyTab === 'clinical' && (
                  <div className="p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Full Clinical Attribution</h4>
                        <p className="text-[11px] text-slate-400">Ranked by mean absolute TreeSHAP</p>
                      </div>
                      <button onClick={() => navigate('/clinical')} className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer">
                        Clinical Risk <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="space-y-2">
                      {(selectedRegion.clinical_drivers || []).map((driver, idx) => (
                        <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col gap-1.5">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-md bg-white border border-slate-200 text-slate-600 text-[10px] font-mono font-bold flex items-center justify-center">{idx + 1}</span>
                              <span className="font-bold text-xs text-slate-900">{driver.display_name}</span>
                            </div>
                            <span className={`font-mono text-xs font-bold ${driver.mean_shap >= 0 ? 'text-rose-600' : 'text-teal-700'}`}>{driver.shap_formatted}</span>
                          </div>
                          <div className="flex justify-between text-[11px] text-slate-500">
                            <span>Affected: <strong className="text-slate-700">{driver.affected_display}</strong></span>
                            <span>County Avg: <strong className="text-slate-700">{driver.average_value}</strong></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* INTERVENTIONS TAB */}
                {activeCountyTab === 'interventions' && (
                  <div className="p-4 space-y-3">
                    <div>
                      <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Prioritized Care Pathways</h4>
                      <p className="text-[11px] text-slate-400">Targeted interventions aligned with population vulnerabilities</p>
                    </div>
                    <div className="space-y-2">
                      {selectedRegion.members.map((member, mIdx) => (
                        <div key={mIdx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col gap-2">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-xs text-slate-900">{member.name || member.id}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              member.future_risk_5 === 'Critical' ? 'bg-rose-100 text-rose-700' :
                              member.future_risk_5 === 'High' ? 'bg-orange-100 text-orange-700' :
                              'bg-amber-100 text-amber-700'
                            }`}>{member.future_risk_5} Risk</span>
                          </div>
                          <div className="text-[11px] text-slate-600">
                            <span className="font-bold text-slate-700">Action: </span>{member.priority}
                          </div>
                          <div className="flex justify-between items-center pt-1 border-t border-slate-100 text-[10px] text-slate-500">
                            <span>Driver: <strong>{member.driver}</strong></span>
                            <button onClick={() => navigate(`/members?id=${member.id}`)} className="text-blue-600 hover:underline font-bold flex items-center gap-0.5 cursor-pointer">
                              Profile <ArrowRight className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center h-full">
              <MapPin className="w-8 h-8 text-slate-300 mb-2" />
              <p className="text-sm font-semibold">Select a {viewMode === 'county' ? 'county' : 'census tract'}</p>
              <p className="text-xs text-slate-400 mt-1">Click any region to view risk intelligence</p>
            </div>
          )}
        </div>
      </div>

      {/* ── VISUALIZATION ROW (Full Width) ── */}
      {selectedRegion && (
        <div className="flex gap-4 shrink-0">

          {/* ─── LEFT: SDOH Diverging SHAP Waterfall Bar Chart ─── */}
          <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-w-0">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 className="text-[13px] font-extrabold text-blue-700 uppercase tracking-wide">SDOH Risk Drivers</h4>
                <Info className="w-3.5 h-3.5 text-slate-300" />
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-500 font-semibold">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-rose-500" />Risk↑
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-teal-500" />Protective
                </span>
              </div>
            </div>

            <div className="px-4 py-3">
              {top5SdohDrivers.length > 0 ? (() => {
                const LW = 148, VW = 66, TW = 600;
                const CW = TW - LW - VW;
                const HW = CW / 2;
                const CX = LW + HW;
                const BH = 20, RH = 46;
                const maxAbs = Math.max(...top5SdohDrivers.map(d => Math.abs(d.mean_shap)), 0.0001);
                const svgH = top5SdohDrivers.length * RH + 6;
                return (
                  <svg viewBox={`0 0 ${TW} ${svgH}`} className="w-full">
                    {/* Dashed center axis */}
                    <line x1={CX} y1={0} x2={CX} y2={svgH} stroke="#e2e8f0" strokeWidth={1.5} strokeDasharray="4 3" />
                    {/* "0" label */}
                    <text x={CX} y={svgH + 1} fontSize={9} fill="#cbd5e1" textAnchor="middle">0</text>

                    {top5SdohDrivers.map((d, i) => {
                      const y = i * RH + 6;
                      const bw = Math.max((Math.abs(d.mean_shap) / maxAbs) * HW, 3);
                      const pos = d.mean_shap >= 0;
                      const bx = pos ? CX : CX - bw;
                      const barC = pos ? '#ef4444' : '#14b8a6';
                      const trackC = pos ? '#fee2e2' : '#ccfbf1';
                      return (
                        <g key={d.feature}>
                          {i % 2 === 0 && <rect x={0} y={i * RH} width={TW} height={RH} fill="#f8fafc" />}
                          {/* Re-draw center line on top of bg stripe */}
                          <line x1={CX} y1={i * RH} x2={CX} y2={i * RH + RH} stroke="#e2e8f0" strokeWidth={1.5} strokeDasharray="4 3" />
                          {/* Feature label */}
                          <text x={LW - 8} y={y + BH / 2 + 4} fontSize={11} fill="#374151" fontWeight="600" textAnchor="end">
                            {d.display_name.length > 21 ? d.display_name.slice(0, 20) + '…' : d.display_name}
                          </text>
                          {/* Affected % small text under label */}
                          <text x={LW - 8} y={y + BH + 11} fontSize={9} fill="#9ca3af" textAnchor="end">
                            {d.affected_percentage.toFixed(0)}% affected
                          </text>
                          {/* Track (full half-width background) */}
                          <rect x={pos ? CX : CX - HW} y={y + 2} width={HW} height={BH - 4} fill={trackC} rx={3} />
                          {/* Active bar */}
                          <rect x={bx} y={y + 2} width={bw} height={BH - 4} fill={barC} rx={3} />
                          {/* SHAP value (right column) */}
                          <text x={CX + HW + 6} y={y + BH / 2 + 3} fontSize={11} fill={pos ? '#dc2626' : '#0d9488'} fontWeight="800">
                            {d.shap_formatted}
                          </text>
                          {/* Avg value */}
                          <text x={CX + HW + 6} y={y + BH + 11} fontSize={9} fill="#94a3b8">
                            {d.average_value}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                );
              })() : (
                <p className="py-8 text-center text-slate-400 text-xs">SDOH driver data unavailable.</p>
              )}
            </div>

            <div className="px-5 py-2.5 border-t border-slate-100 flex justify-center">
              <button onClick={() => setActiveCountyTab('sdoh')} className="text-[12px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1.5 transition-colors cursor-pointer">
                View All SDOH Drivers <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* ─── RIGHT: Clinical Concentric Ring Chart ─── */}
          <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-w-0">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 className="text-[13px] font-extrabold text-blue-700 uppercase tracking-wide">Clinical Risk Profile</h4>
                <Info className="w-3.5 h-3.5 text-slate-300" />
              </div>
              <span className="text-[11px] text-slate-400 italic font-medium">Arc = % members affected</span>
            </div>

            <div className="px-4 py-3">
              {top5ClinicalDrivers.length > 0 ? (() => {
                const cx = 92, cy = 90;
                const radii = [65, 51, 39, 27, 16];
                const SW = 10;
                const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#3b82f6', '#8b5cf6'];
                return (
                  <svg viewBox="0 0 560 186" className="w-full">
                    {top5ClinicalDrivers.map((d, i) => {
                      const r = radii[i];
                      const color = COLORS[i];
                      const circ = 2 * Math.PI * r;
                      const filled = (Math.min(d.affected_percentage, 100) / 100) * circ;
                      const legendY = 8 + i * 36;
                      return (
                        <g key={d.feature}>
                          {/* Track ring */}
                          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={SW} />
                          {/* Progress arc — starts at 12 o'clock */}
                          <circle
                            cx={cx} cy={cy} r={r}
                            fill="none"
                            stroke={color}
                            strokeWidth={SW}
                            strokeDasharray={`${filled} ${circ}`}
                            strokeLinecap="round"
                            transform={`rotate(-90 ${cx} ${cy})`}
                          />
                          {/* Legend dot */}
                          <circle cx={186} cy={legendY + 7} r={4.5} fill={color} />
                          {/* Feature name */}
                          <text x={197} y={legendY + 11} fontSize={11} fill="#1e293b" fontWeight="700">
                            {d.display_name.length > 25 ? d.display_name.slice(0, 24) + '…' : d.display_name}
                          </text>
                          {/* Stats row */}
                          <text x={197} y={legendY + 24} fontSize={10} fill="#64748b">
                            {`${d.affected_percentage.toFixed(0)}% affected  ·  `}
                            <tspan fill={d.mean_shap >= 0 ? '#dc2626' : '#0d9488'} fontWeight="800">{d.shap_formatted}</tspan>
                            {`  avg ${d.average_value}`}
                          </text>
                        </g>
                      );
                    })}
                    {/* Center summary */}
                    <text x={cx} y={cy - 7} textAnchor="middle" fontSize={20} fill="#0f172a" fontWeight="900">
                      {selectedRegion.high_risk_members}
                    </text>
                    <text x={cx} y={cy + 8} textAnchor="middle" fontSize={8} fill="#64748b" fontWeight="700" letterSpacing="0.5">
                      HIGH RISK
                    </text>
                    <text x={cx} y={cy + 20} textAnchor="middle" fontSize={8} fill="#94a3b8">
                      members
                    </text>
                  </svg>
                );
              })() : (
                <p className="py-8 text-center text-slate-400 text-xs">Clinical driver data unavailable.</p>
              )}
            </div>

            <div className="px-5 py-2.5 border-t border-slate-100 flex justify-center">
              <button onClick={() => setActiveCountyTab('clinical')} className="text-[12px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1.5 transition-colors cursor-pointer">
                View All Clinical Drivers <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

export default RiskMap;
