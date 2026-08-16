import React, { useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import { AlertTriangle, ArrowRight } from 'lucide-react';

interface CountyData {
  name: string;
  lat: number;
  lng: number;
  priorityScore: number;
  highRiskMembers: number;
  interventions: number;
  clinicalOnly: number;
  combinedRisk: number;
  status: 'Critical' | 'Elevated' | 'Moderate';
  statusColor: string;
  drivers: { name: string; percentage: number; color: string }[];
}

const counties: CountyData[] = [
  {
    name: 'Los Angeles County',
    lat: 34.0522,
    lng: -118.2437,
    priorityScore: 82,
    highRiskMembers: 12450,
    interventions: 3204,
    clinicalOnly: 65,
    combinedRisk: 82,
    status: 'Critical',
    statusColor: 'bg-error/10 text-error border-error/20',
    drivers: [
      { name: 'Housing Instability', percentage: 85, color: 'bg-error' },
      { name: 'Food Insecurity', percentage: 72, color: 'bg-error/70' }
    ]
  },
  {
    name: 'San Francisco County',
    lat: 37.7749,
    lng: -122.4194,
    priorityScore: 68,
    highRiskMembers: 3420,
    interventions: 1120,
    clinicalOnly: 55,
    combinedRisk: 68,
    status: 'Elevated',
    statusColor: 'bg-amber-100 text-amber-800 border-amber-200',
    drivers: [
      { name: 'Economic Stability', percentage: 78, color: 'bg-tertiary' },
      { name: 'Medication Adherence', percentage: 60, color: 'bg-tertiary/70' }
    ]
  },
  {
    name: 'San Diego County',
    lat: 32.7157,
    lng: -117.1611,
    priorityScore: 74,
    highRiskMembers: 6102,
    interventions: 2014,
    clinicalOnly: 58,
    combinedRisk: 74,
    status: 'Critical',
    statusColor: 'bg-error/10 text-error border-error/20',
    drivers: [
      { name: 'Transportation Barriers', percentage: 80, color: 'bg-error' },
      { name: 'Food Insecurity', percentage: 65, color: 'bg-error/70' }
    ]
  },
  {
    name: 'Fresno County',
    lat: 36.7378,
    lng: -119.7871,
    priorityScore: 79,
    highRiskMembers: 5204,
    interventions: 1580,
    clinicalOnly: 60,
    combinedRisk: 79,
    status: 'Critical',
    statusColor: 'bg-error/10 text-error border-error/20',
    drivers: [
      { name: 'Healthcare Access Gaps', percentage: 88, color: 'bg-error' },
      { name: 'Housing Instability', percentage: 68, color: 'bg-error/70' }
    ]
  }
];

const RiskMap: React.FC = () => {
  const [selectedCounty, setSelectedCounty] = useState<CountyData>(counties[0]);
  const [metric, setMetric] = useState('Priority Score (Combined)');
  const [forecast, setForecast] = useState<'current' | '6m' | '12m'>('current');

  return (
    <div className="flex flex-col gap-6 w-full h-[calc(100vh-8.5rem)]">
      {/* Page Header */}
      <div className="shrink-0">
        <h2 className="text-2xl font-bold text-on-surface mb-1">California Population Risk Map</h2>
        <p className="text-[13px] text-on-surface-variant font-medium">
          Explore geographic patterns in clinical, social, and future population risk to prioritize interventions.
        </p>
      </div>

      {/* Control Bar */}
      <div className="glass-card rounded-xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 shrink-0 justify-between">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-col">
            <label className="text-[10px] font-bold text-on-surface-variant mb-1 uppercase tracking-wider">Map Metric</label>
            <select 
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              className="border border-slate-200 rounded-lg bg-transparent font-medium text-[13px] py-1.5 px-3 focus:ring-primary focus:border-primary"
            >
              <option>Priority Score (Combined)</option>
              <option>Clinical Risk Only</option>
              <option>SDOH Risk Only</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-1.5 border border-slate-200 p-1 bg-slate-50/50 rounded-lg shrink-0">
          <button 
            onClick={() => setForecast('current')}
            className={`px-4 py-1.5 rounded-md text-[13px] font-bold transition-all ${
              forecast === 'current' ? 'bg-primary text-white shadow-sm' : 'text-on-surface-variant hover:bg-slate-200/50'
            }`}
          >
            Current
          </button>
          <button 
            onClick={() => setForecast('6m')}
            className={`px-4 py-1.5 rounded-md text-[13px] font-bold transition-all ${
              forecast === '6m' ? 'bg-primary text-white shadow-sm' : 'text-on-surface-variant hover:bg-slate-200/50'
            }`}
          >
            6M Forecast
          </button>
          <button 
            onClick={() => setForecast('12m')}
            className={`px-4 py-1.5 rounded-md text-[13px] font-bold transition-all ${
              forecast === '12m' ? 'bg-primary text-white shadow-sm' : 'text-on-surface-variant hover:bg-slate-200/50'
            }`}
          >
            12M Forecast
          </button>
        </div>
      </div>

      {/* Main Dashboard Layout */}
      <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-[300px] overflow-hidden">
        {/* Map Container */}
        <div className="flex-1 glass-card rounded-xl overflow-hidden relative border border-slate-200/50 min-h-[250px] lg:min-h-0">
          <MapContainer 
            center={[36.7783, -119.4179]} 
            zoom={6} 
            scrollWheelZoom={false}
            className="w-full h-full"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {counties.map((county, index) => (
              <CircleMarker
                key={index}
                center={[county.lat, county.lng]}
                radius={county.priorityScore / 3}
                fillColor={county.priorityScore > 75 ? '#ba1a1a' : '#005599'}
                color={county.priorityScore > 75 ? '#93000a' : '#004883'}
                weight={2}
                fillOpacity={0.6}
                eventHandlers={{
                  click: () => {
                    setSelectedCounty(county);
                  }
                }}
              >
                <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                  <div className="font-bold text-[12px]">{county.name}</div>
                  <div className="text-[11px] text-slate-500 font-semibold mt-0.5">Priority Score: {county.priorityScore}</div>
                </Tooltip>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>

        {/* Right Detail Panel */}
        <div className="w-full lg:w-96 glass-card rounded-xl flex flex-col overflow-hidden border border-slate-200/50 shrink-0 h-full">
          {/* Header */}
          <div className="p-6 border-b border-slate-200 bg-slate-50/50 shrink-0">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="text-lg font-bold text-on-surface leading-tight">{selectedCounty.name}</h3>
                <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Selected Region</span>
              </div>
              <div className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 border ${selectedCounty.statusColor}`}>
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{selectedCounty.status}</span>
              </div>
            </div>
            <div className="flex items-end gap-1.5 mt-2">
              <span className="text-3xl font-extrabold text-primary leading-none">
                {forecast === '6m' ? selectedCounty.priorityScore + 2 : forecast === '12m' ? selectedCounty.priorityScore + 5 : selectedCounty.priorityScore}
              </span>
              <span className="text-[12px] text-on-surface-variant font-medium mb-0.5">/100 Priority Score</span>
            </div>
          </div>

          {/* Details Scroll */}
          <div className="p-6 flex-1 overflow-y-auto space-y-6 bg-white custom-scrollbar">
            {/* Pop Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-slate-200/60 rounded-xl p-3 bg-slate-50/40">
                <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">High Risk Members</div>
                <div className="text-lg font-extrabold text-error">
                  {selectedCounty.highRiskMembers.toLocaleString()}
                </div>
              </div>
              <div className="border border-slate-200/60 rounded-xl p-3 bg-slate-50/40">
                <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">Interventions</div>
                <div className="text-lg font-extrabold text-secondary">
                  {selectedCounty.interventions.toLocaleString()}
                </div>
              </div>
            </div>

            {/* SDOH Impact */}
            <div className="p-4 bg-slate-50/50 border border-slate-100 rounded-xl">
              <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-3">Impact of SDOH Integration</h4>
              <div className="flex items-center justify-between text-center mt-2">
                <div>
                  <div className="text-[11px] font-semibold text-on-surface-variant mb-0.5">Clinical Only</div>
                  <div className="text-md font-bold text-slate-600">{selectedCounty.clinicalOnly}%</div>
                </div>
                <ArrowRight className="text-on-surface-variant w-4 h-4" />
                <div className="bg-primary/5 p-2 px-3.5 rounded-lg border border-primary/20">
                  <div className="text-[11px] font-bold text-primary mb-0.5">Combined</div>
                  <div className="text-md font-extrabold text-primary">{selectedCounty.combinedRisk}%</div>
                </div>
              </div>
            </div>

            {/* SDOH Drivers */}
            <div>
              <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-3 border-b border-slate-100 pb-1.5">Top SDOH Drivers</h4>
              <div className="space-y-3.5">
                {selectedCounty.drivers.map((driver, index) => (
                  <div key={index}>
                    <div className="flex justify-between text-[12px] font-semibold text-slate-700 mb-1">
                      <span>{driver.name}</span>
                      <span className="font-extrabold text-error">Critical</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${driver.color}`} style={{ width: `${driver.percentage}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="p-4 border-t border-slate-200 bg-slate-50/50 shrink-0">
            <button 
              onClick={() => alert(`Analyzing cohort for ${selectedCounty.name}`)}
              className="w-full py-2.5 bg-primary text-white rounded-lg font-bold text-[13px] hover:bg-primary/95 transition-colors shadow-sm"
            >
              Analyze County Cohort
            </button>
          </div>
        </div>
      </div>

      {/* Methodology Footer */}
      <div className="text-center shrink-0">
        <p className="text-[11px] text-on-surface-variant font-semibold">
          Synthetic Data Prototype. Methodology: Priority Score is a weighted composite of clinical (HCC) and proprietary SDOH indices.
        </p>
      </div>
    </div>
  );
};

export default RiskMap;
