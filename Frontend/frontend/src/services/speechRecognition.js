/**
 * VisionMate Speech Recognition Service
 * Single recognition manager implementing:
 * - Bilingual support: English ('en-IN') and Tamil ('ta-IN')
 * - Single controlled SpeechRecognition instance via stable manager
 * - Tamil Unicode script detection safeguard (/[\u0B80-\u0BFF]/)
 * - Microphone permission check & request helper (navigator.mediaDevices.getUserMedia)
 * - Safe cancellation of speechSynthesis before microphone opens
 * - Robust handling of interim, final, and silence events
 * - Duplicate submission prevention
 * - Live logging to debugLogger and browser console
 */

import { debugLogger } from './debugLogger.js';

export let RECOGNITION_LANG = 'en-IN';

export function setRecognitionLang(lang) {
  if (lang && typeof lang === 'string') {
    // Normalize to 'ta-IN' or 'en-IN'
    const normalized = lang.startsWith('ta') ? 'ta-IN' : 'en-IN';
    RECOGNITION_LANG = normalized;
    debugLogger.updateState({ recLang: normalized });
    debugLogger.log('rec:lang_changed', { lang: normalized });
  }
}

export function detectLanguage(text, defaultLang = 'en') {
  if (text && /[\u0B80-\u0BFF]/.test(text)) {
    return 'ta';
  }
  return (defaultLang || 'en').startsWith('ta') ? 'ta' : 'en';
}

export const WAKE_WORD = 'Hey Mate';

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
  'hello mate',
  'hey, mate',
  'hey mait',
  'hay mate',
  'he mate',
  'heymate',
  'ok mate',
  'okay mate',
  'ay mate',
  'yo mate',
  'hey mike',
  'hey main',
  'hey make',
  'hey may',
  'hey mitt',
  'mate',
  'mates',
  // Tamil wake words / greetings
  'வணக்கம்',
  'வணக்கம் மேட்',
  'ஹே மேட்',
  'மேட்',
  'ஹலோ',
  'ஹலோ மேட்',
];

export const DIRECT_COMMANDS = [
  // English commands
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
  'say that again',
  // Tamil direct commands
  'புதிய படம்',
  'புதிய ஸ்கேன்',
  'படம் எடு',
  'மறுபடியும் ஸ்கேன்',
  'மீண்டும் சொல்',
  'மறுபடியும் சொல்',
];

/**
 * Checks if a transcript is a friendly greeting (e.g. "Hi", "Hello", "வணக்கம்")
 */
export function isGreeting(text) {
  if (!text || typeof text !== 'string') return false;
  const clean = text.toLowerCase().trim().replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, '');
  return (
    clean === 'hi' ||
    clean === 'hello' ||
    clean === 'hey' ||
    clean === 'hi mate' ||
    clean === 'hello mate' ||
    clean === 'hey mate' ||
    clean === 'வணக்கம்' ||
    clean === 'ஹலோ' ||
    clean === 'வணக்கம் மேட்'
  );
}

let micPermissionGrantedCache = false;

/**
 * Checks microphone hardware and permissions via navigator.mediaDevices.getUserMedia
 * Caches granted state to avoid repeatedly opening/closing audio hardware tracks before SpeechRecognition
 */
