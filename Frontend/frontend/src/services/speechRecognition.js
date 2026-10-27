/**
 * VisionMate Speech Recognition Service
 * Single recognition manager implementing:
 * - Internal state machine: 'idle' | 'starting' | 'running' | 'stopping'
 * - Watchdog timer (8s force-restart on dead silence)
 * - Configurable language (default 'en-US', tests with 'en-IN')
 * - Full alternative scanning (maxAlternatives = 5, interim + final)
 * - WAKE_ALIASES and Levenshtein <= 2 fuzzy matching
 * - Live logging to debugLogger
 */

import { debugLogger } from './debugLogger.js';

export let RECOGNITION_LANG = 'en-US';

export function setRecognitionLang(lang) {
  if (lang && typeof lang === 'string') {
    RECOGNITION_LANG = lang;
    debugLogger.updateState({ recLang: lang });
    debugLogger.log('rec:lang_changed', { lang });
  }
}

export const WAKE_ALIASES = [
  'hey mate',
  'hey mat',
  'hey matt',
  'hey met',
  'hey made',
  'hey mac',
  'hey mates',
  'a mate',
  'hi mate',
  'hey, mate',
  'hey mait',
  'hay mate',
  'he mate',
  'heymate',
  'ok mate',
  'okay mate',
  'yo mate',
  'mate',
  'mates',
];

export const DIRECT_COMMANDS = [
  'new scan',
  'scan again',
  'take photo',
  'take a photo',
  'take picture',
  'take a picture',
  'open camera',
  'another photo',
  'click photo',
  'repeat',
  'read again',
];

/**
 * Computes Levenshtein edit distance between two strings
 */
export function levenshteinDistance(a, b) {
  if (!a || !b) return (a || b || '').length;
  const al = a.length;
  const bl = b.length;
  const matrix = Array.from({ length: al + 1 }, () => new Array(bl + 1).fill(0));

  for (let i = 0; i <= al; i++) matrix[i][0] = i;
  for (let j = 0; j <= bl; j++) matrix[0][j] = j;

  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return matrix[al][bl];
}

/**
 * Normalizes text: lowercases and strips punctuation
 */
export function normalizeTranscript(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks a transcript string against WAKE_ALIASES and Levenshtein <= 2 fuzzy matching
 */
export function checkWakeWordMatch(rawTranscript) {
  if (!rawTranscript) return { matched: false };
  const normalized = normalizeTranscript(rawTranscript);
  if (!normalized) return { matched: false };

  // 1. Check direct commands first
  for (const cmd of DIRECT_COMMANDS) {
    if (normalized.includes(cmd)) {
      const idx = normalized.indexOf(cmd);
      const trailing = normalized.slice(idx + cmd.length).trim();
      return {
        matched: true,
        matchedAlias: cmd,
        matchType: 'direct_command',
        trailingSpeech: trailing,
        raw: rawTranscript,
      };
    }
  }

  // 2. Exact substring match against WAKE_ALIASES
  for (const alias of WAKE_ALIASES) {
    const cleanAlias = normalizeTranscript(alias);
    if (normalized.includes(cleanAlias)) {
      const idx = normalized.indexOf(cleanAlias);
      const trailing = normalized.slice(idx + cleanAlias.length).trim();
      return {
        matched: true,
        matchedAlias: alias,
        matchType: 'exact_alias',
        trailingSpeech: trailing,
        raw: rawTranscript,
      };
    }
  }

  // 3. Fuzzy match: Check words following prefix words ('hey', 'hi', 'a', 'hello', 'ok')
  const words = normalized.split(/\s+/);
  const prefixes = ['hey', 'hi', 'a', 'ay', 'hello', 'ok', 'okay'];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];

    // Check if current word itself is close to 'mate'
    if (levenshteinDistance(w, 'mate') <= 1 && w.length >= 3) {
      const trailing = words.slice(i + 1).join(' ').trim();
      return {
        matched: true,
        matchedAlias: `fuzzy:${w}`,
        matchType: 'fuzzy_mate',
        trailingSpeech: trailing,
        raw: rawTranscript,
      };
    }

    // Check if word follows a known greeting prefix: hey [word]
    if (prefixes.includes(w) && i + 1 < words.length) {
      const nextWord = words[i + 1];
      const dist = levenshteinDistance(nextWord, 'mate');
      if (dist <= 2) {
        const trailing = words.slice(i + 2).join(' ').trim();
        return {
          matched: true,
          matchedAlias: `hey ${nextWord} (dist=${dist})`,
          matchType: 'fuzzy_prefix',
          trailingSpeech: trailing,
          raw: rawTranscript,
        };
      }
    }
  }

  return { matched: false };
}

const SpeechRecognitionClass =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

class SpeechRecognitionManager {
  constructor() {
    this.recognition = null;
    this.state = 'idle'; // 'idle' | 'starting' | 'running' | 'stopping'
    this.mode = 'none'; // 'wake-word' | 'question' | 'none'
    this.wantedMode = 'none';
    this.callbacks = {};

    this.consecutiveRestarts = 0;
    this.lastEventTime = Date.now();
    this.lastWakeTime = 0;

    this.watchdogTimer = null;
    this.restartDelayTimer = null;

    this._initInstance();
  }

