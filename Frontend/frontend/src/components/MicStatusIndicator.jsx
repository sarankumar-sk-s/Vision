import React from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * MicStatusIndicator Component
 * Displays the 7 microphone recognition states accurately:
 * 1. Ready - microphone is not currently listening
 * 2. Requesting microphone permission - permission is being requested
 * 3. Listening… - recognition has actually started
 * 4. Hearing your voice… - speech activity has been detected by browser
 * 5. Recognized text - show words detected from microphone
 * 6. Processing - final transcript is being handled
 * 7. Error - useful error message with retry affordance
 */
export function MicStatusIndicator({
  micStatus = { state: 'ready', message: '', transcript: '' },
  currentLang = 'en',
  onRetry = null,
  className = '',
}) {
  const isTa = currentLang === 'ta';
  const state = micStatus?.state || 'ready';
  const message = micStatus?.message || '';
  const transcript = micStatus?.transcript || '';

  let dotColor = 'bg-zinc-400';
  let dotAnimation = '';
  let badgeBorder = 'border-zinc-700/80';
  let badgeBg = 'bg-zinc-900/90';
  let textColor = 'text-zinc-300';
  let label = isTa ? 'தயாராக உள்ளது' : 'Ready';

  switch (state) {
    case 'requesting_permission':
      dotColor = 'bg-amber-400';
      dotAnimation = 'animate-ping';
      badgeBorder = 'border-amber-500/50';
      badgeBg = 'bg-amber-950/80';
      textColor = 'text-amber-200';
      label = message || (isTa ? 'அனுமதி கேட்கப்படுகிறது…' : 'Requesting microphone permission…');
      break;

    case 'listening':
      dotColor = 'bg-cyan-400';
      dotAnimation = 'animate-ping';
      badgeBorder = 'border-cyan-400/50';
      badgeBg = 'bg-cyan-950/80';
      textColor = 'text-cyan-200';
      label = isTa ? 'கேட்கிறது…' : 'Listening…';
      break;

    case 'hearing_voice':
      dotColor = 'bg-emerald-400';
      dotAnimation = 'animate-pulse';
      badgeBorder = 'border-emerald-400/50';
      badgeBg = 'bg-emerald-950/80';
      textColor = 'text-emerald-200';
      label = isTa ? 'குரல் கேட்கிறது…' : 'Hearing your voice…';
      break;

    case 'recognized':
      dotColor = 'bg-blue-400';
      dotAnimation = '';
      badgeBorder = 'border-blue-400/60';
      badgeBg = 'bg-blue-950/80';
      textColor = 'text-blue-100';
      label = transcript
        ? (isTa ? `அறியப்பட்டது: "${transcript}"` : `Recognized: "${transcript}"`)
        : (isTa ? 'அறியப்பட்ட உரை' : 'Recognized text');
      break;

    case 'processing':
      dotColor = 'bg-purple-400';
      dotAnimation = 'animate-pulse';
      badgeBorder = 'border-purple-400/50';
      badgeBg = 'bg-purple-950/80';
      textColor = 'text-purple-200';
      label = isTa ? 'செயலாக்குகிறது…' : 'Processing…';
      break;

    case 'error':
      dotColor = 'bg-rose-400';
      dotAnimation = '';
      badgeBorder = 'border-rose-500/60';
      badgeBg = 'bg-rose-950/90';
      textColor = 'text-rose-200';
      label = message || (isTa ? 'மைக்ரோஃபோன் பிழை' : 'Microphone error');
      break;

    case 'ready':
    default:
      dotColor = 'bg-zinc-400';
      dotAnimation = '';
      badgeBorder = 'border-zinc-700/80';
      badgeBg = 'bg-zinc-900/80';
      textColor = 'text-zinc-300';
      label = isTa ? 'தயாராக உள்ளது' : 'Ready';
      break;
  }

  return (
    <div
      className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md shadow-xs border transition-all duration-200 max-w-full truncate ${badgeBorder} ${badgeBg} ${textColor} ${className}`}
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
        {dotAnimation && (
          <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${dotColor} ${dotAnimation}`} />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor}`} />
      </span>

      <span className="truncate max-w-[280px] sm:max-w-[340px]">
        {label}
      </span>

      {state === 'error' && onRetry && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRetry();
          }}
          className="ml-1 px-1.5 py-0.5 rounded bg-rose-900/80 hover:bg-rose-800 text-rose-100 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
          title={isTa ? 'மீண்டும் முயற்சிக்கவும்' : 'Retry'}
        >
          <RefreshCw size={11} className="inline" />
          <span>{isTa ? 'மீண்டும்' : 'Retry'}</span>
        </button>
      )}
    </div>
  );
}
