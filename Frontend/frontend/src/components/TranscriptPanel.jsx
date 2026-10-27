import React, { useEffect, useRef } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { STATES } from '../state/machine.js';

/**
 * TranscriptPanel Component
 * Displays current status line, user question, and spoken AI answer.
 * Large typography (min 20px, answer 24px+), auto-scrolling, WCAG AAA contrast.
 */
export function TranscriptPanel({
  status,
  question,
  answer,
  error,
  textSize = 'M', // 'M' | 'L' | 'XL'
  interimQuestion = '',
  onRetry,
}) {
  const panelEndRef = useRef(null);

  // Auto-scroll on new content
  useEffect(() => {
    panelEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [question, answer, interimQuestion, error, status]);

  // Typography scale based on accessibility settings
  const fontSizes = {
    M: { question: 'text-xl sm:text-2xl', answer: 'text-2xl sm:text-3xl' },
    L: { question: 'text-2xl sm:text-3xl', answer: 'text-3xl sm:text-4xl' },
    XL: { question: 'text-3xl sm:text-4xl', answer: 'text-4xl sm:text-5xl' },
  }[textSize] || { question: 'text-xl', answer: 'text-2xl' };

  // Status line helper
  let statusLine = '';
  switch (status) {
    case STATES.STANDBY:
      statusLine = 'Standing by. Say "Vision" or press Start below.';
      break;
    case STATES.READY:
      statusLine = 'VisionMate is ready. Speak now or press the center button.';
      break;
    case STATES.LISTENING:
      statusLine = 'Listening to your voice...';
      break;
    case STATES.CAPTURE:
      statusLine = 'Capturing camera frame...';
      break;
    case STATES.PROCESSING:
      statusLine = 'Processing image and question with AI...';
      break;
    case STATES.ANSWER:
      statusLine = 'Speaking answer aloud:';
      break;
    case STATES.WAITING:
      statusLine = 'Waiting. Say "Continue" or press Continue when ready.';
      break;
    case STATES.NEXT_ACTION:
      statusLine = 'Ask a follow-up, or press New Scan.';
      break;
    case STATES.ERROR:
      statusLine = 'An issue occurred:';
      break;
    default:
      statusLine = 'Ready.';
  }

  return (
    <div
      className="flex-1 w-full max-w-2xl mx-auto overflow-y-auto px-4 py-3 flex flex-col gap-4 focus:outline-none"
      role="region"
      aria-label="Conversation and Answer Transcript"
      tabIndex={0}
    >
      {/* Current status line */}
      <div
        className="text-sm sm:text-base font-semibold tracking-wide text-zinc-600 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 pb-2"
        role="status"
        aria-live="polite"
      >
        {statusLine}
      </div>

      {/* Error Card */}
      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200 flex flex-col gap-3"
        >
          <div className="flex items-start gap-3">
            <AlertCircle size={24} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <span className="font-bold text-lg block">Notice</span>
              <p className="text-base mt-1 leading-relaxed">{error.message || 'An error occurred.'}</p>
            </div>
          </div>

          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-red-700 text-white font-semibold text-base hover:bg-red-800 focus-visible:ring-3 cursor-pointer"
              aria-label="Try again after error"
            >
              <RotateCcw size={18} aria-hidden="true" />
              <span>Try Again</span>
            </button>
          )}
        </div>
      )}

      {/* User's Question */}
      {(question || interimQuestion) && (
        <div className="flex flex-col gap-1 p-4 rounded-xl bg-white dark:bg-[#161C26] border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
            You Asked
          </span>
          <p className={`${fontSizes.question} font-semibold text-zinc-900 dark:text-zinc-100 leading-snug`}>
            {question || interimQuestion}
            {interimQuestion && !question && (
              <span className="inline-block w-2 h-5 ml-1 bg-blue-600 animate-pulse" aria-hidden="true" />
            )}
          </p>
        </div>
      )}

      {/* AI Answer (Large, High Contrast) */}
      {answer && (
        <div
          className="flex flex-col gap-2 p-5 rounded-xl bg-white dark:bg-[#161C26] border-2 border-blue-600 dark:border-blue-500 shadow-xs"
          role="region"
          aria-live="polite"
          aria-label="VisionMate Answer"
        >
          <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
            VisionMate Answer
          </span>
          <p className={`${fontSizes.answer} font-bold text-zinc-950 dark:text-white leading-relaxed select-text`}>
            {answer}
          </p>
        </div>
      )}

      {/* Empty State Instructions */}
      {!question && !interimQuestion && !answer && !error && (
        <div className="my-auto py-8 text-center flex flex-col items-center justify-center gap-3 text-zinc-600 dark:text-zinc-400">
          <p className="text-xl sm:text-2xl font-semibold text-zinc-800 dark:text-zinc-200 max-w-md">
            Say <span className="text-blue-700 dark:text-blue-400 font-bold">"Vision"</span> or tap the button below to ask about what is in front of you.
          </p>
          <p className="text-base text-zinc-500 dark:text-zinc-400 max-w-sm">
            Answers are spoken aloud and displayed as large readable text.
          </p>
        </div>
      )}

      <div ref={panelEndRef} />
    </div>
  );
}
