import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Send,
  Loader2,
  AlertTriangle,
  Brain,
  MapPin,
  TrendingUp,
  Activity,
  Sparkles,
  RefreshCw,
  User,
  ShieldAlert,
  BarChart2,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ShapDriver {
  rank?: number;
  feature?: string;
  display_name?: string;
  shap_value?: number;
  shap_formatted?: string;
  raw_value?: number | string;
  category?: 'Clinical' | 'SDOH';
}

interface PatientContext {
  patient_id: string;
  name: string;
  gender: string;
  county: string;
  state: string;
  tract_fips: string;
  risk_5_level: string;
  risk_5_confidence_pct: string;
  risk_3_level: string;
  risk_3_confidence_pct: string;
  intervention_priority: string;
  driver_type: string;
  primary_driver: string;
  sdoh_drivers: ShapDriver[];
  clinical_drivers: ShapDriver[];
  intervention_options: { driver: string; shap_formatted: string; category: string; intervention: string }[];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const API_BASE = 'http://127.0.0.1:8000/api';

const riskColors: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  Critical: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500' },
  High:     { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
  Moderate: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  Low:      { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', dot: 'bg-teal-500' },
  'Very Low': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
};

const getRiskStyle = (level: string) => riskColors[level] || { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', dot: 'bg-slate-400' };

const QUICK_ACTIONS = [
  { key: 'explain_risk',           label: 'Explain Risk',           icon: TrendingUp,  color: 'text-blue-600 border-blue-200 hover:bg-blue-50' },
  { key: 'explain_shap',           label: 'SHAP Drivers',           icon: Sparkles,    color: 'text-purple-600 border-purple-200 hover:bg-purple-50' },
  { key: 'clinical_assessment',    label: 'Clinical Assessment',    icon: Activity,    color: 'text-rose-600 border-rose-200 hover:bg-rose-50' },
  { key: 'sdoh_assessment',        label: 'SDOH Assessment',        icon: MapPin,      color: 'text-emerald-600 border-emerald-200 hover:bg-emerald-50' },
  { key: 'compare_tract',          label: 'Compare Tract vs CA',    icon: BarChart2,   color: 'text-cyan-600 border-cyan-200 hover:bg-cyan-50' },
  { key: 'intervention_suggestions', label: 'Interventions',        icon: ShieldAlert, color: 'text-orange-600 border-orange-200 hover:bg-orange-50' },
  { key: 'summarize_patient',      label: 'Summarize Patient',      icon: Brain,       color: 'text-indigo-600 border-indigo-200 hover:bg-indigo-50' },
] as const;

const LOADING_STEPS = [
  'Analyzing patient context...',
  'Reviewing risk drivers...',
  'Preparing explanation...',
];

const genId = () => Math.random().toString(36).slice(2, 9);

// ─── Message bubble ───────────────────────────────────────────────────────────

const MessageBubble: React.FC<{ msg: ChatMessage }> = ({ msg }) => {
  const isUser = msg.role === 'user';

  if (msg.isLoading) {
    return (
      <div className="flex items-start gap-3 animate-in slide-in-from-bottom-2">
        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0 shadow-sm">
          <Brain className="w-4 h-4 text-white" />
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm max-w-[85%]">
          <LoadingDots />
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex justify-end animate-in slide-in-from-bottom-2">
        <div className="bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-sm max-w-[82%]">
          <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
          <p className="text-[10px] text-blue-200 mt-1.5 text-right">
            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    );
  }

  // Format assistant response: bold **text**, headers, bullets
  const formatted = formatResponse(msg.content);

  return (
    <div className="flex items-start gap-3 animate-in slide-in-from-bottom-2">
      <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0 shadow-sm mt-0.5">
        <Brain className="w-4 h-4 text-white" />
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm max-w-[85%]">
        <div className="text-[13px] leading-relaxed text-slate-800 space-y-2">{formatted}</div>
        <p className="text-[10px] text-slate-400 mt-2">
          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · HealthMetrics AI
        </p>
      </div>
    </div>
  );
};

const LoadingDots: React.FC = () => (
  <div className="flex items-center gap-1.5 py-1">
    {[0, 1, 2].map(i => (
      <span
        key={i}
        className="w-2 h-2 rounded-full bg-blue-400 animate-bounce"
        style={{ animationDelay: `${i * 0.15}s` }}
      />
    ))}
  </div>
);

function formatResponse(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    if (!line.trim()) {
      elements.push(<div key={key++} className="h-1" />);
      continue;
    }
    // Section headers (===, ---, or ALL CAPS lines)
    if (/^={3,}|^-{3,}/.test(line.trim())) continue;
    if (/^[A-Z][A-Z\s:]+$/.test(line.trim()) && line.trim().length > 3) {
      elements.push(
        <p key={key++} className="font-extrabold text-[11px] uppercase tracking-wider text-blue-700 mt-3 mb-1">
          {line.trim()}
        </p>
      );
      continue;
    }
    // Bullet points
    if (/^[-•*]\s/.test(line.trim())) {
      elements.push(
        <div key={key++} className="flex gap-2">
          <span className="text-blue-500 shrink-0 mt-0.5">•</span>
          <span>{inlineBold(line.replace(/^[-•*]\s/, ''))}</span>
        </div>
      );
      continue;
    }
    // Numbered list
    if (/^\d+\.\s/.test(line.trim())) {
      const num = line.match(/^(\d+)\./)?.[1];
      elements.push(
        <div key={key++} className="flex gap-2">
          <span className="text-blue-600 font-bold shrink-0 w-4">{num}.</span>
          <span>{inlineBold(line.replace(/^\d+\.\s/, ''))}</span>
        </div>
      );
      continue;
    }
    elements.push(<p key={key++}>{inlineBold(line)}</p>);
  }
  return elements;
}

function inlineBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\*\*[^*]+\*\*$/.test(p)
          ? <strong key={i} className="font-bold text-slate-900">{p.slice(2, -2)}</strong>
          : p
      )}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const AIAssistant: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const patientId = searchParams.get('patient') || '';

  const [context, setContext] = useState<PatientContext | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [contextError, setContextError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const loadingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch patient context on mount ──
  useEffect(() => {
    if (!patientId) {
      setContextError('No patient selected. Please return to Members and click "Deep Understanding".');
      setContextLoading(false);
      return;
    }
    fetchContext();
  }, [patientId]);

  const fetchContext = async () => {
    setContextLoading(true);
    setContextError(null);
    try {
      const res = await fetch(`${API_BASE}/patients/${patientId}/ai-context/`).catch(() =>
        fetch(`/api/patients/${patientId}/ai-context/`)
      );
      if (!res.ok) throw new Error(`Patient not found (HTTP ${res.status})`);
      const data: PatientContext = await res.json();
      setContext(data);

      // Welcome message
      const risk = data.risk_5_level;
      const topDriver = data.sdoh_drivers?.[0]?.display_name || data.clinical_drivers?.[0]?.display_name || 'identified factors';
      setMessages([{
        id: genId(),
        role: 'assistant',
        content: `Hello! I'm the HealthMetrics Risk Understanding Assistant.\n\nI'm ready to help you understand **${data.name}**'s risk profile. This member is currently classified as **${risk} Future Risk** (5-Class CatBoost model, ${data.risk_5_confidence_pct} confidence).\n\nThe primary driver identified by the ML system is **${topDriver}**. I can explain the SHAP drivers, assess the SDOH and clinical factors, and help identify potential care-management considerations.\n\nUse the quick-action buttons below or ask me anything about this member.`,
        timestamp: new Date(),
      }]);
    } catch (err: any) {
      setContextError(err.message || 'Failed to load patient context.');
    } finally {
      setContextLoading(false);
    }
  };

  // ── Auto-scroll ──
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Loading step cycling ──
  const startLoadingAnimation = () => {
    setLoadingStep(0);
    let step = 0;
    loadingTimerRef.current = setInterval(() => {
      step = (step + 1) % LOADING_STEPS.length;
      setLoadingStep(step);
    }, 1200);
  };
  const stopLoadingAnimation = () => {
    if (loadingTimerRef.current) clearInterval(loadingTimerRef.current);
  };

  // ── Send message ──
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isSending || !patientId) return;

    const userMsg: ChatMessage = { id: genId(), role: 'user', content: text.trim(), timestamp: new Date() };
    const loadingMsg: ChatMessage = { id: genId(), role: 'assistant', content: '', timestamp: new Date(), isLoading: true };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setInputValue('');
    setIsSending(true);
    startLoadingAnimation();

    // Build history for the API (exclude the loading placeholder)
    const history = messages
      .filter(m => !m.isLoading)
      .map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch(`${API_BASE}/agent/chat/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: patientId, message: text.trim(), chat_history: history }),
      }).catch(() =>
        fetch('/api/agent/chat/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patient_id: patientId, message: text.trim(), chat_history: history }),
        })
      );

      const data = await res.json();
      const reply = data.response || data.error || 'I was unable to generate a response. Please try again.';

      setMessages(prev =>
        prev.map(m =>
          m.isLoading ? { ...m, content: reply, isLoading: false, timestamp: new Date() } : m
        )
      );
    } catch (err: any) {
      setMessages(prev =>
        prev.map(m =>
          m.isLoading
            ? { ...m, content: 'The AI assistant is temporarily unavailable. Please check the backend connection and try again.', isLoading: false, timestamp: new Date() }
            : m
        )
      );
    } finally {
      setIsSending(false);
      stopLoadingAnimation();
    }
  }, [isSending, patientId, messages]);

  // ── Quick action ──
  const handleQuickAction = async (actionKey: string) => {
    if (isSending) return;
    const action = QUICK_ACTIONS.find(a => a.key === actionKey);
    const label = action?.label || actionKey;

    const userMsg: ChatMessage = { id: genId(), role: 'user', content: label, timestamp: new Date() };
    const loadingMsg: ChatMessage = { id: genId(), role: 'assistant', content: '', timestamp: new Date(), isLoading: true };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setIsSending(true);
    startLoadingAnimation();

    try {
      const res = await fetch(`${API_BASE}/agent/quick-action/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: patientId, action: actionKey }),
      }).catch(() =>
        fetch('/api/agent/quick-action/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patient_id: patientId, action: actionKey }),
        })
      );

      const data = await res.json();
      const reply = data.response || data.error || 'I was unable to generate a response.';

      setMessages(prev =>
        prev.map(m => m.isLoading ? { ...m, content: reply, isLoading: false, timestamp: new Date() } : m)
      );
    } catch {
      setMessages(prev =>
        prev.map(m =>
          m.isLoading
            ? { ...m, content: 'The AI assistant is temporarily unavailable. Please try again.', isLoading: false, timestamp: new Date() }
            : m
        )
      );
    } finally {
      setIsSending(false);
      stopLoadingAnimation();
    }
  };

  // ── Keyboard handler ──
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  };

  const riskStyle = context ? getRiskStyle(context.risk_5_level) : null;

  // ─── RENDER ───────────────────────────────────────────────────────────────

  if (contextLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg animate-pulse">
          <Brain className="w-6 h-6 text-white" />
        </div>
        <p className="text-[14px] font-semibold text-slate-600">Loading patient intelligence context...</p>
      </div>
    );
  }

  if (contextError) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4 p-8">
        <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-red-600" />
        </div>
        <div className="text-center">
          <p className="text-[15px] font-bold text-slate-800 mb-1">Unable to Load Patient Context</p>
          <p className="text-[13px] text-slate-500 max-w-sm">{contextError}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate('/members')} className="px-4 py-2 border border-slate-200 text-slate-700 text-[13px] font-semibold rounded-lg hover:bg-slate-50 cursor-pointer flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to Members
          </button>
          <button onClick={fetchContext} className="px-4 py-2 bg-blue-600 text-white text-[13px] font-semibold rounded-lg hover:bg-blue-700 cursor-pointer flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] gap-0 -mt-2">

      {/* ── Page Header ── */}
      <div className="shrink-0 flex items-center justify-between px-1 pb-3">
        <button
          onClick={() => navigate('/members')}
          className="flex items-center gap-2 text-[13px] font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Members
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-blue-600 flex items-center justify-center">
            <Brain className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-[13px] font-extrabold text-slate-800 uppercase tracking-wide">Patient Risk Understanding Assistant</span>
          <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-bold border border-blue-200">AI · LangChain</span>
        </div>
      </div>

      {/* ── Patient Context Card ── */}
      {context && (
        <div className="shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-3.5 mb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center border border-blue-200">
                <User className="w-4.5 h-4.5 text-blue-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-extrabold text-slate-900">{context.name}</span>
                  {riskStyle && (
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${riskStyle.bg} ${riskStyle.text} ${riskStyle.border} flex items-center gap-1`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${riskStyle.dot}`} />
                      {context.risk_5_level}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] font-mono text-blue-600 font-bold">{context.patient_id}</span>
                  <span className="text-[11px] text-slate-400">·</span>
                  <span className="text-[11px] text-slate-500">{context.gender}</span>
                  <span className="text-[11px] text-slate-400">·</span>
                  <span className="text-[11px] text-slate-500 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />{context.county}
                  </span>
                </div>
              </div>
            </div>

            {/* Risk mini-cards */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-center px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">5-Class Risk</p>
                <p className={`text-[13px] font-extrabold ${riskStyle?.text || 'text-slate-700'}`}>{context.risk_5_level}</p>
                <p className="text-[9px] text-slate-400">{context.risk_5_confidence_pct}</p>
              </div>
              <div className="text-center px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">3-Class Risk</p>
                <p className="text-[13px] font-extrabold text-slate-700">{context.risk_3_level}</p>
                <p className="text-[9px] text-slate-400">{context.risk_3_confidence_pct}</p>
              </div>
              <div className="text-center px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Driver Type</p>
                <p className="text-[13px] font-extrabold text-slate-700">{context.driver_type}</p>
              </div>
              <div className="text-center px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-100 max-w-[140px]">
                <p className="text-[9px] font-bold text-blue-500 uppercase tracking-wider">Primary Driver</p>
                <p className="text-[11px] font-bold text-blue-700 leading-tight">{context.primary_driver?.split('(')[0].trim()}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Chat + Quick Actions column ── */}
      <div className="flex-1 flex flex-col min-h-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

        {/* Quick Action Buttons */}
        <div className="shrink-0 px-4 pt-3 pb-2 border-b border-slate-100 flex flex-wrap gap-2">
          {QUICK_ACTIONS.map(action => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                onClick={() => handleQuickAction(action.key)}
                disabled={isSending}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50 ${action.color}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {action.label}
              </button>
            );
          })}
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-slate-50/30 custom-scrollbar">
          {messages.map(msg => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Loading step indicator */}
        {isSending && (
          <div className="shrink-0 px-5 py-1.5 bg-blue-50 border-t border-blue-100">
            <p className="text-[11px] font-semibold text-blue-600 flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              {LOADING_STEPS[loadingStep]}
            </p>
          </div>
        )}

        {/* Input Area */}
        <div className="shrink-0 border-t border-slate-200 px-4 py-3 bg-white">
          <div className="flex items-end gap-3">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about this member... (Enter to send, Shift+Enter for new line)"
              rows={2}
              disabled={isSending}
              className="flex-1 resize-none rounded-xl border border-slate-200 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200 px-4 py-2.5 text-[13px] text-slate-800 placeholder:text-slate-400 bg-white disabled:opacity-60 transition-all custom-scrollbar"
            />
            <button
              onClick={() => sendMessage(inputValue)}
              disabled={!inputValue.trim() || isSending}
              className="w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
            >
              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5 px-1">
            AI explains existing ML predictions only · Does not recalculate risk or SHAP · Not medical advice
          </p>
        </div>
      </div>
    </div>
  );
};

export default AIAssistant;
