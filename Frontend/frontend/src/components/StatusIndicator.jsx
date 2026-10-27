import React from 'react';
import { STATES } from '../state/machine.js';

/**
 * Status indicator pill displaying the current state machine state.
 * Uses text plus a distinct shape/dot (never color alone) for WCAG AAA accessibility.
 */
export function StatusIndicator({ status }) {
  let label = 'Standby';
  let dotClass = 'bg-zinc-400 dark:bg-zinc-500';
  let badgeBorder = 'border-zinc-300 dark:border-zinc-700';

  switch (status) {
    case STATES.STANDBY:
      label = 'Standby';
      dotClass = 'bg-zinc-400 dark:bg-zinc-500';
      break;
    case STATES.READY:
      label = 'Ready';
      dotClass = 'bg-blue-600 dark:bg-blue-400';
      badgeBorder = 'border-blue-400 dark:border-blue-600';
      break;
    case STATES.LISTENING:
      label = 'Listening';
      dotClass = 'bg-blue-700 dark:bg-blue-400 animate-ping';
      badgeBorder = 'border-blue-600 dark:border-blue-400';
      break;
    case STATES.CAPTURE:
      label = 'Capturing';
      dotClass = 'bg-amber-600 dark:bg-amber-400';
      badgeBorder = 'border-amber-500 dark:border-amber-500';
      break;
    case STATES.PROCESSING:
      label = 'Thinking';
      dotClass = 'bg-blue-600 dark:bg-blue-400 animate-pulse';
      badgeBorder = 'border-blue-500 dark:border-blue-400';
      break;
    case STATES.ANSWER:
      label = 'Answer';
      dotClass = 'bg-emerald-600 dark:bg-emerald-400';
      badgeBorder = 'border-emerald-500 dark:border-emerald-500';
      break;
    case STATES.WAITING:
      label = 'Waiting';
      dotClass = 'bg-blue-600 dark:bg-blue-400';
      badgeBorder = 'border-blue-400 dark:border-blue-600';
      break;
    case STATES.NEXT_ACTION:
      label = 'Next Action';
      dotClass = 'bg-blue-600 dark:bg-blue-400';
      badgeBorder = 'border-blue-400 dark:border-blue-600';
      break;
    case STATES.ERROR:
      label = 'Attention';
      dotClass = 'bg-rose-600 dark:bg-rose-400';
      badgeBorder = 'border-rose-500 dark:border-rose-500';
      break;
    default:
      label = 'Starting';
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${badgeBorder} bg-white dark:bg-[#161C26] text-xs sm:text-sm font-semibold tracking-wide text-zinc-900 dark:text-zinc-100 shadow-xs`}
    >
      <span className="relative flex h-2 w-2" aria-hidden="true">
        <span className={`inline-flex rounded-full h-2 w-2 ${dotClass}`} />
      </span>
      <span>{label}</span>
    </div>
  );
}
