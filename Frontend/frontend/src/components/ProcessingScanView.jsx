import React, { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';

/**
 * ProcessingScanView Component
 * Renders a soft vertical laser/light sweep over the captured image thumbnail,
 * accompanied by subtle shimmer skeleton loaders for the incoming answer.
 */
export function ProcessingScanView({ imagePreviewUrl, question }) {
  const [statusText, setStatusText] = useState('Connecting to the assistant. This may take a moment.');

  useEffect(() => {
    const timer = setTimeout(() => {
      setStatusText('Connecting to the assistant. The server may be waking up, please hold on...');
    }, 7000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className="flex-1 w-full flex flex-col items-center justify-center p-4 max-w-md mx-auto gap-6"
      role="status"
      aria-live="polite"
      aria-label="Processing image with AI"
    >
      {/* Question Badge */}
      {question && (
        <div className="w-full text-center">
          <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
            Analyzing for Question
          </span>
          <p className="text-lg font-semibold text-white mt-0.5 truncate">
            "{question}"
          </p>
        </div>
      )}

      {/* Captured Image with Animated Vertical Scanning Line */}
      <div className="relative w-full max-w-xs aspect-[4/3] rounded-2xl overflow-hidden border-2 border-cyan-500/40 bg-zinc-950 shadow-[0_0_30px_rgba(56,189,248,0.2)] flex items-center justify-center">
        {imagePreviewUrl ? (
          <img
            src={imagePreviewUrl}
            alt="Captured scene currently being analyzed"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-zinc-900" />
        )}

        {/* Ambient Dark Overlay */}
        <div className="absolute inset-0 bg-blue-950/20" />

        {/* Soft Glowing Scan Line Sweeping Vertically */}
        <div className="absolute left-0 right-0 h-1.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#38BDF8] animate-scan-sweep pointer-events-none" />

        {/* Scan Status Pill */}
        <div className="absolute bottom-3 flex items-center gap-2 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md border border-cyan-400/30 text-cyan-300 text-xs font-bold">
          <Sparkles size={14} className="animate-spin" />
          <span>AI Scanning Active</span>
        </div>
      </div>

      {/* Subtle Shimmer Skeleton for Incoming Answer */}
      <div className="w-full flex flex-col gap-2.5 px-2">
        <div className="h-5 w-3/4 rounded-md animate-shimmer" />
        <div className="h-5 w-full rounded-md animate-shimmer" />
        <div className="h-5 w-5/6 rounded-md animate-shimmer" />
      </div>

      <p className="text-base font-semibold text-zinc-300 animate-pulse text-center">
        {statusText}
      </p>
    </div>
  );
}
