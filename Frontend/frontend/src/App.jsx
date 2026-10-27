import React, { useReducer, useEffect, useCallback, useRef, useState } from 'react';
import {
  FLOW_STATES,
  FLOW_ACTIONS,
  initialFlowState,
  flowReducer,
} from './state/machine.js';

import { analyzeImage, askFollowUp } from './services/api.js';
import { SpeechSynthesizer } from './services/speechSynthesis.js';
import {
  speechRecognitionService,
  isGreeting,
  requestMicrophonePermission,
} from './services/speechRecognition.js';
import { debugLogger } from './services/debugLogger.js';
import { unlockAudio, playWakeChime, triggerHaptic } from './utils/sound.js';

import { SplashScreen } from './components/SplashScreen.jsx';
import { HomeSpeakView } from './components/HomeSpeakView.jsx';
import { CameraCountdownView } from './components/CameraCountdownView.jsx';
import { WaveformAskView } from './components/WaveformAskView.jsx';
import { ProcessingScanView } from './components/ProcessingScanView.jsx';
import { AnswerStandbyView } from './components/AnswerStandbyView.jsx';
import { DebugPanel } from './components/DebugPanel.jsx';

export function App() {
  const [state, dispatch] = useReducer(flowReducer, initialFlowState);
  const [isListeningWake, setIsListeningWake] = useState(false);
  const [wakeError, setWakeError] = useState(null);
  const [restartCount, setRestartCount] = useState(0);
  const [currentLang, setCurrentLang] = useState('en');
  const [isAudioBlocked, setIsAudioBlocked] = useState(false);
  const [wakeWordEnabled, setWakeWordEnabled] = useState(true);
  const [isSpeakingState, setIsSpeakingState] = useState(false);
  const [micStatus, setMicStatus] = useState({
    state: 'ready',
    message: '',
    transcript: '',
  });

  const wakeWordEnabledRef = useRef(true);
  useEffect(() => {
    wakeWordEnabledRef.current = wakeWordEnabled;
  }, [wakeWordEnabled]);

  const currentLangRef = useRef('en');
  useEffect(() => {
    currentLangRef.current = currentLang;
  }, [currentLang]);

  const hasPlayedGreetingRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const pendingQuestionRef = useRef(null);
  const lastWakeTimeRef = useRef(0);
  const startQuestionListeningRef = useRef(null);
  // Stores the active Gemma session ID so follow-up questions reuse the same image
  const currentSessionIdRef = useRef(null);
  // Tracks whether the current PROCESSING is a follow-up (no new image) or a fresh scan
  const isFollowUpModeRef = useRef(false);
  // Guard against duplicate concurrent processing requests
  const isProcessingRef = useRef(false);

  // Keep stateRef updated at all times to prevent stale closure bugs in callbacks
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
    debugLogger.updateState({ appState: state.status });
    debugLogger.log('app:state_change', { status: state.status });
  }, [state]);

  /**
   * Helper: Speaks text aloud while pausing speech recognition so the app does not hear itself
   */
  const speakSafe = useCallback(async (text, options = {}) => {
    if (!text || !text.trim()) return;

    speechRecognitionService.stop();
    isSpeakingRef.current = true;
    setIsSpeakingState(true);
    debugLogger.updateState({ speechSynthSpeaking: true });

    // Determine language: explicit option or Tamil Unicode characters or currentLangRef
    const isTamil =
      options.lang === 'ta' ||
      /[\u0B80-\u0BFF]/.test(text) ||
      (options.lang !== 'en' && currentLangRef.current === 'ta');
    const lang = isTamil ? 'ta-IN' : 'en-IN';

    try {
      await SpeechSynthesizer.speak(text.trim(), {
        ...options,
        lang,
        onEnd: () => {
          isSpeakingRef.current = false;
          setIsSpeakingState(false);
          debugLogger.updateState({ speechSynthSpeaking: false });
          if (options.onEnd) options.onEnd();
        },
        onError: () => {
          isSpeakingRef.current = false;
          setIsSpeakingState(false);
          debugLogger.updateState({ speechSynthSpeaking: false });
          if (options.onError) options.onError();
        },
      });
    } finally {
      isSpeakingRef.current = false;
      setIsSpeakingState(false);
      debugLogger.updateState({ speechSynthSpeaking: false });
    }
  }, []);

  /**
   * Speaks the official welcome greeting when the website opens
   */
  const playWelcomeGreeting = useCallback(async () => {
    const isTa = currentLangRef.current === 'ta';
    const greetingText = isTa
      ? 'வணக்கம்! தொடங்க நடுவில் உள்ள பொத்தானை அழுத்துங்கள் அல்லது "Hi" என்று சொல்லுங்கள்.'
      : 'Welcome! Tap the center button or say Hi to get started.';

    try {
      await speakSafe(greetingText, { lang: isTa ? 'ta' : 'en' });
      setIsAudioBlocked(false);
      hasPlayedGreetingRef.current = true;
    } catch (err) {
      console.warn('Autoplay audio blocked:', err);
      setIsAudioBlocked(true);
    }
  }, [speakSafe]);

  // Attempt welcome voice greeting on page load
  useEffect(() => {
    if (hasPlayedGreetingRef.current) return;

    const timer = setTimeout(() => {
      if (!hasPlayedGreetingRef.current) {
        playWelcomeGreeting();
        // Check if browser blocked audio playback
        setTimeout(() => {
          if (!window.speechSynthesis?.speaking && !hasPlayedGreetingRef.current) {
            setIsAudioBlocked(true);
          }
        }, 1200);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [playWelcomeGreeting]);

  /**
   * Switches language and immediately configures speech recognition for the next session
   */
  const handleSelectLang = useCallback((lang) => {
    const validLang = lang === 'ta' ? 'ta' : 'en';
    setCurrentLang(validLang);
    currentLangRef.current = validLang;
    speechRecognitionService.setLang(validLang === 'ta' ? 'ta-IN' : 'en-IN');

    if (stateRef.current.status === FLOW_STATES.HOME) {
      // Play welcome greeting in new language immediately
      const greetingText = validLang === 'ta'
        ? 'வணக்கம்! தொடங்க நடுவில் உள்ள பொத்தானை அழுத்துங்கள் அல்லது "Hi" என்று சொல்லுங்கள்.'
        : 'Welcome! Tap the center button or say Hi to get started.';
      speakSafe(greetingText, { lang: validLang });
    } else if (stateRef.current.status === FLOW_STATES.STANDBY) {
      speechRecognitionService.stop();
      setRestartCount((c) => c + 1);
    }
  }, [speakSafe]);

  /**
   * Toggles Hands-Free Wake-Word ("Hey Mate") Mode
   */
  const handleToggleWakeWord = useCallback(() => {
    setWakeWordEnabled((prev) => {
      const next = !prev;
      if (!next) {
        speechRecognitionService.stop();
        setIsListeningWake(false);
      } else {
        setRestartCount((c) => c + 1);
      }
      return next;
    });
  }, []);

  /**
   * Handle New Scan — clears session state and starts fresh camera flow
   */
  const handleNewScan = useCallback(async () => {
    SpeechSynthesizer.stop();
    speechRecognitionService.stop();
    isSpeakingRef.current = false;
    currentSessionIdRef.current = null;
    isFollowUpModeRef.current = false;
    dispatch({ type: FLOW_ACTIONS.NEW_SCAN });
    const isTa = currentLangRef.current === 'ta';
    const msg = isTa
      ? 'கேமரா திறக்கப்படுகிறது. மொபைலை நிலையாகப் பிடிக்கவும்.'
      : 'Opening camera. Hold your phone steady.';
    await speakSafe(msg, { lang: isTa ? 'ta' : 'en' });
    dispatch({ type: FLOW_ACTIONS.CAMERA_READY });
  }, [speakSafe]);

  /**
   * Helper: Checks for voice commands in English and Tamil ("new scan", "repeat", "stop", "toggle wake word")
   */
  const checkGlobalVoiceCommands = useCallback(
    (transcript) => {
      const clean = (transcript || '').toLowerCase().trim();

      if (
        clean === 'stop' ||
        clean === 'quiet' ||
        clean === 'cancel' ||
        clean.includes('நிறுத்து') ||
        clean.includes('போதும்')
      ) {
        SpeechSynthesizer.stop();
        isSpeakingRef.current = false;
        return true;
      }

      if (
        clean.includes('disable wake word') ||
        clean.includes('turn off hands free') ||
        clean.includes('turn off wake word')
      ) {
        setWakeWordEnabled(false);
        speechRecognitionService.stop();
        speakSafe(currentLangRef.current === 'ta' ? 'ஹேண்ட்ஸ்-ஃப்ரீ முடக்கப்பட்டது.' : 'Hands-free wake word disabled.');
        return true;
      }

      if (
        clean.includes('enable wake word') ||
        clean.includes('turn on hands free') ||
        clean.includes('turn on wake word')
      ) {
        setWakeWordEnabled(true);
        speakSafe(currentLangRef.current === 'ta' ? 'ஹேண்ட்ஸ்-ஃப்ரீ இயக்கப்பட்டது.' : 'Hands-free wake word enabled.');
        return true;
      }

      if (
        clean.includes('repeat') ||
        clean.includes('read again') ||
        clean.includes('say that again') ||
        clean.includes('மீண்டும் சொல்') ||
        clean.includes('மறுபடியும் சொல்')
      ) {
        if (stateRef.current.currentAnswer) {
          const isTamilAns =
            /[\u0B80-\u0BFF]/.test(stateRef.current.currentAnswer) ||
            currentLangRef.current === 'ta';
          speakSafe(stateRef.current.currentAnswer, { lang: isTamilAns ? 'ta' : 'en' });
        }
        return true;
      }

      if (
        clean.includes('new scan') ||
        clean.includes('scan again') ||
        clean.includes('take another photo') ||
        clean.includes('take photo') ||
        clean.includes('open camera') ||
        clean.includes('புதிய படம்') ||
        clean.includes('புதிய ஸ்கேன்') ||
        clean.includes('படம் எடு')
      ) {
        handleNewScan();
        return true;
      }

      return false;
    },
    [speakSafe, handleNewScan]
  );

  /**
   * 1. Listen for User Question (single utterance mode with waveform)
   */
  const startQuestionListening = useCallback(() => {
    const isTa = currentLangRef.current === 'ta';
    if (!speechRecognitionService.isSupported()) {
      const errMsg = isTa
        ? 'இந்த உலாவியில் குரல் அறிதல் ஆதரிக்கப்படவில்லை. Chrome அல்லது Edge பயன்படுத்தவும்.'
        : 'Voice recognition is not supported in this browser. Please use Chrome or Edge.';
      setMicStatus({
        state: 'error',
        message: errMsg,
      });
      return;
    }

    // Explicitly configure language BEFORE starting session
    speechRecognitionService.setLang(isTa ? 'ta-IN' : 'en-IN');

    speechRecognitionService.startQuestionMode({
      isAppSpeaking: () => isSpeakingRef.current,
      onStatusChange: (status) => {
        setMicStatus(status);
      },
      onInterim: (interim) => {
        // Continuous live interim words update on screen
        dispatch({
          type: FLOW_ACTIONS.UPDATE_INTERIM_TRANSCRIPT,
          payload: interim,
        });
      },
      onResult: async (finalQuestion) => {
        const cleanQ = (finalQuestion || '').trim();
        // Do not send empty or unrecognized text to backend
        if (!cleanQ) return;

        // Prevent duplicate trigger for one voice request
        if (isProcessingRef.current) return;

        // 1. Check if user said "Hi", "Hello", or "வணக்கம்"
        if (isGreeting(cleanQ)) {
          dispatch({
            type: FLOW_ACTIONS.UPDATE_INTERIM_TRANSCRIPT,
            payload: cleanQ,
          });
          const greetingReply = currentLangRef.current === 'ta'
            ? 'வணக்கம்! நான் தயாராக உள்ளேன். உங்கள் கேள்வியைக் கேளுங்கள், உதாரணமாக: என் முன்னால் என்ன இருக்கிறது?'
            : 'Hello! I am ready. What would you like to know? You can ask: What is in front of me?';
          await speakSafe(greetingReply, { lang: currentLangRef.current });
          startQuestionListeningRef.current?.();
          return;
        }

        // 2. Check for global voice commands (new scan, repeat, stop)
        const isCommand = checkGlobalVoiceCommands(cleanQ);
        if (isCommand) return;

        // 3. Keep the final recognized sentence visible on screen
        dispatch({
          type: FLOW_ACTIONS.UPDATE_INTERIM_TRANSCRIPT,
          payload: cleanQ,
        });

        if (isFollowUpModeRef.current && currentSessionIdRef.current) {
          // Follow-up: directly go to PROCESSING reusing existing image
          dispatch({
            type: FLOW_ACTIONS.QUESTION_FINALIZED,
            payload: cleanQ,
          });
        } else {
          // Fresh scan: lock in question and open camera to capture photo
          pendingQuestionRef.current = cleanQ;
          dispatch({ type: FLOW_ACTIONS.START_FLOW });
          const isTaNow = currentLangRef.current === 'ta';
          const camMsg = isTaNow
            ? 'கேமரா திறக்கப்படுகிறது. மொபைலை நிலையாகப் பிடிக்கவும்.'
            : 'Opening camera. Hold your phone steady.';
          await speakSafe(camMsg, { lang: isTaNow ? 'ta' : 'en' });
          dispatch({ type: FLOW_ACTIONS.CAMERA_READY });
        }
      },
      onError: (err) => {
        console.warn('Speech recognition reported error:', err);
        // Error is already formatted and set into micStatus by manager
      },
    });
  }, [checkGlobalVoiceCommands, speakSafe]);

  useEffect(() => {
    startQuestionListeningRef.current = startQuestionListening;
  }, [startQuestionListening]);

  /**
   * 2. Start Flow from Home: User taps center Speak button or says "Hi"
   */
  const handleStartFromHome = useCallback(async () => {
    // 1. Immediately stop any active wake session before transitioning to question mode
    speechRecognitionService.stop();

    await unlockAudio();
    playWakeChime();
    triggerHaptic(50);
    hasPlayedGreetingRef.current = true;
    setIsAudioBlocked(false);

    // Starting fresh question session
    currentSessionIdRef.current = null;
    isFollowUpModeRef.current = false;
    pendingQuestionRef.current = null;

    const isTa = currentLangRef.current === 'ta';

    // Show status: Requesting microphone permission
    setMicStatus({
      state: 'requesting_permission',
      message: isTa
        ? 'மைக்ரோஃபோன் அனுமதி கேட்கப்படுகிறது…'
        : 'Requesting microphone permission…',
    });

    // Enter ASK screen immediately so user sees the interface
    dispatch({ type: FLOW_ACTIONS.START_ASK });

    // Start recognition directly without device contention from getUserMedia
    startQuestionListening();
  }, [startQuestionListening]);

  /**
   * 3. Frame Captured after 5 -> 1 Countdown
   */
  const handleFrameCaptured = useCallback(
    async ({ blob, previewUrl }) => {
      dispatch({
        type: FLOW_ACTIONS.IMAGE_CAPTURED,
        payload: { blob, previewUrl },
      });

      const qToUse =
        pendingQuestionRef.current ||
        stateRef.current.currentQuestion ||
        (currentLangRef.current === 'ta'
          ? 'என் முன்னால் என்ன இருக்கிறது என்று தெளிவாக விவரிக்கவும்.'
          : 'Describe what is in front of me in detail.');
      pendingQuestionRef.current = null;

      dispatch({
        type: FLOW_ACTIONS.QUESTION_FINALIZED,
        payload: qToUse,
      });
    },
    []
  );

  /**
   * 4. Lifecycle Coordinator for PROCESSING, ANSWER, HOME, and STANDBY
   */
  useEffect(() => {
    let isSubscribed = true;

    async function runLifecycle() {
      const { status, currentImageBlob, currentQuestion, currentAnswer } = stateRef.current;

      // === PROCESSING STATE ===
      if (status === FLOW_STATES.PROCESSING) {
        if (isProcessingRef.current) return;
        isProcessingRef.current = true;

        // Auto-detect language from Tamil unicode in question or current selection
        const isTamil = /[\u0B80-\u0BFF]/.test(currentQuestion) || currentLangRef.current === 'ta';
        const langCode = isTamil ? 'ta' : 'en';

        const connectingMsg = isTamil
          ? 'உதவியாளருடன் இணைகிறது. ஒரு கணம் காத்திருக்கவும்.'
          : 'Connecting to the assistant. This may take a moment.';
        await speakSafe(connectingMsg, { lang: langCode });

        try {
          let result;
          if (isFollowUpModeRef.current && currentSessionIdRef.current) {
            // Follow-up: reuse the cached image on the backend — no new image upload
            result = await askFollowUp(currentSessionIdRef.current, currentQuestion, langCode);
          } else {
            // Fresh scan: upload image + question
            result = await analyzeImage(currentImageBlob, currentQuestion, langCode);
            // Store session ID returned by backend for all subsequent follow-ups
            if (result.session_id) {
              currentSessionIdRef.current = result.session_id;
            }
          }

          if (isSubscribed) {
            dispatch({
              type: FLOW_ACTIONS.ANALYSIS_SUCCESS,
              payload: result.answer,
            });
          }
        } catch (err) {
          if (isSubscribed) {
            // Session expired/invalid — clear so next question does a fresh scan
            if (err.code === 'SESSION_EXPIRED' || err.code === 'INVALID_SESSION') {
              currentSessionIdRef.current = null;
              isFollowUpModeRef.current = false;
            }
            const msg =
              err.message ||
              (isTamil ? 'படத்தை பகுப்பாய்வு செய்ய முடியவில்லை.' : 'Failed to understand image.');
            const errMsg = isTamil ? `மன்னிக்கவும். ${msg}` : `Sorry. ${msg}`;
            await speakSafe(errMsg, { lang: langCode });
            dispatch({
              type: FLOW_ACTIONS.SET_ERROR,
              payload: msg,
            });
          }
        } finally {
          isProcessingRef.current = false;
        }
      }

      // === ANSWER STATE ===
      if (status === FLOW_STATES.ANSWER) {
        if (currentAnswer) {
          const isTamil = /[\u0B80-\u0BFF]/.test(currentAnswer) || currentLangRef.current === 'ta';
          await speakSafe(currentAnswer, { lang: isTamil ? 'ta' : 'en' });
        }
        if (isSubscribed) {
          dispatch({ type: FLOW_ACTIONS.ANSWER_FINISHED });
        }
      }

      // === HOME STATE: Actively listen for "Hey Mate" / "வணக்கம்" on the home screen ===
      if (status === FLOW_STATES.HOME) {
        if (wakeWordEnabled && speechRecognitionService.isSupported()) {
          speechRecognitionService.setLang(currentLangRef.current === 'ta' ? 'ta-IN' : 'en-IN');
          speechRecognitionService.startWakeWordMode({
            isAppSpeaking: () => isSpeakingRef.current,
            onStatusChange: (statusObj) => {
              if (isSubscribed) setMicStatus(statusObj);
            },
            onWake: async (trailingSpeech) => {
              playWakeChime();
              triggerHaptic([40, 50, 60]);

              if (trailingSpeech && trailingSpeech.length > 2) {
                pendingQuestionRef.current = trailingSpeech;
              }

              await handleStartFromHome();
            },
            onListeningStateChange: (isListening, errType) => {
              if (isSubscribed) {
                setIsListeningWake(isListening);
                if (errType) setWakeError(errType);
              }
            },
            onError: (err) => {
              console.warn('Wake listener on Home:', err);
              if (isSubscribed && err.type === 'permission-denied') {
                setWakeError('permission-denied');
              }
            },
          });
        }
      }

      // === STANDBY STATE: Actively listen for "Hey Mate" or follow-up commands ===
      if (status === FLOW_STATES.STANDBY) {
        // Cooldown (350ms) to ensure Chrome audio playback output has cleanly released
        const standbyTimer = setTimeout(() => {
          if (!isSubscribed) return;

          if (wakeWordEnabled && speechRecognitionService.isSupported()) {
            speechRecognitionService.setLang(currentLangRef.current === 'ta' ? 'ta-IN' : 'en-IN');
            speechRecognitionService.startWakeWordMode({
              isAppSpeaking: () => isSpeakingRef.current,
              onStatusChange: (statusObj) => {
                if (isSubscribed) setMicStatus(statusObj);
              },
              onWake: async (trailingSpeech, matchedPhrase) => {
                // Ignore duplicate wake triggers within 2 seconds
                const now = Date.now();
                if (now - lastWakeTimeRef.current < 2000) {
                  return;
                }
                lastWakeTimeRef.current = now;

                // Stop wake recognition fully before proceeding
                speechRecognitionService.stop();

                playWakeChime();
                triggerHaptic([40, 50, 60]);

                const cleanMatched = (matchedPhrase || '').toLowerCase();
                const cleanTrailing = (trailingSpeech || '').toLowerCase();
                const fullIntent = `${cleanMatched} ${cleanTrailing}`.trim();

                // 1. Direct voice commands to start a new photo/scan
                if (
                  fullIntent.includes('new scan') ||
                  fullIntent.includes('scan again') ||
                  fullIntent.includes('take photo') ||
                  fullIntent.includes('take picture') ||
                  fullIntent.includes('open camera') ||
                  fullIntent.includes('another photo') ||
                  fullIntent.includes('click photo') ||
                  fullIntent.includes('புதிய படம்') ||
                  fullIntent.includes('புதிய ஸ்கேன்') ||
                  fullIntent.includes('படம் எடு')
                ) {
                  handleNewScan();
                  return;
                }

                // 2. Direct voice commands to repeat current answer
                if (
                  fullIntent.includes('repeat') ||
                  fullIntent.includes('read again') ||
                  fullIntent.includes('say that again') ||
                  fullIntent.includes('மீண்டும் சொல்') ||
                  fullIntent.includes('மறுபடியும் சொல்')
                ) {
                  if (stateRef.current.currentAnswer) {
                    const isTamilAns =
                      /[\u0B80-\u0BFF]/.test(stateRef.current.currentAnswer) ||
                      currentLangRef.current === 'ta';
                    await speakSafe(stateRef.current.currentAnswer, {
                      lang: isTamilAns ? 'ta' : 'en',
                    });
                  }
                  return;
                }

                // 3. User woke assistant for follow-up question
                isFollowUpModeRef.current = true; // flag: next PROCESSING = follow-up
                dispatch({ type: FLOW_ACTIONS.WAKE_WORD_HEARD });

                // Check if user spoke the question in the same breath
                if (trailingSpeech && trailingSpeech.length > 2) {
                  const isCmd = checkGlobalVoiceCommands(trailingSpeech);
                  if (isCmd) return;

                  dispatch({
                    type: FLOW_ACTIONS.QUESTION_FINALIZED,
                    payload: trailingSpeech,
                  });
                } else {
                  // Capture one utterance for the follow-up question
                  startQuestionListening();
                }
              },
              onListeningStateChange: (listening, errType) => {
                if (isSubscribed) {
                  setIsListeningWake(listening);
                  if (errType) {
                    setWakeError(errType);
                    setRestartCount((c) => c + 1);
                  }
                }
              },
              onError: (err) => {
                console.warn('Wake listener on Standby:', err);
                if (isSubscribed) {
                  if (err.type === 'permission-denied') setWakeError('permission-denied');
                  setRestartCount((c) => c + 1);
                }
              },
            });
          }
        }, 350);

        return () => {
          clearTimeout(standbyTimer);
        };
      }
    }

    runLifecycle();

    return () => {
      isSubscribed = false;
      // Stop wake mode cleanly when leaving HOME or STANDBY
      if (stateRef.current.status === FLOW_STATES.HOME || stateRef.current.status === FLOW_STATES.STANDBY) {
        speechRecognitionService.stop();
      }
    };
  }, [state.status, wakeWordEnabled, speakSafe, checkGlobalVoiceCommands, startQuestionListening, handleStartFromHome, handleNewScan]);

  /**
   * Handle Manual Tap on Orb in Standby: exact same sequence as wake phrase
   */
  const handleManualWake = useCallback(async () => {
    speechRecognitionService.stop();
    playWakeChime();
    triggerHaptic(40);
    isFollowUpModeRef.current = true; // flag: next PROCESSING = follow-up

    const isTa = currentLangRef.current === 'ta';
    setMicStatus({
      state: 'requesting_permission',
      message: isTa
        ? 'மைக்ரோஃபோன் அனுமதி கேட்கப்படுகிறது…'
        : 'Requesting microphone permission…',
    });

    dispatch({ type: FLOW_ACTIONS.WAKE_WORD_HEARD });
    startQuestionListening();
  }, [startQuestionListening]);

  /**
   * Handle Manual Question Submission from Waveform view
   */
  const handleManualQuestionSubmit = useCallback(async (text) => {
    const cleanQ = (text || '').trim();
    if (!cleanQ) return;
    speechRecognitionService.stop();

    if (isFollowUpModeRef.current && currentSessionIdRef.current) {
      dispatch({
        type: FLOW_ACTIONS.QUESTION_FINALIZED,
        payload: cleanQ,
      });
    } else {
      pendingQuestionRef.current = cleanQ;
      dispatch({ type: FLOW_ACTIONS.START_FLOW });
      const isTaNow = currentLangRef.current === 'ta';
      const camMsg = isTaNow
        ? 'கேமரா திறக்கப்படுகிறது. மொபைலை நிலையாகப் பிடிக்கவும்.'
        : 'Opening camera. Hold your phone steady.';
      await speakSafe(camMsg, { lang: isTaNow ? 'ta' : 'en' });
      dispatch({ type: FLOW_ACTIONS.CAMERA_READY });
    }
  }, [speakSafe]);

  /**
   * Global Keyboard Shortcuts (Space / Enter to trigger primary action, Esc to stop)
   */
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        SpeechSynthesizer.stop();
        isSpeakingRef.current = false;
      }
      if (e.key === ' ' || e.key === 'Enter') {
        if (stateRef.current.status === FLOW_STATES.HOME) {
          e.preventDefault();
          handleStartFromHome();
        } else if (stateRef.current.status === FLOW_STATES.STANDBY) {
          e.preventDefault();
          handleManualWake();
        } else if (stateRef.current.status === FLOW_STATES.ERROR) {
          e.preventDefault();
          dispatch({ type: FLOW_ACTIONS.RETRY });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleStartFromHome, handleManualWake]);

  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-[#0A0E17] text-[#F8FAFC] flex flex-col justify-between select-none overscroll-none relative">
      {/* 1. Splash Screen on Launch */}
      {state.status === FLOW_STATES.SPLASH && (
        <SplashScreen onComplete={() => dispatch({ type: FLOW_ACTIONS.FINISH_SPLASH })} />
      )}

      {/* 2. Live Camera View with 5 -> 1 Countdown */}
      {(state.status === FLOW_STATES.CAMERA_OPENING ||
        state.status === FLOW_STATES.COUNTDOWN ||
        state.status === FLOW_STATES.CAPTURE) && (
        <CameraCountdownView
          onCaptured={handleFrameCaptured}
          onError={(err) => {
            dispatch({
              type: FLOW_ACTIONS.SET_ERROR,
              payload: err.message || 'Camera error.',
            });
            const errMsg =
              currentLangRef.current === 'ta'
                ? 'கேமரா அணுகல் தோல்வியடைந்தது. அனுமதியை சரிபார்க்கவும்.'
                : 'Camera access failed. Please check permissions.';
            speakSafe(errMsg, { lang: currentLangRef.current });
          }}
          onCancel={() => dispatch({ type: FLOW_ACTIONS.RETRY })}
          speakNumber={(num) => {
            const utterance = new SpeechSynthesisUtterance(num);
            utterance.rate = 1.2;
            utterance.lang = currentLangRef.current === 'ta' ? 'ta-IN' : 'en-IN';
            window.speechSynthesis?.speak(utterance);
          }}
          isReadyToCountdown={state.status === FLOW_STATES.COUNTDOWN}
        />
      )}

      {/* 3. Home Screen with Animated Speak Button & Bilingual Selector */}
      {state.status === FLOW_STATES.HOME && (
        <HomeSpeakView
          onStart={handleStartFromHome}
          isListeningWake={isListeningWake}
          wakeError={wakeError}
          currentLang={currentLang}
          onSelectLang={handleSelectLang}
          isAudioBlocked={isAudioBlocked}
          onPlayGreeting={playWelcomeGreeting}
          wakeWordEnabled={wakeWordEnabled}
          onToggleWakeWord={handleToggleWakeWord}
          micStatus={micStatus}
        />
      )}

      {/* 4. Asking State with Animated Live Waveform & Bilingual Suggestions */}
      {(state.status === FLOW_STATES.ASK || state.status === FLOW_STATES.FOLLOW_UP_ASK) && (
        <WaveformAskView
          imagePreviewUrl={state.currentImagePreviewUrl}
          interimTranscript={state.interimTranscript}
          onManualSubmit={handleManualQuestionSubmit}
          isFollowUp={state.status === FLOW_STATES.FOLLOW_UP_ASK}
          currentLang={currentLang}
          micStatus={micStatus}
          onRetry={startQuestionListening}
        />
      )}

      {/* 5. Processing State with Vertical Scanning Sweep Effect */}
      {state.status === FLOW_STATES.PROCESSING && (
        <ProcessingScanView
          imagePreviewUrl={state.currentImagePreviewUrl}
          question={state.currentQuestion}
          currentLang={currentLang}
        />
      )}

      {/* 6. Answer & Standby State (Typewriter reveal + Breathing Orb + Bilingual Toggle) */}
      {(state.status === FLOW_STATES.ANSWER || state.status === FLOW_STATES.STANDBY) && (
        <AnswerStandbyView
          question={state.currentQuestion}
          fullAnswer={state.currentAnswer}
          isSpeaking={isSpeakingState}
          status={state.status}
          imagePreviewUrl={state.currentImagePreviewUrl}
          isListeningWake={isListeningWake}
          wakeError={wakeError}
          restartCount={restartCount}
          isSupported={speechRecognitionService.isSupported()}
          currentLang={currentLang}
          onSelectLang={handleSelectLang}
          onNewScan={handleNewScan}
          onRepeat={() => state.currentAnswer && speakSafe(state.currentAnswer)}
          onStop={() => {
            SpeechSynthesizer.stop();
            isSpeakingRef.current = false;
            setIsSpeakingState(false);
          }}
          onManualWake={handleManualWake}
          wakeWordEnabled={wakeWordEnabled}
          onToggleWakeWord={handleToggleWakeWord}
          micStatus={micStatus}
        />
      )}

      {/* 7. Error State */}
      {state.status === FLOW_STATES.ERROR && (
        <div
          className="flex-1 w-full flex flex-col items-center justify-center p-6 max-w-md mx-auto text-center gap-6"
          role="alert"
        >
          <div className="w-16 h-16 rounded-full bg-red-950/80 border border-red-500 text-red-400 flex items-center justify-center">
            <span className="text-3xl font-bold">!</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Notice</h2>
            <p className="text-base text-zinc-300 mt-2 leading-relaxed">
              {state.error || 'An unexpected issue occurred.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => dispatch({ type: FLOW_ACTIONS.RETRY })}
            className="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-lg shadow-lg cursor-pointer"
          >
            Try Again
          </button>
        </div>
      )}

      {/* STEP 1: Debug Panel Overlay (Active when ?debug=1 in URL) */}
      <DebugPanel />
    </div>
  );
}

export default App;
