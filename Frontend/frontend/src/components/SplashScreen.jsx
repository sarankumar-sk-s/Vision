import React, { useEffect, useState } from 'react';

/**
 * Animated PWA Splash Screen
 * Shows the geometric "V" logo drawing itself via SVG stroke animation,
 * then smoothly fades into the Home screen.
 */
export function SplashScreen({ onComplete }) {
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    // Logo finishes drawing around 1.6s, then start fade-out at 1.9s
    const fadeTimer = setTimeout(() => {
      setIsFading(true);
    }, 1900);

    // Call onComplete after fade-out finishes
    const finishTimer = setTimeout(() => {
      onComplete();
    }, 2300);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(finishTimer);
    };
  }, [onComplete]);

  return (
    <div
      onClick={onComplete}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0A0E17] transition-opacity duration-400 cursor-pointer ${
        isFading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      role="dialog"
      aria-label="VisionMate App Loading"
    >
      <div className="flex flex-col items-center gap-6">
        {/* Animated SVG Monogram */}
        <div className="relative w-36 h-36 sm:w-44 sm:h-44 flex items-center justify-center">
          <svg
            viewBox="0 0 512 512"
            className="w-full h-full drop-shadow-[0_0_35px_rgba(56,189,248,0.35)]"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="splashVGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#38BDF8" />
                <stop offset="50%" stopColor="#2563EB" />
                <stop offset="100%" stopColor="#1D4ED8" />
              </linearGradient>
            </defs>

            {/* Subtle background aperture orbit ring */}
            <circle
              cx="256"
              cy="230"
              r="140"
              stroke="#1E293B"
              strokeWidth="6"
              strokeDasharray="10 10"
              opacity="0.6"
            />

            {/* Self-drawing "V" stroke */}
            <path
              d="M 124 136 L 256 392 L 388 136"
              stroke="url(#splashVGrad)"
              strokeWidth="48"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="animate-stroke-draw"
            />

            {/* Core optic pulse dot */}
            <circle
              cx="256"
              cy="230"
              r="22"
              fill="#38BDF8"
              className="animate-ping opacity-40"
            />
            <circle cx="256" cy="230" r="18" fill="#38BDF8" />
            <circle cx="256" cy="230" r="8" fill="#FFFFFF" />
          </svg>
        </div>

        {/* Brand Name Fade-in */}
        <div className="flex flex-col items-center gap-1.5 animate-fade-in">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            VisionMate
          </h1>
          <p className="text-sm sm:text-base font-medium tracking-wide text-zinc-400">
            Visual Accessibility Assistant
          </p>
        </div>
      </div>
    </div>
  );
}
