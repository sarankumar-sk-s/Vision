import React, { useReducer, useEffect, useCallback, useRef, useState } from 'react';
import {
  FLOW_STATES,
  FLOW_ACTIONS,
  initialFlowState,
  flowReducer,
} from './state/machine.js';

import { analyzeImage, askFollowUp } from './services/api.js';
import { SpeechSynthesizer } from './services/speechSynthesis.js';
import { speechRecognitionService } from './services/speechRecognition.js';
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

  const isSpeakingRef = useRef(false);
  const pendingQuestionRef = useRef(null);
  const lastWakeTimeRef = useRef(0);
  // Stores the active Gemma session ID so follow-up questions reuse the same image
  const currentSessionIdRef = useRef(null);
  // Tracks whether the current PROCESSING is a follow-up (no new image) or a fresh scan
  const isFollowUpModeRef = useRef(false);

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
  const speakSafe = useCallback(async (text) => {
    if (!text || !text.trim()) return;

    speechRecognitionService.stop();
    isSpeakingRef.current = true;
    debugLogger.updateState({ speechSynthSpeaking: true });

    await SpeechSynthesizer.speak(text.trim(), {
      onEnd: () => {
        isSpeakingRef.current = false;
        debugLogger.updateState({ speechSynthSpeaking: false });
      },
      onError: () => {
        isSpeakingRef.current = false;
        debugLogger.updateState({ speechSynthSpeaking: false });
      },
    });

    isSpeakingRef.current = false;
    debugLogger.updateState({ speechSynthSpeaking: false });
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
    await speakSafe('Opening camera. Hold your phone steady.');
    dispatch({ type: FLOW_ACTIONS.CAMERA_READY });
  }, [speakSafe]);

  /**
   * Helper: Checks for voice commands ("new scan", "repeat", "stop")
   */
  const checkGlobalVoiceCommands = useCallback(
    (transcript) => {
      const clean = (transcript || '').toLowerCase().trim();

      if (clean === 'stop' || clean === 'quiet' || clean === 'cancel') {
        SpeechSynthesizer.stop();
        isSpeakingRef.current = false;
        return true;
      }

      if (clean.includes('repeat') || clean.includes('read again') || clean.includes('say that again')) {
        if (stateRef.current.currentAnswer) {
          speakSafe(stateRef.current.currentAnswer);
        }
        return true;
      }

      if (
        clean.includes('new scan') ||
        clean.includes('scan again') ||
        clean.includes('take another photo') ||
        clean.includes('take photo') ||
        clean.includes('open camera')
      ) {
        handleNewScan();
        return true;
      }

      return false;
    },
    [speakSafe, handleNewScan]
  );

  /**
   * 1. Start Flow from Home: User taps Speak button or says "Hey Mate"
   */
  const handleStartFromHome = useCallback(async () => {
    await unlockAudio();
    triggerHaptic(50);
    // Starting fresh — clear any previous session
    currentSessionIdRef.current = null;
    isFollowUpModeRef.current = false;

    dispatch({ type: FLOW_ACTIONS.START_FLOW });
    await speakSafe('Opening camera. Hold your phone steady.');
    dispatch({ type: FLOW_ACTIONS.CAMERA_READY });
  }, [speakSafe]);

  /**
   * 2. Frame Captured after 5 -> 1 Countdown
   */
  const handleFrameCaptured = useCallback(
    async ({ blob, previewUrl }) => {
      dispatch({
        type: FLOW_ACTIONS.IMAGE_CAPTURED,
        payload: { blob, previewUrl },
      });

      // If user had spoken a question with the initial "Hey Mate [question]"
      if (pendingQuestionRef.current) {
        const initialQ = pendingQuestionRef.current;
        pendingQuestionRef.current = null;
        dispatch({
          type: FLOW_ACTIONS.QUESTION_FINALIZED,
          payload: initialQ,
        });
        return;
      }

      // App speaks: "Image captured. What would you like to know?"
      await speakSafe('Image captured. What would you like to know?');

      // Start speech recognition listening for question
      startQuestionListening();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [speakSafe]
  );

  /**
   * 3. Listen for User Question (single utterance mode with waveform)
   */
  const startQuestionListening = useCallback(() => {
    if (!speechRecognitionService.isSupported()) {
      dispatch({
        type: FLOW_ACTIONS.QUESTION_FINALIZED,
        payload: 'Describe what is in front of me in detail.',
      });
      return;
    }

    speechRecognitionService.startQuestionMode({
      isAppSpeaking: () => isSpeakingRef.current,
      onInterim: (_interim) => {
        dispatch({ type: FLOW_ACTIONS.START_ASK });
      },
      onResult: (finalQuestion) => {
        const isCommand = checkGlobalVoiceCommands(finalQuestion);
        if (isCommand) return;

        dispatch({
          type: FLOW_ACTIONS.QUESTION_FINALIZED,
          payload: finalQuestion,
        });
      },
      onError: (err) => {
        if (err.type === 'no-speech') {
          // Default to general description if no speech heard
          dispatch({
            type: FLOW_ACTIONS.QUESTION_FINALIZED,
            payload: 'Describe what is in front of me in detail.',
          });
        }
      },
    });
  }, [checkGlobalVoiceCommands]);

  /**
   * 4. Lifecycle Coordinator for PROCESSING, ANSWER, HOME, and STANDBY
   */
  useEffect(() => {
    let isSubscribed = true;

    async function runLifecycle() {
      const { status, currentImageBlob, currentQuestion, currentAnswer } = stateRef.current;

      // === PROCESSING STATE ===
      if (status === FLOW_STATES.PROCESSING) {
        await speakSafe('Please wait, I am understanding it.');

        try {
          let result;
          if (isFollowUpModeRef.current && currentSessionIdRef.current) {
            // Follow-up: reuse the cached image on the backend — no new image upload
            result = await askFollowUp(currentSessionIdRef.current, currentQuestion);
          } else {
            // Fresh scan: upload image + question
            result = await analyzeImage(currentImageBlob, currentQuestion);
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
            const msg = err.message || 'Failed to understand image.';
            await speakSafe(`Sorry. ${msg}`);
            dispatch({
              type: FLOW_ACTIONS.SET_ERROR,
              payload: msg,
            });
          }
        }
      }

      // === ANSWER STATE ===
      if (status === FLOW_STATES.ANSWER) {
        if (currentAnswer) {
          await speakSafe(currentAnswer);
        }
        if (isSubscribed) {
          dispatch({ type: FLOW_ACTIONS.ANSWER_FINISHED });
        }
      }

      // === HOME STATE: Actively listen for "Hey Mate" on the home screen ===
      if (status === FLOW_STATES.HOME) {
        if (speechRecognitionService.isSupported()) {
          speechRecognitionService.startWakeWordMode({
            isAppSpeaking: () => isSpeakingRef.current,
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

          if (speechRecognitionService.isSupported()) {
            speechRecognitionService.startWakeWordMode({
              isAppSpeaking: () => isSpeakingRef.current,
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
                  fullIntent.includes('click photo')
                ) {
                  handleNewScan();
                  return;
                }

                // 2. Direct voice commands to repeat current answer
                if (fullIntent.includes('repeat') || fullIntent.includes('read again')) {
                  if (stateRef.current.currentAnswer) {
                    await speakSafe(stateRef.current.currentAnswer);
                  }
                  return;
                }

                // 3. User woke assistant for follow-up question
                isFollowUpModeRef.current = true; // flag: next PROCESSING = follow-up
                dispatch({ type: FLOW_ACTIONS.WAKE_WORD_HEARD });

                // Speak "I am listening." and wait for it to finish
                await speakSafe('I am listening.');

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
  }, [state.status, speakSafe, checkGlobalVoiceCommands, startQuestionListening, handleStartFromHome, handleNewScan]);

  /**
   * Handle Manual Tap on Orb in Standby: exact same sequence as wake phrase
   */
  const handleManualWake = useCallback(async () => {
    speechRecognitionService.stop();
    playWakeChime();
    triggerHaptic(40);
    isFollowUpModeRef.current = true; // flag: next PROCESSING = follow-up
    dispatch({ type: FLOW_ACTIONS.WAKE_WORD_HEARD });
    await speakSafe('I am listening.');
    startQuestionListening();
  }, [speakSafe, startQuestionListening]);


  /**
   * Handle Manual Question Submission from Waveform view
   */
  const handleManualQuestionSubmit = useCallback((text) => {
    dispatch({
      type: FLOW_ACTIONS.QUESTION_FINALIZED,
      payload: text,
    });
  }, []);

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
            speakSafe('Camera access failed. Please check permissions.');
          }}
          onCancel={() => dispatch({ type: FLOW_ACTIONS.RETRY })}
          speakNumber={(num) => {
            const utterance = new SpeechSynthesisUtterance(num);
            utterance.rate = 1.2;
            window.speechSynthesis?.speak(utterance);
          }}
          isReadyToCountdown={state.status === FLOW_STATES.COUNTDOWN}
        />
      )}

      {/* 3. Home Screen with Animated Speak Button */}
      {state.status === FLOW_STATES.HOME && (
        <HomeSpeakView
          onStart={handleStartFromHome}
          isListeningWake={isListeningWake}
          wakeError={wakeError}
        />
      )}

      {/* 4. Asking State with Animated Live Waveform */}
      {(state.status === FLOW_STATES.ASK || state.status === FLOW_STATES.FOLLOW_UP_ASK) && (
        <WaveformAskView
          imagePreviewUrl={state.currentImagePreviewUrl}
          interimTranscript={state.interimTranscript}
          onManualSubmit={handleManualQuestionSubmit}
          isFollowUp={state.status === FLOW_STATES.FOLLOW_UP_ASK}
        />
      )}

      {/* 5. Processing State with Vertical Scanning Sweep Effect */}
      {state.status === FLOW_STATES.PROCESSING && (
        <ProcessingScanView
          imagePreviewUrl={state.currentImagePreviewUrl}
          question={state.currentQuestion}
        />
      )}

      {/* 6. Answer & Standby State (Typewriter reveal + Breathing Orb) */}
      {(state.status === FLOW_STATES.ANSWER || state.status === FLOW_STATES.STANDBY) && (
        <AnswerStandbyView
          question={state.currentQuestion}
          fullAnswer={state.currentAnswer}
          isSpeaking={isSpeakingRef.current}
          status={state.status}
          imagePreviewUrl={state.currentImagePreviewUrl}
          isListeningWake={isListeningWake}
          wakeError={wakeError}
          restartCount={restartCount}
          isSupported={speechRecognitionService.isSupported()}
          onNewScan={handleNewScan}
          onRepeat={() => state.currentAnswer && speakSafe(state.currentAnswer)}
          onStop={() => {
            SpeechSynthesizer.stop();
            isSpeakingRef.current = false;
          }}
          onManualWake={handleManualWake}
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