export async function requestMicrophonePermission() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return {
      status: 'unsupported',
      message: 'Voice recognition is not supported in this browser. Please use a supported browser or type your question.',
    };
  }

  // If already confirmed granted, return immediately without locking hardware
  if (micPermissionGrantedCache) {
    return { status: 'granted' };
  }

  // Check Permissions API if supported
  if (typeof navigator.permissions !== 'undefined' && navigator.permissions.query) {
    try {
      const permStatus = await navigator.permissions.query({ name: 'microphone' });
      if (permStatus.state === 'granted') {
        micPermissionGrantedCache = true;
        if (speechRecognitionService) speechRecognitionService.isPermissionDenied = false;
        return { status: 'granted' };
      }
      if (permStatus.state === 'denied') {
        if (speechRecognitionService) speechRecognitionService.isPermissionDenied = true;
        return { status: 'denied', message: 'Microphone permission is required for voice input.' };
      }
    } catch {
      // Permissions query for microphone not supported on all browsers; proceed to getUserMedia
    }
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop tracks immediately after testing access
    stream.getTracks().forEach((track) => track.stop());
    micPermissionGrantedCache = true;
    if (speechRecognitionService) {
      speechRecognitionService.isPermissionDenied = false;
    }
    // Allow brief buffer for Windows audio device to cleanly release
    await new Promise((resolve) => setTimeout(resolve, 150));
    return { status: 'granted' };
  } catch (err) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      if (speechRecognitionService) speechRecognitionService.isPermissionDenied = true;
      return { status: 'denied', message: 'Microphone permission is required for voice input.' };
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      return { status: 'no_device', message: 'No microphone was found on this device.' };
    }
    if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      return { status: 'in_use', message: 'Microphone is already in use by another application.' };
    }
    return { status: 'error', message: err.message || 'Microphone access failed.' };
  }
}

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
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
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
 * Checks a transcript string against WAKE_ALIASES and direct commands
 */
