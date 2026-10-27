import React from 'react';
import { Mic, Volume2 } from 'lucide-react';
import { triggerHaptic } from '../utils/sound.js';
import { MicStatusIndicator } from './MicStatusIndicator.jsx';

/**
 * HomeSpeakView Component
 * - Top-left: Logo "V" + "VisionMate"
 * - Top-right: Language Switcher (English | தமிழ்)
 * - Exact center: Large animated Speak button
 * - Welcome text: "Welcome to your AI Accessibility Assistant! Tap the center button or say 'Hi' to get started."
 * - Autoplay fallback: "Tap to hear welcome" if audio was blocked by browser
 */
export function HomeSpeakView({
  onStart,
  _isListeningWake = false,
  _wakeError = null,
  currentLang = 'en',
  onSelectLang,
  isAudioBlocked = false,
  onPlayGreeting,
  wakeWordEnabled = true,
  onToggleWakeWord,
  micStatus = { state: 'ready', message: '', transcript: '' },
}) {
  const handleTap = (e) => {
    e.stopPropagation();
    triggerHaptic(50);
    onStart();
  };

  return (
    <div
      onClick={handleTap}
      className="flex-1 w-full h-full flex flex-col justify-between p-6 max-w-md mx-auto select-none cursor-pointer"
      role="main"
      aria-label="VisionMate Home Screen - Say Hey Mate or tap anywhere to open camera and take photo"
    >
      {/* Top Bar: "V" Logo + Product Name + Language Switcher */}
      <div className="w-full flex items-center justify-between pt-safe">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-700 to-cyan-400 p-0.5 shadow-md shrink-0">
            <div className="w-full h-full rounded-[10px] bg-[#0A0E17] flex items-center justify-center">
              <svg viewBox="0 0 512 512" className="w-7 h-7" fill="none">
                <path
                  d="M 124 136 L 256 392 L 388 136"
                  stroke="#38BDF8"
                  strokeWidth="60"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="256" cy="230" r="28" fill="#38BDF8" />
              </svg>
            </div>
          </div>

          <div className="flex flex-col">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
              VisionMate
            </h1>
            <p className="text-xs sm:text-sm font-semibold tracking-wide text-zinc-400">
              Visual Accessibility Assistant
            </p>
          </div>
        </div>

        {/* Controls: Hands-Free Wake-Word Toggle + Bilingual Language Switcher */}
        <div className="flex items-center gap-2">
          {/* Hands-Free Wake-Word Toggle */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onToggleWakeWord) onToggleWakeWord();
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer ${
              wakeWordEnabled
                ? 'bg-cyan-950/80 border-cyan-400/50 text-cyan-300 shadow-[0_0_10px_rgba(56,189,248,0.25)]'
                : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-300'
            }`}
            aria-label={
              wakeWordEnabled
                ? currentLang === 'ta' ? "ஹேண்ட்ஸ்-ஃப்ரீ 'Hey Mate' முடக்கு" : "Disable 'Hey Mate' hands-free listening"
                : currentLang === 'ta' ? "ஹேண்ட்ஸ்-ஃப்ரீ 'Hey Mate' இயக்கு" : "Enable 'Hey Mate' hands-free listening"
            }
            aria-pressed={wakeWordEnabled}
          >
            <span className={`w-2 h-2 rounded-full ${wakeWordEnabled ? 'bg-cyan-400 animate-pulse' : 'bg-zinc-500'}`} />
            <span>{wakeWordEnabled ? 'Hey Mate: ON' : 'Hey Mate: OFF'}</span>
          </button>

          {/* Bilingual Language Switcher: English | தமிழ் */}
          <div
            className="flex items-center bg-zinc-900/90 border border-zinc-700/80 rounded-full p-1 shadow-sm"
            role="radiogroup"
            aria-label="Select language"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onSelectLang) onSelectLang('en');
              }}
              className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                currentLang === 'en'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-white'
              }`}
              role="radio"
              aria-checked={currentLang === 'en'}
              aria-label="English language"
            >
              English
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onSelectLang) onSelectLang('ta');
              }}
              className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                currentLang === 'ta'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-white'
              }`}
              role="radio"
              aria-checked={currentLang === 'ta'}
              aria-label="தமிழ் மொழி"
            >
              தமிழ்
            </button>
          </div>
        </div>
      </div>

      {/* Center: Large Animated Speak Button */}
      <div className="flex flex-col items-center justify-center my-auto gap-8">
        {/* Ambient Outer Pulse Glow Rings + Button */}
        <div className="relative flex items-center justify-center">
          <span className="absolute w-56 h-56 rounded-full bg-cyan-500/10 animate-ping pointer-events-none" />
          <span className="absolute w-52 h-52 rounded-full bg-blue-600/20 animate-orb-breathe pointer-events-none" />

          {/* Main Huge Circular Button (min 160px) */}
          <button
            type="button"
            onClick={handleTap}
            className="relative z-10 w-44 h-44 sm:w-48 sm:h-48 rounded-full bg-gradient-to-tr from-blue-700 via-blue-600 to-cyan-400 text-white font-extrabold flex flex-col items-center justify-center gap-2.5 shadow-[0_0_50px_rgba(56,189,248,0.45)] border-2 border-cyan-300/40 active:scale-95 transition-transform duration-150 cursor-pointer"
            aria-label={
              currentLang === 'ta'
                ? 'பேச தொடவும் அல்லது வணக்கம் என்று கூறவும்'
                : 'Speak button: Say Hey Mate or tap to open camera and take photo'
            }
          >
            <Mic size={52} strokeWidth={2.2} className="drop-shadow-md" aria-hidden="true" />
            <span className="text-2xl font-black tracking-wide">
              {currentLang === 'ta' ? 'பேசு' : 'Speak'}
            </span>
          </button>
        </div>

        {/* Small Microphone Status Indicator near the Speak control */}
        <div className="flex items-center justify-center -mt-3">
          <MicStatusIndicator
            micStatus={micStatus}
            currentLang={currentLang}
            onRetry={onStart}
          />
        </div>

        {/* Welcome Voice Fallback Button if Autoplay was blocked */}
        {isAudioBlocked && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onPlayGreeting) onPlayGreeting();
            }}
            className="px-4 py-2 rounded-full bg-cyan-950/90 border border-cyan-400/60 text-cyan-200 text-xs sm:text-sm font-bold flex items-center gap-2 shadow-[0_0_15px_rgba(56,189,248,0.3)] animate-pulse cursor-pointer hover:bg-cyan-900/90"
            aria-label="Tap to hear welcome voice greeting"
          >
            <Volume2 size={16} className="text-cyan-400" />
            <span>
              {currentLang === 'ta' ? 'வரவேற்பு குரலைக் கேட்க தொடவும்' : 'Tap to hear welcome'}
            </span>
          </button>
        )}

        {/* Visible Welcome Message Requirement */}
        <div className="flex flex-col items-center text-center gap-2 px-4 max-w-sm">
          <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
            {currentLang === 'ta'
              ? 'உங்கள் AI அணுகல்தன்மை உதவியாளருக்கு நல்வரவு!'
              : 'Welcome to your AI Accessibility Assistant!'}
          </h2>
          <p className="text-sm sm:text-base font-semibold text-cyan-300 leading-snug">
            {currentLang === 'ta'
              ? 'தொடங்க நடுவில் உள்ள பொத்தானை அழுத்துங்கள் அல்லது "Hi" என்று சொல்லுங்கள்.'
              : 'Tap the center button or say "Hi" to get started.'}
          </p>
        </div>
      </div>

      {/* Bottom Subtle Note */}
      <div className="w-full text-center pb-safe">
        <p className="text-[11px] sm:text-xs text-zinc-500 font-medium">
          {currentLang === 'ta'
            ? 'தொடங்க நடுவில் உள்ள பொத்தானை அழுத்துங்கள் அல்லது "Hi" என்று சொல்லுங்கள்'
            : 'Tap the center button or say "Hi" to get started • Not a mobility cane'}
        </p>
      </div>
    </div>
  );
}
