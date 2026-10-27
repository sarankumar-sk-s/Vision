import React from 'react';
import { Eye, Sun, Moon } from 'lucide-react';

/**
 * Mobile-First Application Header
 * Displays VisionMate branding, accessibility subtitle, and high-contrast theme toggle.
 */
export function Header({ isDarkMode, onToggleTheme }) {
  return (
    <header className="w-full bg-white dark:bg-[#111827] border-b border-zinc-200 dark:border-zinc-800 px-4 py-3.5 sm:px-6 transition-colors">
      <div className="w-full max-w-xl mx-auto flex items-center justify-between gap-3">
        {/* Brand & Subtitle */}
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl bg-blue-800 dark:bg-blue-700 flex items-center justify-center text-white shrink-0 shadow-xs"
            aria-hidden="true"
          >
            <Eye size={24} strokeWidth={2.2} />
          </div>
          <div className="flex flex-col">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-white leading-tight">
              VisionMate
            </h1>
            <p className="text-sm sm:text-base font-semibold text-zinc-600 dark:text-zinc-300">
              AI Visual Accessibility Assistant
            </p>
          </div>
        </div>

        {/* Theme Toggle Button */}
        <button
          type="button"
          onClick={onToggleTheme}
          className="min-h-[44px] min-w-[44px] p-2.5 rounded-xl border-2 border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer transition-colors"
          aria-label={isDarkMode ? 'Switch to light theme' : 'Switch to high-contrast dark theme'}
          title={isDarkMode ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
        >
          {isDarkMode ? (
            <Sun size={20} strokeWidth={2.2} aria-hidden="true" />
          ) : (
            <Moon size={20} strokeWidth={2.2} aria-hidden="true" />
          )}
        </button>
      </div>
    </header>
  );
}
