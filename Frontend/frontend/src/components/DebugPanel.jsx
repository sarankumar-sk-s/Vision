import React, { useState, useEffect, useRef } from 'react';
import { debugLogger } from '../services/debugLogger.js';
import { setRecognitionLang } from '../services/speechRecognition.js';
import { ChevronUp, ChevronDown, Trash2, Globe, Radio } from 'lucide-react';

/**
 * DebugPanel Component
 * Shown only when ?debug=1 is in URL.
 * Displays live:
 * - App State, Rec Status, Rec Mode, SpeechSynth, MediaStreams, Restarts
 * - Live scrollable event stream with timestamps
 * - Lang switcher ('en-US' / 'en-IN')
 */
export function DebugPanel() {
  const [debugState, setDebugState] = useState(debugLogger.state);
  const [logs, setLogs] = useState(debugLogger.logs);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEnabled, setIsEnabled] = useState(false);
  const logsContainerRef = useRef(null);

  useEffect(() => {
    setIsEnabled(debugLogger.isDebugEnabled());

    const unsubscribe = debugLogger.subscribe((newState, newLogs) => {
      setDebugState(newState);
      setLogs([...newLogs]);
    });

    return () => unsubscribe();
  }, []);

  if (!isEnabled) return null;

  const toggleLang = () => {
    const nextLang = debugState.recLang === 'en-US' ? 'en-IN' : 'en-US';
    setRecognitionLang(nextLang);
    debugLogger.updateState({ recLang: nextLang });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'running':
        return 'text-emerald-400 bg-emerald-950/80 border-emerald-500/50';
      case 'starting':
      case 'restarting':
        return 'text-amber-400 bg-amber-950/80 border-amber-500/50';
      case 'stopping':
        return 'text-rose-400 bg-rose-950/80 border-rose-500/50';
      default:
        return 'text-zinc-400 bg-zinc-800/80 border-zinc-700';
    }
  };

  const getEventBadge = (type) => {
    if (type.includes('error')) return 'bg-rose-900/70 text-rose-300';
    if (type.includes('wake_matched')) return 'bg-cyan-900/80 text-cyan-300 font-bold';
    if (type.includes('result')) return 'bg-blue-900/70 text-blue-300';
    if (type.includes('restart') || type.includes('watchdog')) return 'bg-amber-900/70 text-amber-300';
    if (type.includes('speech')) return 'bg-purple-900/70 text-purple-300';
    return 'bg-zinc-800 text-zinc-300';
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[999] bg-[#070B12]/95 border-t border-cyan-500/40 text-xs font-mono shadow-2xl backdrop-blur-md transition-all select-text"
      style={{ maxHeight: isExpanded ? '46vh' : '44px' }}
    >
      {/* Top Header Bar */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between px-3 py-2 bg-zinc-900/90 border-b border-zinc-800 cursor-pointer select-none"
      >
        <div className="flex items-center gap-2 overflow-x-auto py-0.5 scrollbar-none">
          <span className="flex items-center gap-1 font-bold text-cyan-400 shrink-0">
            <Radio size={13} className="animate-pulse" />
            DEBUG PANEL
          </span>

          {/* App State */}
          <span className="px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-white font-semibold shrink-0">
            App: <strong className="text-cyan-300">{debugState.appState}</strong>
          </span>

          {/* Rec Status */}
          <span
            className={`px-2 py-0.5 rounded-full border font-semibold shrink-0 ${getStatusColor(
              debugState.recStatus
            )}`}
          >
            Rec: <strong>{debugState.recStatus}</strong> ({debugState.recMode})
          </span>

          {/* SpeechSynth Status */}
          <span
            className={`px-2 py-0.5 rounded-full border shrink-0 ${
              debugState.speechSynthSpeaking
                ? 'bg-purple-950/80 border-purple-500/50 text-purple-300 font-bold animate-pulse'
                : 'bg-zinc-850 border-zinc-700 text-zinc-400'
            }`}
          >
            TTS: {debugState.speechSynthSpeaking ? 'SPEAKING' : 'idle'}
          </span>

          {/* Streams */}
          <span
            className={`px-2 py-0.5 rounded-full border shrink-0 ${
              debugState.activeMediaStreams > 0
                ? 'bg-amber-950/80 border-amber-500/50 text-amber-300'
                : 'bg-zinc-850 border-zinc-700 text-zinc-400'
            }`}
          >
            Streams: {debugState.activeMediaStreams}
          </span>

          {/* Restarts */}
          <span className="px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 shrink-0">
            Restarts: <strong>{debugState.restartCount}</strong>
          </span>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleLang();
            }}
            className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-cyan-300 border border-cyan-500/30 flex items-center gap-1"
            title="Toggle Recognition Language"
          >
            <Globe size={11} />
            <span>{debugState.recLang}</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              debugLogger.clearLogs();
            }}
            className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white"
            title="Clear logs"
          >
            <Trash2 size={12} />
          </button>

          <button
            type="button"
            className="p-1 text-zinc-400 hover:text-white"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {/* Expanded Log Timeline */}
      {isExpanded && (
        <div
          ref={logsContainerRef}
          className="p-2 overflow-y-auto font-mono text-[11px] space-y-1"
          style={{ height: 'calc(46vh - 44px)' }}
        >
          {logs.length === 0 ? (
            <div className="text-zinc-500 italic text-center py-4">
              Listening for events... Speak "Hey mate" to test.
            </div>
          ) : (
            logs.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-1.5 leading-tight py-0.5 border-b border-zinc-800/60"
              >
                <span className="text-zinc-500 shrink-0 select-none font-sans text-[10px]">
                  {item.time}
                </span>

                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-bold shrink-0 ${getEventBadge(
                    item.type
                  )}`}
                >
                  {item.type}
                </span>

                <div className="text-zinc-200 break-all select-text flex-1">
                  {typeof item.data === 'string'
                    ? item.data
                    : Object.entries(item.data || {}).map(([key, val]) => (
                        <span key={key} className="mr-2">
                          <span className="text-zinc-400">{key}: </span>
                          <span className="text-cyan-300 font-semibold">
                            {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                          </span>
                        </span>
                      ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
