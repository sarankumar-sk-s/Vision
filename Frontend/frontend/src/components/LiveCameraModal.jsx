import React, { useEffect, useRef, useState } from 'react';
import { Camera, X, RefreshCw, AlertCircle } from 'lucide-react';

/**
 * LiveCameraModal Component
 * Live in-browser camera viewfinder with capture button for devices without direct file camera triggers.
 */
export function LiveCameraModal({ isOpen, onClose, onCapture }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState(null);
  const [facingMode, setFacingMode] = useState('environment');

  useEffect(() => {
    if (!isOpen) return;

    let isCancelled = false;

    async function initCamera() {
      setError(null);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError('Camera is not supported on this browser. Please use the Upload Image option.');
        return;
      }

      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError('Camera permission denied. Please allow camera access in browser permissions.');
        } else {
          setError('Unable to access camera on this device.');
        }
      }
    }

    initCamera();

    return () => {
      isCancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen, facingMode]);

  const handleCapture = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `visionmate_photo_${Date.now()}.jpg`, {
          type: 'image/jpeg',
        });
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        onCapture(file);
        onClose();
      },
      'image/jpeg',
      0.85
    );
  };

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Live Camera Viewfinder"
    >
      <div className="w-full max-w-md bg-zinc-950 rounded-2xl border-2 border-zinc-700 overflow-hidden flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 text-white">
          <h2 className="text-xl font-bold">Camera Viewfinder</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800"
            aria-label="Close camera viewfinder"
          >
            <X size={24} aria-hidden="true" />
          </button>
        </div>

        <div className="relative w-full aspect-[4/3] bg-black overflow-hidden flex items-center justify-center">
          {error ? (
            <div className="p-6 text-center text-red-300 flex flex-col items-center gap-2">
              <AlertCircle size={32} aria-hidden="true" />
              <p className="text-base font-semibold">{error}</p>
            </div>
          ) : (
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
              aria-label="Live camera preview"
            />
          )}
        </div>

        <div className="p-4 bg-zinc-900 flex flex-col gap-3">
          {!error && (
            <button
              type="button"
              onClick={handleCapture}
              className="w-full min-h-[60px] rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold text-xl flex items-center justify-center gap-3 cursor-pointer shadow-md"
              aria-label="Take photo now"
            >
              <Camera size={26} strokeWidth={2.2} aria-hidden="true" />
              <span>Capture Photo</span>
            </button>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={toggleCamera}
              className="min-h-[48px] rounded-xl border border-zinc-700 bg-zinc-800 text-white font-semibold text-base flex items-center justify-center gap-2 hover:bg-zinc-700"
              aria-label="Switch front and back camera"
            >
              <RefreshCw size={18} aria-hidden="true" />
              <span>Flip Camera</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="min-h-[48px] rounded-xl border border-zinc-700 bg-zinc-850 text-zinc-300 font-semibold text-base flex items-center justify-center hover:bg-zinc-800"
              aria-label="Cancel"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
