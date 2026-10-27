/**
 * VisionMate Speech Synthesis Service
 * Provides robust Promise-based speech synthesis with:
 * - Chunking long utterances into sentences under 180 chars to avoid mobile Chrome stalls
 * - Fallback timer based on text length (~70ms/char + 1000ms)
 * - Periodic polling of window.speechSynthesis.speaking
 * - Unified speakThenResume helper
 * - Live state reporting to debugLogger
 */

import { debugLogger } from './debugLogger.js';

let _activeUtterance = null;
let _isSpeaking = false;

/**
 * Splits text into sentences or clause chunks under maxLength characters
 */
export function splitTextIntoChunks(text, maxLength = 180) {
  if (!text || typeof text !== 'string') return [];
  const clean = text.trim();
  if (clean.length <= maxLength) return [clean];

  // Match sentence fragments ending with punctuation (. ! ? ; ,) or spaces
  const regex = /[^.!?]+[.!?]+|[^.!?]+$/g;
  const rawSentences = clean.match(regex) || [clean];
  const chunks = [];

  for (let sentence of rawSentences) {
    sentence = sentence.trim();
    if (!sentence) continue;

    if (sentence.length <= maxLength) {
      chunks.push(sentence);
    } else {
      // Further split long sentences by words
      const words = sentence.split(/\s+/);
      let currentChunk = '';

      for (const word of words) {
        if ((currentChunk + ' ' + word).trim().length <= maxLength) {
          currentChunk = (currentChunk + ' ' + word).trim();
        } else {
          if (currentChunk) chunks.push(currentChunk);
          currentChunk = word;
        }
      }
      if (currentChunk) chunks.push(currentChunk);
    }
  }

  return chunks.length > 0 ? chunks : [clean];
}

export const SpeechSynthesizer = {
  isSupported() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  },

  isSpeaking() {
    return _isSpeaking || (this.isSupported() && window.speechSynthesis.speaking);
  },

  stop() {
    if (this.isSupported()) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
      _activeUtterance = null;
      _isSpeaking = false;
      debugLogger.updateState({ speechSynthSpeaking: false });
      debugLogger.log('tts:stop', { reason: 'manual_or_preempt' });
    }
  },

  /**
   * Speaks a single short utterance (< 180 chars) with triple-safe resolution:
   * 1. utterance.onend
   * 2. text-length timeout: (len * 70ms) + 1000ms
   * 3. periodic polling of speechSynthesis.speaking
   */
  _speakChunk(chunk, options = {}) {
    return new Promise((resolve) => {
      if (!this.isSupported() || !chunk) {
        resolve();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.rate = options.rate || 1.0;
      utterance.pitch = options.pitch || 1.0;

      // Detect language: explicit options.lang or Tamil Unicode characters
      const isTamil =
        options.lang === 'ta' ||
        options.lang === 'ta-IN' ||
        /[\u0B80-\u0BFF]/.test(chunk);

      utterance.lang = isTamil ? 'ta-IN' : 'en-IN';

      // Select voice: prioritize language-specific voices
      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        let preferred = null;
        if (isTamil) {
          preferred =
            voices.find(
              (v) =>
                v.lang === 'ta-IN' ||
                v.lang.startsWith('ta') ||
                v.lang.toLowerCase().includes('tamil') ||
                v.name.toLowerCase().includes('tamil')
            ) ||
            voices.find((v) => v.lang.startsWith('en')) ||
            voices[0];
        } else {
          preferred =
            voices.find(
              (v) =>
                (v.lang === 'en-IN' || v.lang.startsWith('en')) &&
                (v.name.includes('Natural') ||
                  v.name.includes('Google') ||
                  v.name.includes('Samantha') ||
                  v.name.includes('Jenny') ||
                  v.name.includes('Guy'))
            ) ||
            voices.find((v) => v.lang === 'en-IN') ||
            voices.find((v) => v.lang.startsWith('en')) ||
            voices[0];
        }
        if (preferred) utterance.voice = preferred;
      }

      let isDone = false;
      let pollTimer = null;
      let fallbackTimer = null;

      const cleanupAndResolve = (reason) => {
        if (isDone) return;
        isDone = true;
        clearInterval(pollTimer);
        clearTimeout(fallbackTimer);
        _activeUtterance = null;
        debugLogger.log('tts:chunk_end', { chunk: chunk.slice(0, 30), reason });
        resolve();
      };

      // Fallback timer: 70ms per character plus 1000ms padding
      const maxDuration = Math.max(1200, chunk.length * 70 + 1000);
      fallbackTimer = setTimeout(() => {
        cleanupAndResolve('fallback_timeout');
      }, maxDuration);

      // Polling timer: check every 150ms if speech synthesis stopped
      let hasStarted = false;
      pollTimer = setInterval(() => {
        if (hasStarted && !window.speechSynthesis.speaking) {
          cleanupAndResolve('poll_speaking_false');
        }
      }, 150);

      utterance.onstart = () => {
        hasStarted = true;
        _isSpeaking = true;
        debugLogger.updateState({ speechSynthSpeaking: true });
        debugLogger.log('tts:chunk_start', { chunk: chunk.slice(0, 30) });
      };

      utterance.onend = () => {
        cleanupAndResolve('native_onend');
      };

      utterance.onerror = (e) => {
        cleanupAndResolve(`error_${e.error || 'unknown'}`);
      };

      _activeUtterance = utterance;
      try {
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn('SpeechSynthesis.speak failed:', err);
        cleanupAndResolve('speak_exception');
      }
    });
  },

  /**
   * Speaks the full text by splitting into manageable sentences,
   * avoiding mobile Chrome speech stalls.
   */
  async speak(text, options = {}) {
    if (!this.isSupported() || !text || !text.trim()) {
      return;
    }

    this.stop();
    _isSpeaking = true;
    debugLogger.updateState({ speechSynthSpeaking: true });
    debugLogger.log('tts:start_full', { textLength: text.length });

    if (options.onStart) {
      options.onStart();
    }

    const chunks = splitTextIntoChunks(text, 180);

    for (let i = 0; i < chunks.length; i++) {
      if (!_isSpeaking && i > 0) {
        // Was stopped externally
        break;
      }
      await this._speakChunk(chunks[i], options);
    }

    _isSpeaking = false;
    debugLogger.updateState({ speechSynthSpeaking: false });
    debugLogger.log('tts:end_full', { textLength: text.length });

    if (options.onEnd) {
      options.onEnd();
    }
  },

  /**
   * Helper: pauses recognition before speech, speaks text cleanly,
   * then resumes recognition after speech completely finishes.
   */
  async speakThenResume(text, { onStart, onComplete } = {}) {
    if (onStart) onStart();
    await this.speak(text);
    if (onComplete) onComplete();
  },
};
