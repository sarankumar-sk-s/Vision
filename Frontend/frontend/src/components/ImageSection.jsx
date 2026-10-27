import React, { useRef } from 'react';
import { Camera, Upload, Sparkles, RefreshCw, Loader2, Video } from 'lucide-react';

/**
 * ImageSection Component
 * Handles Take Photo, Upload Image, Image Preview, and the Analyze button.
 * Large touch targets (min 60px), full-width on mobile, high contrast.
 */
export function ImageSection({
  imagePreviewUrl,
  imageFile,
  isAnalyzing,
  hasAnalyzed,
  onImageSelected,
  onAnalyze,
  onResetImage,
  onOpenLiveCamera,
}) {
  const cameraInputRef = useRef(null);
  const uploadInputRef = useRef(null);

  const handleCameraChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onImageSelected(file);
      // Reset input value so re-selecting same file triggers onChange
      e.target.value = '';
    }
  };

  const handleUploadChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onImageSelected(file);
      e.target.value = '';
    }
  };

  return (
    <section aria-label="Image actions and preview" className="w-full flex flex-col gap-4">
      {/* Hidden Mobile Native Inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCameraChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        onChange={handleUploadChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Case 1: No Image Selected Yet -> Show Main Actions */}
      {!imagePreviewUrl ? (
        <div className="flex flex-col gap-3 w-full">
          <div className="text-left mb-1">
            <h2 className="text-xl sm:text-2xl font-bold text-zinc-950 dark:text-white">
              Get Visual Information
            </h2>
            <p className="text-base text-zinc-600 dark:text-zinc-300 mt-1">
              Capture or upload an image to hear and read what is around you.
            </p>
          </div>

          {/* Action 1: Take Photo */}
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="w-full min-h-[60px] px-6 py-4 rounded-2xl bg-blue-800 hover:bg-blue-900 active:bg-blue-950 dark:bg-blue-700 dark:hover:bg-blue-800 text-white font-bold text-lg sm:text-xl flex items-center justify-center gap-3 shadow-md cursor-pointer transition-colors"
            aria-label="Take Photo using device camera"
          >
            <Camera size={26} strokeWidth={2.2} aria-hidden="true" />
            <span>Take Photo</span>
          </button>

          {/* Action 2: Upload Image */}
          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            className="w-full min-h-[60px] px-6 py-4 rounded-2xl border-2 border-zinc-400 dark:border-zinc-600 bg-white dark:bg-[#161C26] text-zinc-950 dark:text-white font-bold text-lg sm:text-xl flex items-center justify-center gap-3 shadow-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
            aria-label="Upload Image from your device files"
          >
            <Upload size={26} strokeWidth={2.2} aria-hidden="true" />
            <span>Upload Image</span>
          </button>

          {/* Optional Web Viewfinder Option for Desktop/Webcam */}
          {onOpenLiveCamera && (
            <button
              type="button"
              onClick={onOpenLiveCamera}
              className="mt-1 text-sm sm:text-base font-semibold text-blue-800 dark:text-blue-400 hover:underline flex items-center justify-center gap-2 py-2 cursor-pointer"
              aria-label="Use in-browser live camera viewfinder"
            >
              <Video size={18} aria-hidden="true" />
              <span>Use In-Browser Live Viewfinder</span>
            </button>
          )}
        </div>
      ) : (
        /* Case 2: Image Selected -> Show Preview and Analyze Button */
        <div className="flex flex-col gap-4 w-full">
          <div className="relative w-full overflow-hidden rounded-2xl border-2 border-zinc-300 dark:border-zinc-700 bg-black flex flex-col shadow-xs">
            {/* Image Preview */}
            <div className="w-full max-h-[380px] sm:max-h-[440px] flex items-center justify-center overflow-hidden">
              <img
                src={imagePreviewUrl}
                alt="Selected scene for AI visual description"
                className="w-full max-h-[380px] sm:max-h-[440px] object-contain block"
              />
            </div>

            {/* Image Toolbar */}
            <div className="w-full px-4 py-2.5 bg-zinc-900 text-zinc-200 flex items-center justify-between text-sm sm:text-base font-medium">
              <span className="truncate max-w-[200px]">
                {imageFile?.name || 'Captured Photo'}
              </span>
              <button
                type="button"
                onClick={onResetImage}
                disabled={isAnalyzing}
                className="text-white hover:text-blue-300 flex items-center gap-1.5 font-bold cursor-pointer disabled:opacity-50"
                aria-label="Change current image or retake photo"
              >
                <RefreshCw size={16} aria-hidden="true" />
                <span>Change Image</span>
              </button>
            </div>
          </div>

          {/* Analyze Button (Shown before first analysis or when re-analyzing) */}
          {!hasAnalyzed && (
            <button
              type="button"
              onClick={onAnalyze}
              disabled={isAnalyzing}
              className="w-full min-h-[64px] px-6 py-4 rounded-2xl bg-blue-800 hover:bg-blue-900 active:bg-blue-950 dark:bg-blue-700 dark:hover:bg-blue-800 text-white font-bold text-xl sm:text-2xl flex items-center justify-center gap-3 shadow-md cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              aria-label="Analyze image with VisionMate AI"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 size={26} className="animate-spin" aria-hidden="true" />
                  <span>Analyzing Image...</span>
                </>
              ) : (
                <>
                  <Sparkles size={26} strokeWidth={2.2} aria-hidden="true" />
                  <span>Analyze Image</span>
                </>
              )}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