export function checkWakeWordMatch(rawTranscript) {
  if (!rawTranscript) return { matched: false };
  const normalized = normalizeTranscript(rawTranscript);
  if (!normalized) return { matched: false };

  // 1. Check direct commands first (both English and Tamil)
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

export class SpeechRecognitionManager {
  constructor() {
    this.recognition = null;
    this.state = 'idle'; // 'idle' | 'starting' | 'running' | 'stopping'
    this.mode = 'none'; // 'wake-word' | 'question' | 'none'
    this.wantedMode = 'none';
    this.callbacks = {};

    this.consecutiveRestarts = 0;
    this.lastEventTime = Date.now();
    this.lastWakeTime = 0;

    this.questionSubmitted = false;
    this.latestQuestionTranscript = '';
    this.isPermissionDenied = false;
    this.hasRetriedNetwork = false;

    this.watchdogTimer = null;
    this.restartDelayTimer = null;
    this.transitionTimer = null;

    this.currentStatus = {
      state: 'ready',
      message: '',
      transcript: '',
    };
  }

  isSupported() {
    return Boolean(SpeechRecognitionClass);
  }

  _updateStatus(statusState, details = {}) {
    this.currentStatus = {
      state: statusState,
      message: details.message || '',
      transcript: details.transcript || '',
    };

    debugLogger.updateState({
      micStatusState: statusState,
      micStatusMessage: details.message || '',
      micTranscript: details.transcript || '',
      recStatus: statusState === 'listening' ? 'running' : statusState,
    });

    if (this.callbacks.onStatusChange) {
      try {
        this.callbacks.onStatusChange(this.currentStatus);
      } catch (err) {
        console.warn('Error in onStatusChange callback:', err);
      }
    }
  }

  _cleanupSession() {
    this._stopWatchdog();
    clearTimeout(this.restartDelayTimer);
    clearTimeout(this.transitionTimer);

    if (this.recognition) {
      try {
        // Disconnect all event listeners immediately so old instance cannot fire ghost events
        this.recognition.onstart = null;
        this.recognition.onaudiostart = null;
        this.recognition.onsoundstart = null;
        this.recognition.onspeechstart = null;
        this.recognition.onspeechend = null;
        this.recognition.onsoundend = null;
        this.recognition.onaudioend = null;
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.abort();
      } catch {}
      this.recognition = null;
    }

    this.state = 'idle';
  }

  _wireEvents(rec) {
    if (!rec) return;

    rec.onstart = () => {
      this.state = 'running';
      this.lastEventTime = Date.now();
      console.log('Speech recognition started successfully in mode:', this.mode, 'lang:', rec.lang);
      debugLogger.log('rec:start', { mode: this.mode, lang: rec.lang });

      // Signal 'listening' ONLY when recognition has actually started
      this._updateStatus('listening', {
        message: RECOGNITION_LANG.startsWith('ta') ? 'கேட்கிறது…' : 'Listening…',
      });

      if (this.callbacks.onListeningStateChange) {
        this.callbacks.onListeningStateChange(true);
      }
    };

    rec.onaudiostart = () => {
      this.lastEventTime = Date.now();
      debugLogger.log('rec:audiostart');
    };

    rec.onsoundstart = () => {
      this.lastEventTime = Date.now();
      debugLogger.log('rec:soundstart');
    };

    rec.onspeechstart = () => {
      this.lastEventTime = Date.now();
      console.log('Speech detected (onspeechstart)');
      debugLogger.log('rec:speechstart');

      // State: Hearing your voice…
      this._updateStatus('hearing_voice', {
        message: RECOGNITION_LANG.startsWith('ta') ? 'குரல் கேட்கிறது…' : 'Hearing your voice…',
        transcript: this.latestQuestionTranscript || '',
      });
    };

    rec.onspeechend = () => {
      this.lastEventTime = Date.now();
      debugLogger.log('rec:speechend');
    };

    rec.onsoundend = () => {
      this.lastEventTime = Date.now();
      debugLogger.log('rec:soundend');
    };

    rec.onaudioend = () => {
      this.lastEventTime = Date.now();
      debugLogger.log('rec:audioend');
    };

    rec.onresult = (event) => {
      this.lastEventTime = Date.now();

      // In wake-word passive mode, ignore speech if TTS is reading an answer
      const isSpeaking =
        (this.callbacks.isAppSpeaking && this.callbacks.isAppSpeaking()) ||
        (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking);

      if (this.mode === 'wake-word' && isSpeaking) {
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
      console.warn('Speech recognition error event:', err, 'mode:', this.mode);
      debugLogger.log('rec:error', { error: err, mode: this.mode, state: this.state });

      const isTa = RECOGNITION_LANG.startsWith('ta');

      // 1. Permission Denied
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        this.isPermissionDenied = true;
        this.wantedMode = 'none';
        this._cleanupSession();

        const errMsg = isTa
          ? 'மைக்ரோஃபோன் அனுமதி மறுக்கப்பட்டது. உலாவி அமைப்புகளில் அனுமதியை வழங்கவும்.'
          : 'Microphone permission was denied. Please allow microphone access in your browser settings.';

        this._updateStatus('error', { message: errMsg });
        if (this.callbacks.onError) {
          this.callbacks.onError({ type: 'not-allowed', message: errMsg });
        }
        return;
      }

      // 2. Question Mode specific errors
      if (this.mode === 'question') {
        if (err === 'no-speech') {
          // If speech was previously captured before silence timeout, submit captured text!
          if (!this.questionSubmitted && this.latestQuestionTranscript && this.latestQuestionTranscript.trim()) {
            const clean = this.latestQuestionTranscript.trim();
            this.questionSubmitted = true;
            this._updateStatus('processing', {
              transcript: clean,
              message: isTa ? 'செயலாக்குகிறது…' : 'Processing…',
            });
            this.stop();
            if (this.callbacks.onResult) {
              this.callbacks.onResult(clean);
            }
            return;
          }

          // Honest error handling: NO text was captured, do NOT invent fake questions!
          const errMsg = isTa
            ? 'பேச்சு எதுவும் கண்டறியப்படவில்லை. மீண்டும் பேசவும்.'
            : 'No speech detected. Please speak into your microphone.';

          this._updateStatus('error', { message: errMsg });
          if (this.callbacks.onError) {
            this.callbacks.onError({ type: 'no-speech', message: errMsg });
          }
          return;
        }

        if (err === 'audio-capture') {
          const errMsg = isTa
            ? 'மைக்ரோஃபோன் கிடைக்கவில்லை அல்லது பிற பயன்பாட்டில் உள்ளது.'
            : 'Microphone unavailable or already in use by another application.';
          this._updateStatus('error', { message: errMsg });
          if (this.callbacks.onError) {
            this.callbacks.onError({ type: 'audio-capture', message: errMsg });
          }
          return;
        }

        if (err === 'network') {
          // Check if this was a transient socket collision or temporary server glitch
          if (!this.hasRetriedNetwork && this.mode === 'question') {
            this.hasRetriedNetwork = true;
            console.log('Transient network error encountered in question mode, retrying with fresh socket in 300ms...');
            this._cleanupSession();
            clearTimeout(this.transitionTimer);
            this.transitionTimer = setTimeout(() => {
              if (this.wantedMode === 'question') {
                this._startInternal('question');
              }
            }, 300);
            return;
          }

          const isBrave =
            typeof navigator !== 'undefined' &&
            (Boolean(navigator.brave) || navigator.userAgent?.includes('Brave'));

          let errMsg = isTa
            ? 'குரல் அறிதலுக்கான நெட்வொர்க் பிழை. இணைய இணைப்பை சரிபார்க்கவும் அல்லது Chrome பயன்படுத்தவும்.'
            : 'Speech recognition network error. Please check your internet connection.';

          if (isBrave) {
            errMsg = isTa
              ? 'Brave உலாவி Google Speech-ஐ முடக்குகிறது. Chrome பயன்படுத்தவும் அல்லது Settings-ல் Google Services இயக்கவும்.'
              : 'Brave browser blocks Google Speech. Please use Google Chrome or enable Google services in Brave settings.';
          }

          this._updateStatus('error', { message: errMsg });
          if (this.callbacks.onError) {
            this.callbacks.onError({ type: 'network', message: errMsg });
          }
          return;
        }

        if (err === 'aborted') {
          // Explicitly stopped by user or transition
          return;
        }

        const errMsg = isTa ? `குரல் அறிதல் பிழை: ${err}` : `Recognition error: ${err}`;
        this._updateStatus('error', { message: errMsg });
        if (this.callbacks.onError) {
          this.callbacks.onError({ type: err, message: errMsg });
        }
        return;
      }

      // 3. Wake-word passive mode error handling
      if (err === 'no-speech' || err === 'aborted') {
        return;
      }

      this.consecutiveRestarts += 1;
      debugLogger.updateState({ restartCount: this.consecutiveRestarts, errorMessage: err });

      if (this.callbacks.onError) {
        this.callbacks.onError({ type: err, message: `Recognition error: ${err}` });
      }
    };

    rec.onend = () => {
      this.state = 'idle';
      this.lastEventTime = Date.now();
      console.log('Speech recognition session ended. Wanted mode:', this.wantedMode);
      debugLogger.log('rec:end', { wantedMode: this.wantedMode });

      if (this.callbacks.onListeningStateChange) {
        this.callbacks.onListeningStateChange(false);
      }

      // If in question mode and recognition ended before explicit final event was delivered,
      // deliver accumulated transcript as fallback so the user voice is never lost!
      if (this.mode === 'question' && !this.questionSubmitted) {
        if (this.latestQuestionTranscript && this.latestQuestionTranscript.trim()) {
          const clean = this.latestQuestionTranscript.trim();
          this.questionSubmitted = true;
          console.log('Final transcript delivered from end fallback:', clean);
          const isTa = RECOGNITION_LANG.startsWith('ta');
          this._updateStatus('processing', {
            transcript: clean,
            message: isTa ? 'செயலாக்குகிறது…' : 'Processing…',
          });
          if (this.callbacks.onResult) {
            this.callbacks.onResult(clean);
          }
          return;
        }
      }

      // If recognition ended and was not in an error or processing state, reset to ready
      if (
        this.currentStatus.state !== 'error' &&
        this.currentStatus.state !== 'processing' &&
        this.wantedMode === 'none'
      ) {
        const isTa = RECOGNITION_LANG.startsWith('ta');
        this._updateStatus('ready', {
          message: isTa ? 'தயாராக உள்ளது' : 'Ready',
        });
      }

      // If wake mode is still wanted, schedule restart after small delay
      if (this.wantedMode === 'wake-word' && !this.isPermissionDenied) {
        this._scheduleRestart('onend_wake_wanted', 350);
      }
    };
  }

  _handleWakeResult(event) {
    let fullConcat = '';
    let foundMatch = null;

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

    if (foundMatch && foundMatch.matched) {
      const now = Date.now();
      if (now - this.lastWakeTime < 2000) {
        return;
      }
      this.lastWakeTime = now;

      debugLogger.log('rec:wake_matched', {
        alias: foundMatch.matchedAlias,
        type: foundMatch.matchType,
        trailing: foundMatch.trailingSpeech,
      });

      this.stop();
      if (this.callbacks.onWake) {
        this.callbacks.onWake(foundMatch.trailingSpeech, foundMatch.matchedAlias);
      }
    }
  }

  _handleQuestionResult(event) {
    let interim = '';
    let final = '';

    for (let i = 0; i < event.results.length; ++i) {
      const res = event.results[i];
      if (res.isFinal) {
        final += res[0].transcript;
      } else {
        interim += res[0].transcript;
      }
    }

    const currentText = (final || interim).trim();
    if (currentText) {
      this.latestQuestionTranscript = currentText;
    }

    console.log('Speech results - Interim:', interim, 'Final:', final);
    debugLogger.log('rec:result_question', { interim, final });

    const isTa = RECOGNITION_LANG.startsWith('ta');

    // Live interim words update
    if (currentText) {
      this._updateStatus('recognized', {
        transcript: currentText,
        message: isTa ? 'அறியப்பட்ட உரை' : 'Recognized text',
      });
    }

    if (interim && this.callbacks.onInterim) {
      this.callbacks.onInterim(interim);
    }

    if (final) {
      const clean = final.trim();
      console.log('Final speech recognized:', clean);
      if (clean && !this.questionSubmitted) {
        this.questionSubmitted = true;
        this._updateStatus('processing', {
          transcript: clean,
          message: isTa ? 'செயலாக்குகிறது…' : 'Processing…',
        });
        this.stop();
        if (this.callbacks.onResult) {
          this.callbacks.onResult(clean);
        }
      }
    }
  }

  _scheduleRestart(reason, delayMs = 350) {
    clearTimeout(this.restartDelayTimer);
    debugLogger.updateState({ recStatus: 'restarting' });

    this.restartDelayTimer = setTimeout(() => {
      if (this.wantedMode === 'wake-word' && !this.isPermissionDenied) {
        this._startInternal('wake-word');
      }
    }, delayMs);
  }

  _startWatchdog() {
    this._stopWatchdog();
    this.watchdogTimer = setInterval(() => {
      if (this.wantedMode === 'wake-word') {
        const elapsed = Date.now() - this.lastEventTime;
        if (elapsed > 10000) {
          try {
            this.recognition?.abort();
          } catch {}
          this._scheduleRestart('watchdog_timeout', 150);
        }
      }
    }, 2500);
  }

  _stopWatchdog() {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  _startInternal(mode) {
    if (!this.isSupported()) {
      const isTa = RECOGNITION_LANG.startsWith('ta');
      const msg = isTa
        ? 'இந்த உலாவியில் குரல் அறிதல் ஆதரிக்கப்படவில்லை. Chrome அல்லது Edge பயன்படுத்தவும்.'
        : 'Voice recognition is not supported in this browser. Please use Chrome or Edge.';
      this._updateStatus('error', { message: msg });
      if (this.callbacks.onError) {
        this.callbacks.onError({ type: 'unsupported', message: msg });
      }
      return;
    }

    // Always clean up any previous instance and listeners before creating a fresh instance
    this._cleanupSession();

    // Cancel any active browser speech synthesis
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }

    this.state = 'starting';
    this.mode = mode;
    this.lastEventTime = Date.now();
    this.questionSubmitted = false;
    this.latestQuestionTranscript = '';

    debugLogger.updateState({ recStatus: 'starting', recMode: mode, recLang: RECOGNITION_LANG });

    try {
      // Create fresh instance for this session to prevent InvalidStateError and zombie events
      const rec = new SpeechRecognitionClass();
      this.recognition = rec;

      rec.continuous = mode === 'wake-word';
      rec.interimResults = true;
      rec.maxAlternatives = mode === 'wake-word' ? 5 : 1;
      rec.lang = RECOGNITION_LANG;

      this._wireEvents(rec);

      rec.start();

      if (mode === 'wake-word') {
        this._startWatchdog();
      }
    } catch (err) {
      console.warn('Recognition start exception:', err);
      this.state = 'idle';
      const isTa = RECOGNITION_LANG.startsWith('ta');
      const errMsg = isTa
        ? `மைக்ரோஃபோனைத் தொடங்குவதில் பிழை: ${err.message || 'அனுமதியை சரிபார்க்கவும்'}`
        : (err.message || 'Microphone start failed. Please check permissions.');

      this._updateStatus('error', { message: errMsg });

      if (this.wantedMode === 'wake-word') {
        this._scheduleRestart('start_exception', 1000);
      } else if (this.wantedMode === 'question') {
        if (this.callbacks.onError) {
          this.callbacks.onError({
            type: 'start_failed',
            message: errMsg,
          });
        }
      }
    }
  }

  /**
   * Public: Explicitly configures recognition language ('en-IN' or 'ta-IN')
   */
  setLang(lang) {
    setRecognitionLang(lang);
    if (this.recognition) {
      try {
        this.recognition.lang = RECOGNITION_LANG;
      } catch {}
    }
  }

  /**
   * Public: Starts passive wake-word listening ("Hey mate")
   */
  startWakeWordMode({ onWake, onError, onListeningStateChange, onStatusChange, isAppSpeaking } = {}) {
    if (!this.isSupported()) {
      const isTa = RECOGNITION_LANG.startsWith('ta');
      const msg = isTa
        ? 'இந்த உலாவியில் குரல் அறிதல் ஆதரிக்கப்படவில்லை. Chrome அல்லது Edge பயன்படுத்தவும்.'
        : 'Voice recognition is not supported in this browser. Please use Chrome or Edge.';
      this._updateStatus('error', { message: msg });
      if (onError) onError({ type: 'unsupported', message: msg });
      return;
    }

    this.wantedMode = 'wake-word';
    this.callbacks = { onWake, onError, onListeningStateChange, onStatusChange, isAppSpeaking };
    this.consecutiveRestarts = 0;
    this.hasRetriedNetwork = false;

    if (this.state === 'running' && this.mode === 'wake-word') {
      return;
    }

    this._cleanupSession();

    clearTimeout(this.transitionTimer);
    this.transitionTimer = setTimeout(() => {
      if (this.wantedMode === 'wake-word' && !this.isPermissionDenied) {
        this._startInternal('wake-word');
      }
    }, 180);
  }

  /**
   * Public: Starts single-utterance question capture
   */
  startQuestionMode({ onResult, onInterim, onError, onStatusChange, isAppSpeaking } = {}) {
    if (!this.isSupported()) {
      const isTa = RECOGNITION_LANG.startsWith('ta');
      const msg = isTa
        ? 'இந்த உலாவியில் குரல் அறிதல் ஆதரிக்கப்படவில்லை. Chrome அல்லது Edge பயன்படுத்தவும்.'
        : 'Voice recognition is not supported in this browser. Please use Chrome or Edge.';
      this._updateStatus('error', { message: msg });
      if (onError) onError({ type: 'unsupported', message: msg });
      return;
    }

    this.wantedMode = 'question';
    this.callbacks = { onResult, onInterim, onError, onStatusChange, isAppSpeaking };
    this.hasRetriedNetwork = false;

    this._cleanupSession();

    clearTimeout(this.transitionTimer);
    this.transitionTimer = setTimeout(() => {
      if (this.wantedMode === 'question') {
        this._startInternal('question');
      }
    }, 180);
  }

  /**
   * Public: Fully stops speech recognition
   */
  stop() {
    this.wantedMode = 'none';
    this._cleanupSession();
    const isTa = RECOGNITION_LANG.startsWith('ta');
    this._updateStatus('ready', {
      message: isTa ? 'தயாராக உள்ளது' : 'Ready',
    });
  }
}

export const speechRecognitionService = new SpeechRecognitionManager();