  isSupported() {
    return Boolean(SpeechRecognitionClass);
  }

  _initInstance() {
    if (!this.isSupported()) return;

    try {
      this.recognition = new SpeechRecognitionClass();
      this._wireEvents(this.recognition);
    } catch (err) {
      console.warn('SpeechRecognition instantiation error:', err);
      this.recognition = null;
    }
  }

  _wireEvents(rec) {
    if (!rec) return;

    rec.onstart = () => {
      this.state = 'running';
      this.lastEventTime = Date.now();
      debugLogger.updateState({ recStatus: 'running', recMode: this.mode });
      debugLogger.log('rec:start', { mode: this.mode, lang: rec.lang });
      if (this.callbacks.onListeningStateChange) {
        this.callbacks.onListeningStateChange(true);
      }
    };

    rec.onaudiostart = () => {
      this.lastEventTime = Date.now();
      debugLogger.log('rec:audiostart');
    };

    rec.onspeechstart = () => {
      this.lastEventTime = Date.now();
      debugLogger.log('rec:speechstart');
    };

    rec.onspeechend = () => {
      this.lastEventTime = Date.now();
      debugLogger.log('rec:speechend');
    };

    rec.onaudioend = () => {
      this.lastEventTime = Date.now();
      debugLogger.log('rec:audioend');
    };

    rec.onresult = (event) => {
      this.lastEventTime = Date.now();

      // Ignore incoming audio if app is speaking to prevent hearing itself
      if (this.callbacks.isAppSpeaking && this.callbacks.isAppSpeaking()) {
        debugLogger.log('rec:ignored_while_speaking');
        return;
      }

      if (this.mode === 'wake-word') {
        this._handleWakeResult(event);
      } else if (this.mode === 'question') {
        this._handleQuestionResult(event);
      }
    };

    rec.onerror = (event) => {
      this.lastEventTime = Date.now();
      const err = event.error;
      debugLogger.log('rec:error', { error: err, mode: this.mode, state: this.state });

      if (err === 'no-speech' || err === 'aborted') {
        // Routine during continuous passive listening
        return;
      }

      this.consecutiveRestarts += 1;
      debugLogger.updateState({ restartCount: this.consecutiveRestarts, errorMessage: err });

      if (err === 'not-allowed') {
        this.wantedMode = 'none';
        this.stop();
        if (this.callbacks.onError) {
          this.callbacks.onError({
            type: 'permission-denied',
            message: 'Microphone permission denied.',
          });
        }
        return;
      }

      if (this.callbacks.onError) {
        this.callbacks.onError({ type: err, message: `Recognition error: ${err}` });
      }
    };

    rec.onend = () => {
      this.state = 'idle';
      this.lastEventTime = Date.now();
      debugLogger.updateState({ recStatus: 'idle' });
      debugLogger.log('rec:end', { wantedMode: this.wantedMode });

      if (this.callbacks.onListeningStateChange) {
        this.callbacks.onListeningStateChange(false);
      }

      // If wake mode is still wanted, restart after 350-500ms delay
      if (this.wantedMode === 'wake-word') {
        this._scheduleRestart('onend_wake_wanted', 350);
      }
    };
  }

  _handleWakeResult(event) {
    let fullConcat = '';
    let foundMatch = null;

    // Scan all chunks and all alternatives
    for (let i = 0; i < event.results.length; ++i) {
      const res = event.results[i];
      if (res[0]) fullConcat += ' ' + res[0].transcript;

      for (let a = 0; a < res.length; ++a) {
        const transcript = res[a]?.transcript;
        const confidence = res[a]?.confidence || 0;
        if (transcript) {
          const match = checkWakeWordMatch(transcript);
          if (match.matched) {
            foundMatch = { ...match, confidence, isFinal: res.isFinal };
            break;
          }
        }
      }
      if (foundMatch) break;
    }

    if (!foundMatch && fullConcat) {
      const concatMatch = checkWakeWordMatch(fullConcat);
      if (concatMatch.matched) {
        foundMatch = { ...concatMatch, confidence: 0.8, isFinal: false };
      }
    }

    const latestIdx = event.resultIndex;
    const latestSnippet = event.results[latestIdx]?.[0]?.transcript || '';
    debugLogger.log('rec:result_wake', {
      snippet: latestSnippet,
      matched: Boolean(foundMatch),
      alias: foundMatch?.matchedAlias || null,
    });

    if (foundMatch && foundMatch.matched) {
      // 2-second wake debounce to prevent duplicate triggers
      const now = Date.now();
      if (now - this.lastWakeTime < 2000) {
        debugLogger.log('rec:wake_debounced', { timeSinceLast: now - this.lastWakeTime });
        return;
      }
      this.lastWakeTime = now;

      debugLogger.log('rec:wake_matched', {
        alias: foundMatch.matchedAlias,
        type: foundMatch.matchType,
        trailing: foundMatch.trailingSpeech,
      });

      // Stop wake mode cleanly and trigger callback
      this.stop();
      if (this.callbacks.onWake) {
        this.callbacks.onWake(foundMatch.trailingSpeech, foundMatch.matchedAlias);
      }
    }
  }

