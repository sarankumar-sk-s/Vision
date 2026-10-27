/**
 * VisionMate State Machine
 * Coordinates the full user flow using useReducer:
 * SPLASH -> HOME -> CAMERA_OPENING -> COUNTDOWN -> CAPTURE -> ASK -> PROCESSING -> ANSWER -> STANDBY
 * (Wake Phrase -> FOLLOW_UP_ASK -> PROCESSING -> ANSWER -> STANDBY)
 * (NEW SCAN -> CAMERA_OPENING)
 */

export const WAKE_PHRASE = 'Hey mate';
export const WAKE_VARIANTS = ['hey mate', 'hey, mate', 'a mate', 'mate', 'hey made', 'vision'];

export const FLOW_STATES = {
  SPLASH: 'SPLASH',
  HOME: 'HOME',
  CAMERA_OPENING: 'CAMERA_OPENING',
  COUNTDOWN: 'COUNTDOWN',
  CAPTURE: 'CAPTURE',
  ASK: 'ASK',
  PROCESSING: 'PROCESSING',
  ANSWER: 'ANSWER',
  STANDBY: 'STANDBY',
  FOLLOW_UP_ASK: 'FOLLOW_UP_ASK',
  ERROR: 'ERROR',
};

export const FLOW_ACTIONS = {
  FINISH_SPLASH: 'FINISH_SPLASH',
  START_FLOW: 'START_FLOW',
  CAMERA_READY: 'CAMERA_READY',
  UPDATE_COUNTDOWN: 'UPDATE_COUNTDOWN',
  TRIGGER_CAPTURE: 'TRIGGER_CAPTURE',
  IMAGE_CAPTURED: 'IMAGE_CAPTURED',
  START_ASK: 'START_ASK',
  UPDATE_INTERIM_TRANSCRIPT: 'UPDATE_INTERIM_TRANSCRIPT',
  QUESTION_FINALIZED: 'QUESTION_FINALIZED',
  ANALYSIS_SUCCESS: 'ANALYSIS_SUCCESS',
  ANSWER_FINISHED: 'ANSWER_FINISHED',
  WAKE_WORD_HEARD: 'WAKE_WORD_HEARD',
  NEW_SCAN: 'NEW_SCAN',
  SET_ERROR: 'SET_ERROR',
  RETRY: 'RETRY',
};

export const initialFlowState = {
  status: FLOW_STATES.HOME,
  countdownNumber: 5,
  currentImageBlob: null,
  currentImagePreviewUrl: null,
  currentQuestion: '',
  interimTranscript: '',
  currentAnswer: '',
  isShutterActive: false,
  error: null,
};

export function flowReducer(state, action) {
  switch (action.type) {
    case FLOW_ACTIONS.FINISH_SPLASH:
      return {
        ...state,
        status: FLOW_STATES.HOME,
      };

    case FLOW_ACTIONS.START_FLOW:
      return {
        ...state,
        status: FLOW_STATES.CAMERA_OPENING,
        countdownNumber: 5,
        currentQuestion: '',
        interimTranscript: '',
        currentAnswer: '',
        error: null,
      };

    case FLOW_ACTIONS.CAMERA_READY:
      return {
        ...state,
        status: FLOW_STATES.COUNTDOWN,
        countdownNumber: 5,
      };

    case FLOW_ACTIONS.UPDATE_COUNTDOWN:
      return {
        ...state,
        countdownNumber: action.payload,
      };

    case FLOW_ACTIONS.TRIGGER_CAPTURE:
      return {
        ...state,
        status: FLOW_STATES.CAPTURE,
        isShutterActive: true,
      };

    case FLOW_ACTIONS.IMAGE_CAPTURED:
      return {
        ...state,
        currentImageBlob: action.payload.blob,
        currentImagePreviewUrl: action.payload.previewUrl,
        isShutterActive: false,
        status: FLOW_STATES.ASK,
      };

    case FLOW_ACTIONS.START_ASK:
      return {
        ...state,
        status: FLOW_STATES.ASK,
        interimTranscript: '',
      };

    case FLOW_ACTIONS.UPDATE_INTERIM_TRANSCRIPT:
      return {
        ...state,
        interimTranscript: action.payload,
      };

    case FLOW_ACTIONS.QUESTION_FINALIZED:
      return {
        ...state,
        currentQuestion: action.payload,
        interimTranscript: action.payload, // Keep final sentence visible while processing
        status: FLOW_STATES.PROCESSING,
      };

    case FLOW_ACTIONS.ANALYSIS_SUCCESS:
      return {
        ...state,
        currentAnswer: action.payload,
        status: FLOW_STATES.ANSWER,
      };

    case FLOW_ACTIONS.ANSWER_FINISHED:
      return {
        ...state,
        status: FLOW_STATES.STANDBY,
      };

    case FLOW_ACTIONS.WAKE_WORD_HEARD:
      return {
        ...state,
        status: FLOW_STATES.FOLLOW_UP_ASK,
        interimTranscript: '',
      };

    case FLOW_ACTIONS.NEW_SCAN:
      if (state.currentImagePreviewUrl) {
        URL.revokeObjectURL(state.currentImagePreviewUrl);
      }
      return {
        ...state,
        status: FLOW_STATES.CAMERA_OPENING,
        countdownNumber: 5,
        currentImageBlob: null,
        currentImagePreviewUrl: null,
        currentQuestion: '',
        interimTranscript: '',
        currentAnswer: '',
        error: null,
      };

    case FLOW_ACTIONS.SET_ERROR:
      return {
        ...state,
        status: FLOW_STATES.ERROR,
        error: action.payload,
      };

    case FLOW_ACTIONS.RETRY:
      return {
        ...state,
        status: FLOW_STATES.HOME,
        error: null,
      };

    default:
      return state;
  }
}
