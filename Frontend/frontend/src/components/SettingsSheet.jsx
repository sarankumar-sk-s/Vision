import React, { useEffect } from 'react';
import { X, Volume2, VolumeX, Type, Radio } from 'lucide-react';
import { WAKE_WORD } from '../services/speechRecognition.js';

/**
 * SettingsSheet Modal
 * Controls:
 * - Speech Output (on/off)
 * - Text Size (M / L / XL)
 * - Wake Word Listening (on/off)
 */
export function SettingsSheet({
  isOpen,
  onClose,
  speechEnabled,
  onToggleSpeech,
  textSize,
  onChangeTextSize,
  wakeWordEnabled,
  onToggleWakeWord,
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-heading"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-[#131924] rounded-t-2xl sm:rounded-2xl border border-zinc-300 dark:border-zinc-700 p-6 flex flex-col gap-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
          <h2 id="settings-heading" className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            VisionMate Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus-visible:ring-2 cursor-pointer"
            aria-label="Close settings"
          >
            <X size={22} aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-5">
          {/* 1. Speech Output Toggle */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {speechEnabled ? (
                <Volume2 size={24} className="text-blue-700 dark:text-blue-400" aria-hidden="true" />
              ) : (
                <VolumeX size={24} className="text-zinc-500" aria-hidden="true" />
              )}
              <div>
                <span className="font-bold text-base block text-zinc-900 dark:text-zinc-100">
                  Voice Speech
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Speak answers and status aloud
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onToggleSpeech}
              className={`px-4 py-2 rounded-lg font-bold text-sm border-2 transition-colors cursor-pointer ${
                speechEnabled
                  ? 'bg-blue-800 text-white border-blue-800 dark:bg-blue-700 dark:border-blue-700'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700'
              }`}
              aria-pressed={speechEnabled}
            >
              {speechEnabled ? 'Enabled' : 'Muted'}
            </button>
          </div>

          {/* 2. Text Size Selector */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <Type size={22} className="text-blue-700 dark:text-blue-400" aria-hidden="true" />
              <div>
                <span className="font-bold text-base block text-zinc-900 dark:text-zinc-100">
                  Text Size
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Adjust answer readability scale
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-1" role="group" aria-label="Text size options">
              {['M', 'L', 'XL'].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => onChangeTextSize(size)}
                  className={`py-2.5 rounded-lg font-bold text-base border-2 transition-colors cursor-pointer ${
                    textSize === size
                      ? 'bg-blue-800 text-white border-blue-800 dark:bg-blue-700 dark:border-blue-700'
                      : 'bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                  }`}
                  aria-pressed={textSize === size}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Wake Word Listening Toggle */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Radio size={22} className="text-blue-700 dark:text-blue-400" aria-hidden="true" />
              <div>
                <span className="font-bold text-base block text-zinc-900 dark:text-zinc-100">
                  Wake Word ("{WAKE_WORD}")
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Hands-free listening in Standby
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onToggleWakeWord}
              className={`px-4 py-2 rounded-lg font-bold text-sm border-2 transition-colors cursor-pointer ${
                wakeWordEnabled
                  ? 'bg-blue-800 text-white border-blue-800 dark:bg-blue-700 dark:border-blue-700'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700'
              }`}
              aria-pressed={wakeWordEnabled}
            >
              {wakeWordEnabled ? 'Active' : 'Off'}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-3.5 mt-2 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold text-base hover:bg-zinc-800 dark:hover:bg-white cursor-pointer"
        >
          Done
        </button>
      </div>
    </div>
  );
}