  _handleQuestionResult(event) {
    let interim = '';
    let final = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const res = event.results[i];
      if (res.isFinal) {
        final += res[0].transcript;
      } else {
        interim += res[0].transcript;
      }
    }

    debugLogger.log('rec:result_question', { interim, final });

    if (interim && this.callbacks.onInterim) {
      this.callbacks.onInterim(interim);
    }

    if (final && this.callbacks.onResult) {
      const clean = final.trim();
      this.stop();
      this.callbacks.onResult(clean);
    }
  }

  _scheduleRestart(reason, delayMs = 350) {
    clearTimeout(this.restartDelayTimer);
    debugLogger.updateState({ recStatus: 'restarting' });
    debugLogger.log('rec:restart_scheduled', { reason, delayMs });

    this.restartDelayTimer = setTimeout(() => {
      if (this.wantedMode === 'wake-word' && this.state === 'idle') {
        this._startInternal('wake-word');
      }
    }, delayMs);
  }

  _startWatchdog() {
    this._stopWatchdog();
    this.watchdogTimer = setInterval(() => {
      if (this.wantedMode === 'wake-word') {
        const elapsed = Date.now() - this.lastEventTime;
        if (elapsed > 8000) {
          debugLogger.log('rec:watchdog_triggered', { elapsed });
          // Force abort and start fresh
          try {
            this.recognition?.abort();
          } catch {}
          this.state = 'idle';
          this._scheduleRestart('watchdog_timeout', 150);
        }
      }
    }, 2000);
  }

  _stopWatchdog() {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  _startInternal(mode) {
    if (!this.isSupported() || !this.recognition) return;

    if (this.state !== 'idle') {
      debugLogger.log('rec:start_skipped_not_idle', { state: this.state });
      return;
    }

    this.state = 'starting';
    this.mode = mode;
    this.lastEventTime = Date.now();
    debugLogger.updateState({ recStatus: 'starting', recMode: mode, recLang: RECOGNITION_LANG });

    this.recognition.continuous = mode === 'wake-word';
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = mode === 'wake-word' ? 5 : 2;
    this.recognition.lang = RECOGNITION_LANG;

    try {
      this.recognition.start();
      if (mode === 'wake-word') {
        this._startWatchdog();
      }
    } catch (err) {
      console.warn('Recognition start exception:', err);
      debugLogger.log('rec:start_exception', { message: err.message, name: err.name });
      this.state = 'idle';
      if (this.wantedMode === 'wake-word') {
        this._scheduleRestart('start_exception', 800);
      }
    }
  }

  /**
   * Public: Starts passive wake-word listening ("Hey mate")
   */
  startWakeWordMode({ onWake, onError, onListeningStateChange, isAppSpeaking }) {
    if (!this.isSupported()) {
      if (onError) onError({ type: 'unsupported', message: 'SpeechRecognition not supported' });
      return;
    }

    this.wantedMode = 'wake-word';
    this.callbacks = { onWake, onError, onListeningStateChange, isAppSpeaking };
    this.consecutiveRestarts = 0;

    clearTimeout(this.restartDelayTimer);

    if (this.state === 'running' && this.mode === 'wake-word') {
      // Already running wake-word mode cleanly
      debugLogger.log('rec:already_running_wake');
      return;
    }

    this.stop();
    // Start after clean stop
    setTimeout(() => {
      if (this.wantedMode === 'wake-word') {
        this._startInternal('wake-word');
      }
    }, 150);
  }

  /**
   * Public: Starts single-utterance question capture
   */
  startQuestionMode({ onResult, onInterim, onError, isAppSpeaking }) {
    if (!this.isSupported()) {
      if (onError) onError({ type: 'unsupported', message: 'SpeechRecognition not supported' });
      return;
    }

    this.wantedMode = 'question';
    this.callbacks = { onResult, onInterim, onError, isAppSpeaking };
    this._stopWatchdog();
    clearTimeout(this.restartDelayTimer);

    this.stop();
    setTimeout(() => {
      if (this.wantedMode === 'question') {
        this._startInternal('question');
      }
    }, 150);
  }

  /**
   * Public: Fully stops speech recognition
   */
  stop() {
    this.wantedMode = 'none';
    this._stopWatchdog();
    clearTimeout(this.restartDelayTimer);

    if (this.recognition && (this.state === 'running' || this.state === 'starting')) {
      this.state = 'stopping';
      debugLogger.updateState({ recStatus: 'stopping' });
      try {
        this.recognition.abort();
      } catch {}
    } else {
      this.state = 'idle';
      debugLogger.updateState({ recStatus: 'idle' });
    }
  }
}

export const speechRecognitionService = new SpeechRecognitionManager();
