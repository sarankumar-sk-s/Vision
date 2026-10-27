import React, { useRef, useEffect } from 'react';
import { Volume2, VolumeX, Mic, Send, Loader2, MessageSquare, AlertCircle } from 'lucide-react';

/**
 * ResultSection Component
 * Displays AI description, Read Aloud button, and the Follow-Up question interface
 * with text input, Microphone button ("Ask by Voice"), and Ask button.
 */
export function ResultSection({
  analysisText,
  isAnalyzing,
  isSpeaking,
  followUpHistory,
  questionText,
  isListeningVoice,
  interimVoiceText,
  error,
  onReadAloud,
  onQuestionChange,
  onAskQuestion,
  onToggleVoiceQuestion,
}) {
  const resultCardRef = useRef(null);
  const inputRef = useRef(null);

  // Focus the result card when new analysis arrives for screen-reader awareness
  useEffect(() => {
    if (analysisText && resultCardRef.current) {
      resultCardRef.current.focus();
    }
  }, [analysisText]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!questionText.trim() || isAnalyzing) return;
    onAskQuestion(questionText.trim());
  };

  return (
    <section aria-label="Visual Analysis Results and Follow-up Questions" className="w-full flex flex-col gap-6">
      {/* 1. Primary AI Description Card */}
      <div
        ref={resultCardRef}
        tabIndex={-1}
        className="w-full p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#161C26] border-2 border-blue-700 dark:border-blue-500 shadow-sm flex flex-col gap-4 focus:outline-none"
        role="region"
        aria-live="polite"
        aria-label="AI Visual Description"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
          <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-blue-800 dark:text-blue-400">
            AI Description
          </span>
          <span className="text-xs sm:text-sm font-semibold text-zinc-500 dark:text-zinc-400">
            Gemma AI
          </span>
        </div>

        {/* Large Readable Text (22px - 26px) */}
        <p className="text-xl sm:text-2xl font-bold leading-relaxed text-zinc-950 dark:text-white select-text">
          {analysisText}
        </p>

        {/* Read Aloud Button */}
        <button
          type="button"
          onClick={() => onReadAloud(analysisText)}
          className={`w-full min-h-[56px] px-6 py-3.5 rounded-xl font-bold text-lg sm:text-xl flex items-center justify-center gap-3 cursor-pointer transition-colors shadow-xs ${
            isSpeaking
              ? 'bg-rose-800 hover:bg-rose-900 text-white'
              : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-950 dark:text-white border-2 border-zinc-300 dark:border-zinc-700'
          }`}
          aria-label={isSpeaking ? 'Stop reading description aloud' : 'Read description aloud with voice synthesis'}
        >
          {isSpeaking ? (
            <>
              <VolumeX size={24} strokeWidth={2.2} aria-hidden="true" />
              <span>Stop Reading</span>
            </>
          ) : (
            <>
              <Volume2 size={24} strokeWidth={2.2} aria-hidden="true" />
              <span>Read Aloud</span>
            </>
          )}
        </button>
      </div>

      {/* Follow-up Conversation History if any */}
      {followUpHistory.length > 0 && (
        <div className="flex flex-col gap-3" role="region" aria-label="Previous Follow-up Questions and Answers">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <MessageSquare size={18} aria-hidden="true" />
            <span>Follow-up History</span>
          </h3>

          <div className="flex flex-col gap-3">
            {followUpHistory.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl bg-white dark:bg-[#161C26] border border-zinc-300 dark:border-zinc-700 flex flex-col gap-2"
              >
                <div className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                  You asked: <strong className="text-zinc-900 dark:text-zinc-100 font-bold">"{item.question}"</strong>
                </div>
                <p className="text-lg font-bold text-zinc-950 dark:text-white leading-relaxed">
                  {item.answer}
                </p>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => onReadAloud(item.answer)}
                    className="text-sm font-bold text-blue-800 dark:text-blue-400 flex items-center gap-1.5 hover:underline py-1 px-2 cursor-pointer"
                    aria-label={`Read answer aloud: ${item.answer}`}
                  >
                    <Volume2 size={16} aria-hidden="true" />
                    <span>Replay</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Alert if any */}
      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl border-2 border-red-400 dark:border-red-800 bg-red-50 dark:bg-red-950/50 text-red-900 dark:text-red-200 flex items-start gap-3"
        >
          <AlertCircle size={22} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1 text-base font-semibold">
            {error}
          </div>
        </div>
      )}

      {/* 2. Below the Result: Follow-up Questions Section */}
      <div className="w-full flex flex-col gap-3 pt-2">
        <div className="text-left">
          <h3 className="text-xl sm:text-2xl font-bold text-zinc-950 dark:text-white">
            Ask a Question
          </h3>
          <p className="text-base text-zinc-600 dark:text-zinc-300 mt-0.5">
            Ask any follow-up question about this same image.
          </p>
        </div>

        {/* Live speech feedback if user is speaking */}
        {isListeningVoice && (
          <div
            className="p-3.5 rounded-xl border-2 border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-950 dark:text-blue-200 flex items-center gap-3 text-base font-semibold animate-pulse"
            role="status"
            aria-live="polite"
          >
            <Mic size={22} className="text-blue-700 dark:text-blue-400 shrink-0" aria-hidden="true" />
            <span>{interimVoiceText || 'Listening... Speak your question now.'}</span>
          </div>
        )}

        {/* Follow-up Question Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full">
          {/* Question Text Input */}
          <div className="w-full">
            <label htmlFor="follow-up-input" className="sr-only">
              Type your follow-up question about the image
            </label>
            <input
              id="follow-up-input"
              ref={inputRef}
              type="text"
              value={questionText}
              onChange={(e) => onQuestionChange(e.target.value)}
              placeholder="e.g., What text is visible? Is the floor clear?"
              disabled={isAnalyzing}
              className="w-full min-h-[58px] px-4 py-3.5 rounded-xl border-2 border-zinc-400 dark:border-zinc-600 bg-white dark:bg-[#161C26] text-zinc-950 dark:text-white text-lg font-medium placeholder-zinc-500 dark:placeholder-zinc-400 focus:border-blue-700 dark:focus:border-blue-400 transition-colors shadow-xs"
            />
          </div>

          {/* Action Buttons: "Ask by Voice" & "Ask" */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
            {/* Microphone Button */}
            <button
              type="button"
              onClick={onToggleVoiceQuestion}
              disabled={isAnalyzing}
              className={`w-full min-h-[56px] px-4 py-3.5 rounded-xl font-bold text-lg flex items-center justify-center gap-2.5 cursor-pointer border-2 shadow-xs transition-colors ${
                isListeningVoice
                  ? 'bg-blue-100 dark:bg-blue-950 text-blue-900 dark:text-blue-200 border-blue-600 dark:border-blue-400 animate-pulse'
                  : 'bg-white dark:bg-[#161C26] text-zinc-900 dark:text-zinc-100 border-zinc-400 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
              aria-label={isListeningVoice ? 'Stop voice listening' : 'Ask question by voice using microphone'}
            >
              <Mic size={24} strokeWidth={2.2} className="text-blue-700 dark:text-blue-400" aria-hidden="true" />
              <span>{isListeningVoice ? 'Listening...' : 'Ask by Voice'}</span>
            </button>

            {/* Ask Button */}
            <button
              type="submit"
              disabled={!questionText.trim() || isAnalyzing}
              className="w-full min-h-[56px] px-6 py-3.5 rounded-xl bg-blue-800 hover:bg-blue-900 active:bg-blue-950 dark:bg-blue-700 dark:hover:bg-blue-800 text-white font-bold text-lg flex items-center justify-center gap-2.5 shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Submit question about image"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 size={22} className="animate-spin" aria-hidden="true" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Send size={22} strokeWidth={2.2} aria-hidden="true" />
                  <span>Ask</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
