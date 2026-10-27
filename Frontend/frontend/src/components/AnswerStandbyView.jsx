import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, RefreshCw, Mic } from 'lucide-react';
import { FLOW_STATES, WAKE_PHRASE } from '../state/machine.js';
import { triggerHaptic } from '../utils/sound.js';

/**
 * AnswerStandbyView Component
 * - Shows the question in a chat bubble
 * - Displays the answer with synchronized typewriter reveal
 * - Calm breathing orb in STANDBY listening for "Hey mate" or tap
 * - Fallback messages for restarts >= 3 and unsupported SpeechRecognition
 * - Action buttons for New Scan and Repeat Answer
 */
export function AnswerStandbyView({
  question,
  fullAnswer,
  isSpeaking,
  status,
  imagePreviewUrl,
  isListeningWake = false,
  wakeError = null,
  restartCount = 0,
  isSupported = true,
  onNewScan,
  onRepeat,
  onStop,
  onManualWake,
}) {
  const [displayedAnswer, setDisplayedAnswer] = useState(() => (
    status === FLOW_STATES.STANDBY ? fullAnswer : ''
  ));
  const typewriterTimerRef = useRef(null);

  // Typewriter effect synchronized with spoken answer
  useEffect(() => {
    if (!fullAnswer || status === FLOW_STATES.STANDBY) {
      return;
    }

    let index = 0;
    const speed = Math.max(16, Math.min(38, Math.round(5000 / fullAnswer.length)));

    if (typewriterTimerRef.current) clearInterval(typewriterTimerRef.current);

    typewriterTimerRef.current = setInterval(() => {
      index += 2;
      if (index <= fullAnswer.length) {
        setDisplayedAnswer(fullAnswer.slice(0, index));
      } else {
        setDisplayedAnswer(fullAnswer);
        clearInterval(typewriterTimerRef.current);
      }
    }, speed);

    return () => {
      if (typewriterTimerRef.current) clearInterval(typewriterTimerRef.current);
    };
  }, [fullAnswer, status]);

  const isStandby = status === FLOW_STATES.STANDBY;

  const handleOrbClick = (e) => {
    e.stopPropagation();
    triggerHaptic(40);
    onManualWake();
  };

  return (
    <div
      className="flex-1 w-full flex flex-col justify-between p-4 max-w-md mx-auto overflow-y-auto"
      role="region"
      aria-label="Answer and Standby"
    >
      {/* 1. Header with Image Thumbnail & Status */}
      <div className="w-full flex items-center justify-between pb-2 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          {imagePreviewUrl && (
            <img
              src={imagePreviewUrl}
              alt="Analyzed thumbnail"
              className="w-8 h-8 rounded-lg object-cover border border-cyan-400/40"
            />
          )}
          <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
            VisionMate AI
          </span>
        </div>

        {/* Header Status Badge */}
        {isSpeaking ? (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-400/30 flex items-center gap-1.5 animate-pulse">
            <Volume2 size={12} />
            <span>Speaking...</span>
          </span>
        ) : (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300">
            Standby Mode
          </span>
        )}
      </div>

      {/* 2. Question Chat Bubble & Typewriter Answer */}
      <div className="flex flex-col gap-4 my-auto py-3">
        {/* User's Question Bubble */}
        {question && (
          <div className="self-end max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-xs bg-blue-600 text-white font-medium text-base shadow-sm">
            <span className="text-[11px] block uppercase font-bold text-blue-200">You Asked</span>
            <p className="mt-0.5">{question}</p>
          </div>
        )}

        {/* AI Answer with Typewriter Reveal */}
        <div
          className="w-full p-5 rounded-2xl bg-zinc-900/90 border border-zinc-700/80 shadow-md flex flex-col gap-3"
          role="region"
          aria-live="polite"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider uppercase text-zinc-400">
              Answer
            </span>
            {isSpeaking && (
              <button
                type="button"
                onClick={onStop}
                className="text-xs font-bold text-rose-400 flex items-center gap-1 hover:underline py-1 px-2 cursor-pointer"
                aria-label="Stop reading answer aloud"
              >
                <VolumeX size={14} />
                <span>Stop</span>
              </button>
            )}
          </div>

          <p className="text-xl sm:text-2xl font-bold leading-relaxed text-white select-text">
            {displayedAnswer}
            {!isStandby && displayedAnswer.length < fullAnswer?.length && (
              <span className="inline-block w-2 h-5 ml-1 bg-cyan-400 animate-pulse" aria-hidden="true" />
            )}
          </p>
        </div>
      </div>

      {/* 3. Bottom Standby Area: Calm Breathing Orb & Actions */}
      <div className="w-full flex flex-col items-center gap-4 pt-2">
        {/* Breathing Orb & Wake Hint */}
        <div
          onClick={handleOrbClick}
          className="flex flex-col items-center gap-2.5 cursor-pointer group select-none active:scale-95 transition-transform"
          role="button"
          tabIndex={0}
          aria-label={`Wake phrase active. Say ${WAKE_PHRASE} or tap here to speak.`}
        >
          <div className="relative flex items-center justify-center">
            {/* Ambient Pulse Ring */}
            <span className="absolute w-24 h-24 rounded-full bg-cyan-500/15 animate-ping pointer-events-none" />
            <span className="absolute w-20 h-20 rounded-full bg-blue-600/25 animate-orb-breathe pointer-events-none" />

            {/* Glowing Orb Button */}
            <div className="relative z-10 w-16 h-16 rounded-full flex items-center justify-center bg-gradient-to-tr from-blue-900 to-cyan-500 border-2 border-cyan-400/50 shadow-[0_0_30px_rgba(56,189,248,0.45)] group-hover:scale-105 transition-transform">
              <Mic size={26} className="text-white drop-shadow-sm" aria-hidden="true" />
            </div>
          </div>

          <div className="flex flex-col items-center gap-1 text-center px-4">
            {!isSupported ? (
              <span className="text-xs font-semibold text-amber-300">
                Voice wake not supported in this browser, tap the orb
              </span>
            ) : restartCount >= 3 || wakeError === 'permission-denied' ? (
              <span className="text-xs font-semibold text-amber-300">
                Voice wake not available, tap the orb
              </span>
            ) : (
              <p className="text-sm sm:text-base font-semibold text-zinc-300">
                Say <strong className="text-cyan-400">&ldquo;{WAKE_PHRASE}&rdquo;</strong> or tap
              </p>
            )}
          </div>
        </div>

        {/* Secondary Action Buttons */}
        <div className="w-full grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={onRepeat}
            disabled={isSpeaking}
            className="min-h-[52px] px-4 py-3 rounded-xl bg-zinc-850 hover:bg-zinc-800 text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2 border border-zinc-700/80 shadow-sm cursor-pointer disabled:opacity-50 active:scale-98 transition-transform"
            aria-label="Repeat answer aloud"
          >
            <Volume2 size={18} className="text-cyan-400" />
            <span>Repeat</span>
          </button>

          <button
            type="button"
            onClick={onNewScan}
            className="min-h-[52px] px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-md cursor-pointer active:scale-98 transition-transform"
            aria-label="Start new scan"
          >
            <RefreshCw size={18} />
            <span>New Scan</span>
          </button>
        </div>
      </div>
    </div>
  );
}
