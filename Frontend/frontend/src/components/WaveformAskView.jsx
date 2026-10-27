import React from 'react';
import { Mic, ArrowRight, Sparkles } from 'lucide-react';
import { triggerHaptic } from '../utils/sound.js';
import { MicStatusIndicator } from './MicStatusIndicator.jsx';

/**
 * WaveformAskView Component
 * Renders an animated live audio waveform and real-time transcript
 * with accurate microphone status indicator and quick suggestions.
 */
export function WaveformAskView({
  imagePreviewUrl,
  interimTranscript,
  onManualSubmit,
  isFollowUp = false,
  currentLang = 'en',
  micStatus = { state: 'ready', message: '', transcript: '' },
  onRetry = null,
}) {
  const suggestions = currentLang === 'ta'
    ? (isFollowUp
      ? [
          'விளக்கமாக கூறுங்கள்',
          'அது என்ன நிறம்?',
          'எழுத்துக்களை படித்து கூறுங்கள்',
          'பொருட்கள் எங்கு உள்ளன?',
        ]
      : [
          'என் முன்னால் என்ன இருக்கிறது?',
          'எழுத்துக்களை படித்து கூறுங்கள்',
          'ஏதேனும் ஆபத்து அல்லது தடை உள்ளதா?',
        ])
    : (isFollowUp
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
        ]);

  const handleChipClick = (suggestion) => {
    triggerHaptic(40);
    if (onManualSubmit) {
      onManualSubmit(suggestion);
    }
  };

  const handleMicClick = () => {
    triggerHaptic(50);
    if (onRetry) {
      onRetry();
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
            {isFollowUp
              ? (currentLang === 'ta' ? 'அதே படத்தில் தொடர் கேள்வி' : 'Follow-up on same image')
              : (currentLang === 'ta' ? 'படம் எடுக்கப்பட்டது' : 'Image Captured')}
          </span>
        </div>
      )}

      {/* Center Waveform & Mic Orb */}
      <div className="flex flex-col items-center gap-5 my-auto">
        <div className="relative flex items-center justify-center">
          {/* Ambient Glow Ring */}
          <div className="absolute w-40 h-40 rounded-full bg-cyan-500/15 animate-ping pointer-events-none" />
          <button
            type="button"
            onClick={handleMicClick}
            className="relative z-10 w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-gradient-to-tr from-blue-900 via-blue-700 to-cyan-500 flex items-center justify-center shadow-[0_0_40px_rgba(56,189,248,0.4)] border-2 border-cyan-300/40 cursor-pointer active:scale-95 transition-transform"
            aria-label={currentLang === 'ta' ? 'மீண்டும் பேச தொடவும்' : 'Tap to speak or retry'}
            title={currentLang === 'ta' ? 'மீண்டும் பேச தொடவும்' : 'Tap to speak or retry'}
          >
            <Mic size={40} className="text-white animate-pulse" aria-hidden="true" />
          </button>
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
          {isFollowUp
            ? (currentLang === 'ta' ? 'கேள்வி கேட்கவும்...' : 'Listening for follow-up...')
            : (currentLang === 'ta' ? 'என்ன அறிய விரும்புகிறீர்கள்?' : 'What would you like to know?')}
        </p>
      </div>

      {/* Real-time Transcription & Quick Suggestions */}
      <div className="w-full flex flex-col gap-3">
        {/* Accurate Microphone Status Indicator */}
        <div className="flex items-center justify-center">
          <MicStatusIndicator
            micStatus={micStatus}
            currentLang={currentLang}
            onRetry={onRetry}
          />
        </div>

        {/* Real-time Transcription Card: Shows "You are saying:" / "நீங்கள் கூறுவது:" */}
        <div
          className="min-h-[84px] w-full p-4 rounded-2xl bg-zinc-900/95 border border-cyan-500/40 text-white flex flex-col justify-center text-center shadow-lg backdrop-blur-md"
          role="status"
          aria-live="polite"
        >
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">
            {currentLang === 'ta' ? 'நீங்கள் கூறுவது:' : 'You are saying:'}
          </span>
          <p className="text-lg sm:text-xl font-bold leading-relaxed text-cyan-100 select-text">
            {interimTranscript ? (
              <span>&ldquo;{interimTranscript}&rdquo;</span>
            ) : (
              <span className="text-zinc-500 text-sm font-normal italic">
                {currentLang === 'ta'
                  ? 'உங்கள் கேள்வியைப் பேசவும் அல்லது கீழே உள்ளதைத் தொடவும்...'
                  : 'Start speaking your question or tap a suggestion below...'}
              </span>
            )}
          </p>
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
            <span>{currentLang === 'ta' ? 'இந்தக் கேள்வியைக் கேள்' : 'Ask This Question'}</span>
            <ArrowRight size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
