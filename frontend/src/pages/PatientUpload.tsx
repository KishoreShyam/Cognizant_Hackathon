import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Upload, 
  Loader2, 
  AlertTriangle, 
  FileSpreadsheet, 
  FileText, 
  CheckCircle2
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
  future_risk_5: FutureRisk5;
  future_risk_3: FutureRisk3;
  sdoh_risk: SDOHRisk;
  driver: string;
  driver_type: 'Clinical' | 'SDOH' | 'Combined';
  shap_drivers?: ShapDriver[];
  status: string;
  statusColor: string;
  conditions: string[];
  edVisits: number;
  ipVisits: number;
  outpatientVisits?: number;
  encounters: number;
}

const PatientUpload: React.FC = () => {
  const navigate = useNavigate();

  // Upload States
  const [uploadType, setUploadType] = useState<'excel' | 'pdf'>('excel');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // New Patients list in session
  const [uploadedPatientIds, setUploadedPatientIds] = useState<string[]>([]);
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  // Load all members to filter by uploaded ones
  const fetchAllMembers = async () => {
    try {
      const response = await fetch(`/api/members/?t=${Date.now()}`);
      if (response.ok) {
        const data = await response.json();
        const memberList = data.members || [];
        setAllMembers(memberList);
      }
    } catch (err) {
      console.error("Failed to load members for filtering:", err);
    }
  };

  useEffect(() => {
    fetchAllMembers();
  }, []);

  const handleUploadSubmit = async () => {
    if (!uploadFile) return;
    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    
    if (uploadType === 'pdf') {
      setUploadProgress('Extracting clinical chart using OpenAI GPT model...');
    } else {
      setUploadProgress('Parsing Excel sheet and evaluating risk models...');
    }

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('type', uploadType);

    try {
      const response = await fetch('/api/current-patients/upload/', {
        method: 'POST',
        body: formData,
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Server error occurred during upload.');
      }

      setUploadSuccess(resData.message || 'File uploaded successfully.');
      
      // Store added IDs
      const addedIds = resData.patients || (resData.patient_id ? [resData.patient_id] : []);
      setUploadedPatientIds(addedIds);
      setUploadFile(null);
      
      // Re-fetch all members so we can filter them
      await fetchAllMembers();
      
    } catch (err: any) {
      setUploadError(err.message || 'An error occurred during file upload.');
    } finally {
      setIsUploading(false);
    }
  };

  // Filter and prioritize the newly added patients
  const prioritizedNewPatients = useMemo(() => {
    if (uploadedPatientIds.length === 0) return [];
    
    const membersList = Array.isArray(allMembers) ? allMembers : [];
    const filtered = membersList.filter(m => 
      m && (uploadedPatientIds.includes(m.id) || uploadedPatientIds.includes(m.patient_id))
    );
    
    // Sort by clinical/social priority logic: Critical, High, Moderate, Low
    const priorityWeights: Record<string, number> = {
      'Critical': 4,
      'High': 3,
      'Moderate': 2,
      'Low': 1,
      'Very Low': 0
    };

    return filtered.sort((a, b) => {
      const levelA = a.future_risk_5?.level || 'Low';
      const levelB = b.future_risk_5?.level || 'Low';
      const weightA = priorityWeights[levelA] || 0;
      const weightB = priorityWeights[levelB] || 0;
      return weightB - weightA;
    });
  }, [uploadedPatientIds, allMembers]);

  // Helper for rendering risk badges
  const getRiskBadge = (level: string) => {
    const lvl = (level || '').toLowerCase().trim();
    switch (lvl) {
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-error/10 text-error border border-error/20">
            <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse"></span>
            Critical
          </span>
        );
      case 'high':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 text-orange-800 border border-orange-200">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-600"></span>
            High
          </span>
        );
      case 'moderate':
      case 'medium':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            Moderate
          </span>
        );
      case 'low':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>
            Low
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Very Low
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-7xl mx-auto">
      
      {/* Upload Interface Section */}
      <div className="glass-card rounded-2xl p-6 border border-slate-200/50 bg-white/40 backdrop-blur-md">
        <h3 className="text-md font-bold text-slate-800 flex items-center gap-2 mb-6">
          <Upload className="w-5 h-5 text-primary" />
          Ingest Clinical Roster Details
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Options & Configuration */}
          <div className="space-y-5 lg:col-span-1">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Ingestion Model</span>
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => { setUploadType('excel'); setUploadFile(null); setUploadError(null); setUploadSuccess(null); }}
                  className={`flex items-center gap-3 py-3.5 px-4 rounded-xl border text-left font-bold text-[13px] transition-all cursor-pointer ${
                    uploadType === 'excel'
                      ? 'border-primary bg-primary/5 text-primary shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <FileSpreadsheet className="w-5 h-5 shrink-0" />
                  <div className="flex flex-col">
                    <span>Excel Template Sheet</span>
                    <span className="text-[10px] opacity-80 font-normal mt-0.5">Bulk uploads via template files</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => { setUploadType('pdf'); setUploadFile(null); setUploadError(null); setUploadSuccess(null); }}
                  className={`flex items-center gap-3 py-3.5 px-4 rounded-xl border text-left font-bold text-[13px] transition-all cursor-pointer ${
                    uploadType === 'pdf'
                      ? 'border-primary bg-primary/5 text-primary shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <FileText className="w-5 h-5 shrink-0" />
                  <div className="flex flex-col">
                    <span>AI PDF Extraction</span>
                    <span className="text-[10px] opacity-80 font-normal mt-0.5">Extract structured chart summaries using GPT</span>
                  </div>
                </button>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200/50 rounded-xl p-4 text-[12px] text-slate-500 leading-relaxed">
              <strong>Tip:</strong> Uploading runs predictions immediately. The results will populate below in real-time, sorted by prioritized risk rating.
            </div>
          </div>

          {/* File Upload Zone */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">File Attachment</span>
            <label className="border-2 border-dashed border-slate-200/80 hover:border-primary/50 rounded-2xl p-10 flex flex-col items-center justify-center gap-3 bg-white/50 hover:bg-primary/5 transition-all cursor-pointer relative group flex-1 min-h-[160px]">
              <input
                type="file"
                accept={uploadType === 'excel' ? '.xlsx, .xls' : '.pdf'}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    setUploadFile(e.target.files[0]);
                    setUploadError(null);
                    setUploadSuccess(null);
                  }
                }}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center border border-slate-200/80 group-hover:scale-105 transition-all shadow-sm">
                <Upload className="w-5 h-5 text-slate-500 group-hover:text-primary transition-colors" />
              </div>
              <span className="text-[14px] font-bold text-slate-800">
                {uploadFile ? uploadFile.name : 'Drag and drop file here, or click to browse'}
              </span>
              <span className="text-[11px] text-slate-400">
                {uploadType === 'excel' ? 'Supports Excel Roster Spreadsheet (.xlsx)' : 'Supports Clinical Summary Report PDF (.pdf)'}
              </span>
            </label>

            {/* Actions & Alerts */}
            <div className="flex flex-col gap-3">
              {isUploading && (
                <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4 text-blue-800">
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-[13px] font-bold">Uploading file...</span>
                    <span className="text-[11px] text-blue-600 font-semibold">{uploadProgress}</span>
                  </div>
                </div>
              )}

              {uploadError && (
                <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-red-800">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                  <span className="text-[13px] font-semibold">{uploadError}</span>
                </div>
              )}

              {uploadSuccess && (
                <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-800">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span className="text-[13px] font-semibold">{uploadSuccess}</span>
                </div>
              )}

              <div className="flex justify-end gap-3">
                {uploadFile && (
                  <button
                    type="button"
                    onClick={() => { setUploadFile(null); setUploadError(null); setUploadSuccess(null); }}
                    className="px-5 py-2 border border-slate-200 text-slate-600 font-bold text-[13px] rounded-lg hover:bg-slate-100 transition-all cursor-pointer"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleUploadSubmit}
                  disabled={isUploading || !uploadFile}
                  className="px-6 py-2.5 bg-primary text-white font-bold text-[13px] rounded-lg hover:bg-primary-dark disabled:opacity-50 transition-all cursor-pointer shadow-md"
                >
                  {isUploading ? 'Processing File...' : 'Upload & Process'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Roster Table of ONLY the uploaded patients in current session */}
      {uploadedPatientIds.length > 0 && (
        <div className="glass-card rounded-xl border border-slate-200/50 overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="px-6 py-4 border-b border-slate-200/50 bg-white/40 backdrop-blur-sm flex justify-between items-center">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-md font-bold text-on-surface">Prioritized Ingested Roster</h3>
              <p className="text-[11px] text-slate-400 font-medium">Displaying and sorting only the uploaded patients from this session</p>
            </div>
            <span className="text-[12px] text-primary font-bold bg-primary/5 px-2.5 py-1 rounded-lg border border-primary/10">
              {prioritizedNewPatients.length} patient record{prioritizedNewPatients.length === 1 ? '' : 's'} added
            </span>
          </div>
          
          <div className="overflow-x-auto w-full custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold border-b border-slate-200/40 bg-slate-50/50">
                <tr>
                  <th className="py-3.5 px-6">Rank</th>
                  <th className="py-3.5 px-6">Priority</th>
                  <th className="py-3.5 px-4">Patient ID</th>
                  <th className="py-3.5 px-4">CURRENT RISK</th>
                  <th className="py-3.5 px-4">SDOH RISK (COMMUNITY)</th>
                  <th className="py-3.5 px-4">FUTURE RISK</th>
                  <th className="py-3.5 px-4">PRIMARY DRIVER</th>
                  <th className="py-3.5 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/30 text-[13px]">
                {prioritizedNewPatients.map((member, index) => {
                  if (!member) return null;
                  return (
                    <tr key={member.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="py-4 px-6 font-bold text-slate-500">#{index + 1}</td>
                      <td className="py-4 px-6">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${member.priorityColor || 'bg-slate-100 text-slate-700'}`}>
                          {member.priority || 'Low'}
                        </span>
                      </td>
                      
                      {/* Patient ID */}
                      <td className="py-4 px-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 text-[13px]">{member.name || member.id}</span>
                          <span className="text-[11px] font-mono text-primary font-semibold">{member.id}</span>
                          <span className="text-[10px] text-slate-400 font-mono mt-0.5">Tract: {member.tract_fips || 'N/A'}</span>
                        </div>
                      </td>
                      
                      {/* CURRENT RISK */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          {getRiskBadge(member.future_risk_5?.level || 'Low')}
                        </div>
                      </td>

                      {/* SDOH RISK (COMMUNITY) */}
                      <td className="py-4 px-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-700">{member.sdoh_risk?.label || 'Low'}</span>
                          <span className="text-[10px] text-slate-400">{member.county || 'California'}</span>
                        </div>
                      </td>

                      {/* FUTURE RISK (3-CLASS) */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          {getRiskBadge(member.future_risk_3?.level || 'Low')}
                        </div>
                      </td>

                      {/* Primary Driver */}
                      <td className="py-4 px-4 font-medium text-on-surface">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[12px] font-bold text-slate-800">
                            {member.driver || 'Clinical Acuity'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-semibold">
                            ({member.driver_type || 'Clinical'})
                          </span>
                        </div>
                      </td>

                      {/* Action Button */}
                      <td className="py-4 px-6 text-right">
                        <button 
                          onClick={() => navigate(`/members?id=${encodeURIComponent(member.id)}`)}
                          className="px-3.5 py-1.5 border border-primary text-primary font-bold text-[12px] rounded-lg hover:bg-primary hover:text-white transition-colors shadow-sm cursor-pointer"
                        >
                          Analyze
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientUpload;
