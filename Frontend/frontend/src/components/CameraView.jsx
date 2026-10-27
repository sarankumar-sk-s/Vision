import React, { useEffect, useRef } from 'react';
import { Camera } from 'lucide-react';

/**
 * CameraView Component
 * - Manages getUserMedia with facingMode: "environment"
 * - Starts stream only during CAPTURE state and stops immediately afterwards
 * - Scales down to max 1280px on long side and exports JPEG at 0.85 quality
 * - Shows small preview during capture and thumbnail afterwards
 */
export function CameraView({
  isCapturing,
  imagePreviewUrl,
  onFrameCaptured,
  onError,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    let isCancelled = false;

    async function startAndCapture() {
      if (!isCapturing) return;

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (onError) {
          onError({
            type: 'camera-unsupported',
            message: 'Camera is not supported on this device or browser.',
          });
        }
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

        // Allow a brief 400ms moment for camera exposure and focus to adjust
        await new Promise((resolve) => setTimeout(resolve, 450));

        if (isCancelled || !videoRef.current) return;

        const video = videoRef.current;
        const videoWidth = video.videoWidth || 1280;
        const videoHeight = video.videoHeight || 720;

        // Calculate dimensions with max 1280px on long side
        let targetWidth = videoWidth;
        let targetHeight = videoHeight;
        const maxDimension = 1280;

        if (videoWidth > maxDimension || videoHeight > maxDimension) {
          if (videoWidth >= videoHeight) {
            targetWidth = maxDimension;
            targetHeight = Math.round((videoHeight / videoWidth) * maxDimension);
          } else {
            targetHeight = maxDimension;
            targetWidth = Math.round((videoWidth / videoHeight) * maxDimension);
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

        canvas.toBlob(
          (blob) => {
            // Stop camera tracks immediately
            if (streamRef.current) {
              streamRef.current.getTracks().forEach((track) => track.stop());
              streamRef.current = null;
            }

            if (blob && onFrameCaptured) {
              const previewUrl = URL.createObjectURL(blob);
              onFrameCaptured({ blob, previewUrl });
            }
          },
          'image/jpeg',
          0.85
        );
      } catch (err) {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        let msg = 'Camera access error occurred.';
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          msg = 'Camera permission denied. Please allow camera access in browser permissions.';
        } else if (err.name === 'NotFoundError') {
          msg = 'No camera found on this device.';
        }

        if (onError) {
          onError({
            type: 'camera-denied',
            message: msg,
          });
        }
      }
    }

    if (isCapturing) {
      startAndCapture();
    }

    return () => {
      isCancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [isCapturing, onFrameCaptured, onError]);

  // If currently capturing, show a live camera viewfinder panel
  if (isCapturing) {
    return (
      <div
        className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4"
        role="dialog"
        aria-label="Camera Capture"
      >
        <div className="relative w-full max-w-sm aspect-[4/3] bg-zinc-900 rounded-xl overflow-hidden border border-zinc-700 shadow-lg">
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover"
            aria-label="Active camera viewfinder"
          />
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-center gap-2 bg-black/70 text-white text-base font-semibold py-2 px-3 rounded-lg">
            <Camera size={20} className="animate-pulse" aria-hidden="true" />
            <span>Capturing frame...</span>
          </div>
        </div>
      </div>
    );
  }

  // When not capturing but an active image exists, display a persistent small thumbnail
  if (imagePreviewUrl) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#F4F4F2] dark:bg-[#161C26] text-xs font-medium"
        role="region"
        aria-label="Current image thumbnail"
      >
        <img
          src={imagePreviewUrl}
          alt="Current scene snapshot"
          className="w-8 h-8 rounded object-cover border border-zinc-300 dark:border-zinc-700"
        />
        <div className="flex flex-col">
          <span className="font-semibold text-zinc-800 dark:text-zinc-200">Current Scan</span>
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Reused for follow-up</span>
        </div>
      </div>
    );
  }

  return null;
}
