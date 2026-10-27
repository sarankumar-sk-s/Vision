import React from 'react';
import { Mic } from 'lucide-react';
import { triggerHaptic } from '../utils/sound.js';

/**
 * HomeSpeakView Component
 * - Top-left: Logo "V" + "VisionMate"
 * - Prominent badge: Live status showing active listening for "Hey Mate"
 * - Exact center: Large animated Speak button with pulsing ambient rings
 * - Calling "Hey Mate" or tapping opens camera full-screen, counts down, and clicks photo!
 */
export function HomeSpeakView({ onStart, isListeningWake = false, wakeError = null }) {
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
      {/* Top Bar: "V" Logo + Product Name */}
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
            aria-label="Speak button: Say Hey Mate or tap to open camera and take photo"
          >
            <Mic size={52} strokeWidth={2.2} className="drop-shadow-md" aria-hidden="true" />
            <span className="text-2xl font-black tracking-wide">Speak</span>
          </button>
        </div>

        <div className="flex flex-col items-center text-center gap-1.5 px-4">
          <p className="text-lg sm:text-xl font-bold text-white tracking-wide">
            Say &ldquo;Hey Mate&rdquo; or Tap Speak
          </p>
          <p className="text-sm font-medium text-zinc-400 max-w-xs leading-snug">
            VisionMate will automatically open the camera, count down, and click the photo.
          </p>
        </div>
      </div>

      {/* Bottom Subtle Note */}
      <div className="w-full text-center pb-safe">
        <p className="text-[11px] sm:text-xs text-zinc-500 font-medium">
          Say &ldquo;Hey Mate&rdquo; or Tap anywhere &bull; Not a mobility or safety cane
        </p>
      </div>
    </div>
  );
}
