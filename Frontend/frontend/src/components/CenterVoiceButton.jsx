import React from 'react';
import { Mic, Square, ArrowRight, Loader2, Volume2, RefreshCw, RotateCcw } from 'lucide-react';
import { STATES } from '../state/machine.js';

/**
 * CenterVoiceButton & Secondary Actions
 * - Large circular center button (min 160px)
 * - Changes icon and label dynamically by state: Start, Listening, Stop, Continue, Retry
 * - Slow pulse ring only during listening state
 * - Two secondary buttons underneath (min 56px high, full-width on mobile): Repeat Answer and New Scan
 */
export function CenterVoiceButton({
  status,
  hasAnswer,
  isSpeaking,
  onCenterPress,
  onRepeatAnswer,
  onNewScan,
}) {
  let label = 'Start';
  let Icon = Mic;
  let isListeningState = status === STATES.LISTENING;
  let isProcessingState = status === STATES.PROCESSING || status === STATES.CAPTURE;

  if (isSpeaking) {
    label = 'Stop';
    Icon = Square;
  } else {
    switch (status) {
      case STATES.STANDBY:
        label = 'Start';
        Icon = Mic;
        break;
      case STATES.READY:
        label = 'Speak';
        Icon = Mic;
        break;
      case STATES.LISTENING:
        label = 'Listening';
        Icon = Mic;
        break;
      case STATES.CAPTURE:
      case STATES.PROCESSING:
        label = 'Thinking';
        Icon = Loader2;
        break;
      case STATES.ANSWER:
        label = 'Stop';
        Icon = Square;
        break;
      case STATES.WAITING:
        label = 'Continue';
        Icon = ArrowRight;
        break;
      case STATES.NEXT_ACTION:
        label = 'Follow-up';
        Icon = Mic;
        break;
      case STATES.ERROR:
        label = 'Retry';
        Icon = RotateCcw;
        break;
      default:
        label = 'Start';
        Icon = Mic;
    }
  }

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center gap-4 px-4 pb-2 pt-1 select-none">
      {/* Huge Circular Center Button (Min 160px) */}
      <div className="relative flex items-center justify-center">
        {/* Slow Pulse Ring during Listening state only */}
        {isListeningState && (
          <span
            className="absolute w-44 h-44 rounded-full bg-blue-500/25 dark:bg-blue-400/20 animate-pulse-slow pointer-events-none"
            aria-hidden="true"
          />
        )}

        <button
          type="button"
          onClick={onCenterPress}
          className={`relative z-10 w-40 h-40 sm:w-44 sm:h-44 rounded-full flex flex-col items-center justify-center gap-2 text-white font-bold tracking-wide transition-colors duration-150 shadow-md cursor-pointer ${
            label === 'Stop'
              ? 'bg-rose-700 hover:bg-rose-800 active:bg-rose-900 focus-visible:ring-4 focus-visible:ring-rose-400'
              : 'bg-blue-800 hover:bg-blue-900 active:bg-blue-950 dark:bg-blue-700 dark:hover:bg-blue-800 focus-visible:ring-4 focus-visible:ring-blue-400'
          }`}
          aria-label={`${label} action button`}
          disabled={isProcessingState}
        >
          <Icon
            size={40}
            strokeWidth={2}
            className={isProcessingState ? 'animate-spin' : ''}
            aria-hidden="true"
          />
          <span className="text-lg sm:text-xl font-bold">{label}</span>
        </button>
      </div>

      {/* Two Secondary Action Buttons (Min 56px high, full-width on mobile) */}
      <div className="w-full grid grid-cols-2 gap-3 mt-1">
        <button
          type="button"
          onClick={onRepeatAnswer}
          disabled={!hasAnswer}
          className="min-h-[56px] px-4 py-3 rounded-xl border-2 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#161C26] text-zinc-900 dark:text-zinc-100 font-bold text-base flex items-center justify-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-xs transition-colors"
          aria-label="Repeat last answer aloud"
        >
          <Volume2 size={20} strokeWidth={2} aria-hidden="true" />
          <span>Repeat</span>
        </button>

        <button
          type="button"
          onClick={onNewScan}
          className="min-h-[56px] px-4 py-3 rounded-xl border-2 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#161C26] text-zinc-900 dark:text-zinc-100 font-bold text-base flex items-center justify-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer shadow-xs transition-colors"
          aria-label="Start new photo scan"
        >
          <RefreshCw size={20} strokeWidth={2} aria-hidden="true" />
          <span>New Scan</span>
        </button>
      </div>
    </div>
  );
}
