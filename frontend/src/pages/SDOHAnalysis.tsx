import React, { useState, useEffect, useRef } from 'react';
import { 
  BarChart3, 
  Maximize2, 
  Minimize2,
  Settings2, 
  ExternalLink,
  RotateCcw,
  Sparkles,
  Info
} from 'lucide-react';

const DEFAULT_POWERBI_URL = "https://app.powerbi.com/reportEmbed?reportId=35db6382-8163-4965-afc5-f908a616217b&autoAuth=true&ctid=28f17ad2-29c7-482d-9410-3e5029bb9b0d";
const REPORT_TITLE = "sdohrsik2";

const SDOHAnalysis: React.FC = () => {
  // Power BI Embed URL state (initialized with user's Power BI report)
  const [embedUrl, setEmbedUrl] = useState<string>(DEFAULT_POWERBI_URL);
  const [tempUrl, setTempUrl] = useState<string>(DEFAULT_POWERBI_URL);
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isIframeLoading, setIsIframeLoading] = useState<boolean>(true);

  const dashboardContainerRef = useRef<HTMLDivElement>(null);

  // Sync fullscreen state with native browser Fullscreen API
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFull = Boolean(
        document.fullscreenElement || 
        (document as any).webkitFullscreenElement || 
        (document as any).mozFullScreenElement || 
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isFull);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // Safe timeout for loading state in case iframe doesn't trigger onLoad
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsIframeLoading(false);
    }, 4000);
    return () => clearTimeout(timer);
  }, [embedUrl]);

  // Native Fullscreen Toggle
  const toggleFullscreen = async () => {
    const elem = dashboardContainerRef.current;
    if (!elem) return;

    const isCurrentlyFullscreen = Boolean(
      document.fullscreenElement || 
      (document as any).webkitFullscreenElement || 
      (document as any).mozFullScreenElement || 
      (document as any).msFullscreenElement
    );

    try {
      if (!isCurrentlyFullscreen) {
        if (elem.requestFullscreen) {
          await elem.requestFullscreen();
        } else if ((elem as any).webkitRequestFullscreen) {
          await (elem as any).webkitRequestFullscreen();
        } else if ((elem as any).mozRequestFullScreen) {
          await (elem as any).mozRequestFullScreen();
        } else if ((elem as any).msRequestFullscreen) {
          await (elem as any).msRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          await (document as any).mozCancelFullScreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
      }
    } catch (err) {
      console.error('Fullscreen toggle failed, using fallback:', err);
      setIsFullscreen(!isFullscreen);
    }
  };

  // Helper to extract clean URL if an entire <iframe> code snippet is pasted
  const parseEmbedInput = (input: string): string => {
    const trimmed = input.trim();
    const iframeSrcMatch = trimmed.match(/src=["']([^"']+)["']/i);
    if (iframeSrcMatch && iframeSrcMatch[1]) {
      return iframeSrcMatch[1];
    }
    return trimmed;
  };

  const handleSaveEmbedUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseEmbedInput(tempUrl);
    setEmbedUrl(parsed);
    setIsIframeLoading(true);
    setIsConfigOpen(false);
  };

  const handleResetToDefault = () => {
    setTempUrl(DEFAULT_POWERBI_URL);
    setEmbedUrl(DEFAULT_POWERBI_URL);
    setIsIframeLoading(true);
    setIsConfigOpen(false);
  };

  return (
    <div className="flex flex-col gap-6 w-full flex-1 min-h-[calc(100vh-140px)]">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 border border-amber-500/20">
              <Sparkles className="w-3.5 h-3.5" />
              Power BI Integrated
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
              Live Connection
            </span>
          </div>
          <h2 className="text-2xl font-bold text-on-surface">Community SDOH Analysis & Intelligence</h2>
          <p className="text-[13px] text-on-surface-variant font-medium mt-1">
            Interactive Microsoft Power BI population health reporting &amp; socioeconomic intelligence dashboard.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {embedUrl && (
            <a
              href={embedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-[12px] rounded-lg shadow-sm transition-all"
              title="Open Power BI report in new browser window"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              <span>Open Power BI</span>
            </a>
          )}
          <button
            onClick={() => {
              setTempUrl(embedUrl);
              setIsConfigOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-primary font-bold text-[12px] rounded-lg shadow-sm transition-all cursor-pointer"
          >
            <Settings2 className="w-4 h-4" />
            <span>Configure Report Embed</span>
          </button>
        </div>
      </div>

      {/* Power BI Dashboard Main Embed Card - Native Fullscreen Support */}
      <section 
        ref={dashboardContainerRef}
        className={`w-full overflow-hidden flex flex-col transition-none ${
          isFullscreen 
            ? 'h-screen w-screen bg-slate-900 rounded-none border-0' 
            : 'bg-white rounded-2xl border border-slate-200/90 shadow-md flex-1 min-h-[720px] h-[calc(100vh-210px)]'
        }`}
      >
        {/* Card Header Bar */}
        <div className={`p-3.5 flex justify-between items-center shrink-0 border-b ${
          isFullscreen 
            ? 'bg-slate-900 border-slate-800 text-white' 
            : 'bg-slate-50/90 border-slate-200 text-slate-900'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center font-black text-xs shadow-sm shrink-0">
              PBI
            </div>
            <div>
              <h3 className={`text-sm font-bold flex items-center gap-2 ${isFullscreen ? 'text-white' : 'text-slate-900'}`}>
                <span>Power BI Report:</span>
                <span className="font-mono text-primary font-semibold">{REPORT_TITLE}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  Live Embed
                </span>
              </h3>
              <p className={`text-[11px] ${isFullscreen ? 'text-slate-400' : 'text-slate-500'}`}>
                Interactive population health metrics, socioeconomic vulnerability analysis, and geographic risk indicators
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {embedUrl && (
              <a 
                href={embedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`p-2 rounded-lg transition-colors cursor-pointer ${
                  isFullscreen 
                    ? 'hover:bg-slate-800 text-slate-300 hover:text-white' 
                    : 'hover:bg-slate-200/70 text-slate-600'
                }`}
                title="Open in new tab"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button 
              onClick={toggleFullscreen}
              className={`p-2 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${
                isFullscreen 
                  ? 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700' 
                  : 'hover:bg-slate-200/70 text-slate-700 border border-slate-200/60'
              }`}
              title={isFullscreen ? "Exit Fullscreen (Esc)" : "Fullscreen"}
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="w-4 h-4 text-amber-400" />
                  <span className="hidden sm:inline">Exit Fullscreen</span>
                  <kbd className="hidden sm:inline px-1 py-0.2 text-[10px] bg-slate-700 rounded-xs text-slate-300 font-mono">Esc</kbd>
                </>
              ) : (
                <>
                  <Maximize2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Fullscreen</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Power BI Embed Frame Body */}
        <div className={`w-full bg-slate-900 relative flex flex-col flex-1 ${isFullscreen ? 'h-[calc(100vh-56px)]' : 'h-full min-h-[640px]'}`}>
          {isIframeLoading && (
            <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-xs flex flex-col items-center justify-center gap-3 text-white z-10 pointer-events-none transition-opacity">
              <div className="relative">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center animate-pulse">
                  <BarChart3 className="w-6 h-6 text-amber-400" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-slate-200">Connecting to Microsoft Power BI Report...</p>
                <p className="text-xs text-slate-400 mt-1">Loading report visualizer &amp; dataset filters</p>
              </div>
            </div>
          )}

          {embedUrl ? (
            <iframe 
              src={embedUrl}
              title={REPORT_TITLE}
              className="w-full h-full border-0 bg-white"
              allowFullScreen={true}
              onLoad={() => setIsIframeLoading(false)}
            />
          ) : (
            <div className="p-8 flex flex-col items-center justify-center gap-4 text-center h-full bg-slate-50">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center font-bold">
                <BarChart3 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-800">No Power BI URL Configured</h4>
                <p className="text-xs text-slate-500 max-w-md mt-1">
                  Connect your live Power BI report embed link to render rich interactive population dashboards.
                </p>
              </div>
              <button
                onClick={() => {
                  setTempUrl(DEFAULT_POWERBI_URL);
                  setIsConfigOpen(true);
                }}
                className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg shadow-sm hover:bg-primary-hover transition-colors"
              >
                Set Power BI URL
              </button>
            </div>
          )}
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
                <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center text-xs font-bold">
                  PBI
                </div>
                <span>Configure Power BI Embed</span>
              </h3>
              <button 
                onClick={() => setIsConfigOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEmbedUrl} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Power BI Report Embed URL or &lt;iframe&gt; Code
                </label>
                <textarea
                  rows={3}
                  placeholder="Paste URL or full <iframe> code here..."
                  value={tempUrl}
                  onChange={(e) => setTempUrl(e.target.value)}
                  className="w-full text-xs font-mono border border-slate-200 rounded-lg p-3 bg-slate-50 focus:bg-white focus:outline-none focus:border-primary outline-none custom-scrollbar"
                />
                <div className="flex items-start gap-1.5 text-[11px] text-slate-500 mt-2">
                  <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span>
                    Accepts direct Power BI report URLs or copied <code>&lt;iframe&gt;</code> HTML embed code snippets.
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleResetToDefault}
                  className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Default</span>
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsConfigOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-bold text-white bg-primary hover:bg-primary-hover rounded-lg transition-colors shadow-sm cursor-pointer"
                  >
                    Save &amp; Embed
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SDOHAnalysis;

