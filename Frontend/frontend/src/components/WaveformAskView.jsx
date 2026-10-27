import React from 'react';
import { Mic, ArrowRight, Sparkles } from 'lucide-react';
import { triggerHaptic } from '../utils/sound.js';

/**
 * WaveformAskView Component
 * Renders an animated live audio waveform and real-time transcript
 * with quick accessibility suggestions for questions.
 */
export function WaveformAskView({
  imagePreviewUrl,
  interimTranscript,
  onManualSubmit,
  isFollowUp = false,
}) {
  const suggestions = isFollowUp
    ? [
        'Describe in more detail',
        'What colors and shapes are visible?',
        'Read any visible text or numbers',
        'Where are objects located?',
      ]
    : [
        'Describe what is in front of me in detail.',
        'Read any text or signs visible',
        'Is there any obstacle or danger?',
      ];

  const handleChipClick = (suggestion) => {
    triggerHaptic(40);
    if (onManualSubmit) {
      onManualSubmit(suggestion);
    }
  };

  return (
    <div
      className="flex-1 w-full flex flex-col items-center justify-between py-6 px-4 max-w-md mx-auto"
      role="region"
      aria-label="Speech Recognition Listening"
    >
      {/* Captured Image Badge */}
      {imagePreviewUrl && (
        <div className="flex items-center gap-3 px-3.5 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-700/80 backdrop-blur-md shadow-xs">
          <img
            src={imagePreviewUrl}
            alt="Current captured scene thumbnail"
            className="w-7 h-7 rounded-full object-cover border border-cyan-400/50"
          />
          <span className="text-xs font-semibold text-zinc-300">
            {isFollowUp ? 'Follow-up on same image' : 'Image Captured'}
          </span>
        </div>
      )}

      {/* Center Waveform & Mic Orb */}
      <div className="flex flex-col items-center gap-5 my-auto">
        <div className="relative flex items-center justify-center">
          {/* Ambient Glow Ring */}
          <div className="absolute w-40 h-40 rounded-full bg-cyan-500/15 animate-ping pointer-events-none" />
          <div className="relative z-10 w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-gradient-to-tr from-blue-900 via-blue-700 to-cyan-500 flex items-center justify-center shadow-[0_0_40px_rgba(56,189,248,0.4)] border-2 border-cyan-300/40">
            <Mic size={40} className="text-white animate-pulse" aria-hidden="true" />
          </div>
        </div>

        {/* Dynamic 6-Bar Waveform */}
        <div className="flex items-center justify-center gap-2 h-12" aria-hidden="true">
          <div className="w-2 rounded-full bg-cyan-400 animate-wave-1 shadow-sm" />
          <div className="w-2 rounded-full bg-sky-400 animate-wave-2 shadow-sm" />
          <div className="w-2 rounded-full bg-blue-400 animate-wave-3 shadow-sm" />
          <div className="w-2 rounded-full bg-cyan-300 animate-wave-4 shadow-sm" />
          <div className="w-2 rounded-full bg-sky-300 animate-wave-5 shadow-sm" />
          <div className="w-2 rounded-full bg-cyan-400 animate-wave-6 shadow-sm" />
        </div>

        <p className="text-xl sm:text-2xl font-bold text-white tracking-wide text-center">
          {isFollowUp ? 'Listening for follow-up...' : 'What would you like to know?'}
        </p>
      </div>

      {/* Real-time Transcription & Quick Suggestions */}
      <div className="w-full flex flex-col gap-3">
        {/* Transcription Status */}
        <div
          className="min-h-[64px] w-full p-3.5 rounded-2xl bg-zinc-900/90 border border-cyan-500/30 text-white text-base sm:text-lg font-medium leading-relaxed flex items-center justify-center text-center shadow-lg backdrop-blur-md"
          role="status"
          aria-live="polite"
        >
          {interimTranscript ? (
            <span className="text-cyan-200 font-semibold">&ldquo;{interimTranscript}&rdquo;</span>
          ) : (
            <span className="text-zinc-400 text-sm italic">
              Speak your question or tap a suggestion below
            </span>
          )}
        </div>

        {/* Quick Suggestion Chips */}
        <div className="flex flex-wrap gap-2 justify-center">
          {suggestions.map((sugg) => (
            <button
              key={sugg}
              type="button"
              onClick={() => handleChipClick(sugg)}
              className="px-3 py-1.5 rounded-full bg-zinc-800/90 hover:bg-zinc-750 text-cyan-200 border border-cyan-500/25 text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-transform"
            >
              <Sparkles size={12} className="text-cyan-400" />
              <span>{sugg}</span>
            </button>
          ))}
        </div>

        {/* Manual Submit Button if Speech Detected */}
        {interimTranscript && onManualSubmit && (
          <button
            type="button"
            onClick={() => onManualSubmit(interimTranscript)}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-base flex items-center justify-center gap-2 shadow-md cursor-pointer active:scale-98 transition-transform"
            aria-label="Submit recognized question"
          >
            <span>Ask This Question</span>
            <ArrowRight size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
