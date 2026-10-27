import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Camera } from 'lucide-react';
import { playCountdownBeep, playShutterSound } from '../utils/sound.js';

/**
 * CameraCountdownView Component
 * Opens rear camera full screen, displays animated 5 -> 1 countdown with progress ring,
 * speaks each tick and beeps, triggers shutter flash + sound, and captures one JPEG frame.
 */
export function CameraCountdownView({
  onCaptured,
  onError,
  onCancel,
  speakNumber,
  isReadyToCountdown = true,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [countdown, setCountdown] = useState(5);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isShutterActive, setIsShutterActive] = useState(false);
  const isCapturingRef = useRef(false);

  // Stop camera tracks cleanly
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  // 1. Initialize full-screen camera
  useEffect(() => {
    let isCancelled = false;

    async function initCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (onError) onError(new Error('Camera is not supported on this device.'));
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        if (isCancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setIsCameraReady(true);
      } catch (err) {
        let msg = 'Unable to access camera.';
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          msg = 'Camera permission was denied. Please allow camera access in settings.';
        }
        if (onError) onError(new Error(msg));
      }
    }

    initCamera();

    return () => {
      isCancelled = true;
      stopStream();
    };
  }, [onError, stopStream]);

  // 2. Capture one JPEG frame (max 1280px long edge, quality 0.85)
  const captureFrame = useCallback(async () => {
    if (isCapturingRef.current || !videoRef.current) return;
    isCapturingRef.current = true;

    // Trigger shutter sound and flash
    playShutterSound();
    setIsShutterActive(true);

    const video = videoRef.current;
    const videoWidth = video.videoWidth || 1280;
    const videoHeight = video.videoHeight || 720;

    // Scale to max 1280px on long side
    const maxDim = 1280;
    let targetW = videoWidth;
    let targetH = videoHeight;

    if (videoWidth > maxDim || videoHeight > maxDim) {
      if (videoWidth >= videoHeight) {
        targetW = maxDim;
        targetH = Math.round((videoHeight / videoWidth) * maxDim);
      } else {
        targetH = maxDim;
        targetW = Math.round((videoWidth / videoHeight) * maxDim);
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, targetW, targetH);

    canvas.toBlob(
      (blob) => {
        stopStream();
        if (blob) {
          const previewUrl = URL.createObjectURL(blob);
          onCaptured({ blob, previewUrl });
        }
      },
      'image/jpeg',
      0.85
    );
  }, [onCaptured, stopStream]);

  // 3. Countdown timer 5 -> 1 once camera is ready AND initial announcement completes
  useEffect(() => {
    if (!isCameraReady || !isReadyToCountdown) return;

    // Announce and beep first count (5)
    playCountdownBeep(false);
    if (speakNumber) speakNumber('5');

    let current = 5;
    const interval = setInterval(() => {
      current -= 1;
      if (current >= 1) {
        setCountdown(current);
        playCountdownBeep(current === 1);
        if (speakNumber) speakNumber(String(current));
      } else {
        clearInterval(interval);
        // Countdown reached 0 -> execute capture!
        captureFrame();
      }
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [isCameraReady, isReadyToCountdown, captureFrame, speakNumber]);

  // SVG circular progress calculation (radius 80, perimeter = 2 * PI * 80 ≈ 502.65)
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - ((5 - countdown) / 5) * circumference;

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-between overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Camera Capture Viewfinder"
    >
      {/* Live Video Feed */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 w-full h-full object-cover"
        aria-label="Live camera preview"
      />

      {/* Shutter White Flash Animation */}
      {isShutterActive && (
        <div className="absolute inset-0 bg-white pointer-events-none z-40 animate-shutter-flash" />
      )}

      {/* Top Controls Overlay */}
      <div className="relative z-20 w-full flex items-center justify-between px-5 pt-safe pb-3 bg-gradient-to-b from-black/70 to-transparent">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white text-sm font-semibold">
          <Camera size={16} className="text-cyan-400" />
          <span>Hold Steady</span>
        </div>

        <button
          type="button"
          onClick={() => {
            stopStream();
            onCancel();
          }}
          className="p-3 rounded-full bg-black/60 text-white border border-white/20 active:scale-95"
          aria-label="Cancel camera capture"
        >
          <X size={24} />
        </button>
      </div>

      {/* Center Animated 5 -> 1 Countdown Ring */}
      <div className="relative z-20 flex flex-col items-center justify-center my-auto">
        <div className="relative w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center">
          {/* Circular Progress Ring */}
          <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
            {/* Background Track */}
            <circle
              cx="100"
              cy="100"
              r={radius}
              stroke="rgba(255, 255, 255, 0.2)"
              strokeWidth="12"
              fill="rgba(0, 0, 0, 0.45)"
            />
            {/* Animated Progress Stroke */}
            <circle
              cx="100"
              cy="100"
              r={radius}
              stroke="#38BDF8"
              strokeWidth="12"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              className="transition-[stroke-dashoffset] duration-900 ease-linear drop-shadow-[0_0_12px_rgba(56,189,248,0.8)]"
            />
          </svg>

          {/* Large Countdown Numeral */}
          <span
            key={countdown}
            className="absolute text-7xl sm:text-8xl font-black text-white tracking-tight drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)] scale-100 transition-transform animate-scale-in"
          >
            {countdown}
          </span>
        </div>

        <p className="mt-4 px-4 py-1.5 rounded-full bg-black/60 backdrop-blur-md text-white font-bold text-base tracking-wide border border-white/10 shadow-lg">
          Capturing in {countdown}...
        </p>
      </div>

      {/* Bottom Spacer */}
      <div className="relative z-20 w-full pb-safe pt-4 text-center">
        <span className="text-xs text-white/70 font-medium">
          VisionMate will capture automatically at 1
        </span>
      </div>
    </div>
  );
}
