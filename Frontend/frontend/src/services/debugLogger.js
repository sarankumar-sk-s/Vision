/**
 * VisionMate Live Debug Event Hub
 * Records live SpeechRecognition, SpeechSynthesis, and App State events
 * for real-time mobile debugging via ?debug=1 URL parameter.
 */

class DebugLogger {
  constructor() {
    this.maxLogs = 40;
    this.logs = [];
    this.listeners = new Set();

    this.state = {
      appState: 'SPLASH',
      recStatus: 'idle', // 'idle' | 'starting' | 'running' | 'stopping'
      recMode: 'none', // 'wake-word' | 'question' | 'none'
      recLang: 'en-US',
      speechSynthSpeaking: false,
      activeMediaStreams: 0,
      restartCount: 0,
      watchdogTimeLeft: 8,
      lastTranscript: '',
      lastMatch: null,
      errorMessage: null,
    };

    // Track active media streams globally
    this._interceptMediaDevices();
  }

  _interceptMediaDevices() {
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;

    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const self = this;

    navigator.mediaDevices.getUserMedia = async function (constraints) {
      const stream = await originalGetUserMedia(constraints);
      self.state.activeMediaStreams += 1;
      self.log('media:stream_opened', {
        audio: Boolean(constraints?.audio),
        video: Boolean(constraints?.video),
        activeCount: self.state.activeMediaStreams,
      });

      const originalGetTracks = stream.getTracks.bind(stream);
      const tracks = originalGetTracks();
      tracks.forEach((track) => {
        track.addEventListener('ended', () => {
          self.state.activeMediaStreams = Math.max(0, self.state.activeMediaStreams - 1);
          self.log('media:track_ended', { kind: track.kind, activeCount: self.state.activeMediaStreams });
          self._notify();
        });
      });

      self._notify();
      return stream;
    };
  }

  log(eventType, data = {}) {
    const timestamp = new Date().toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });

    const entry = {
      id: Date.now() + Math.random(),
      time: timestamp,
      type: eventType,
      data,
    };

    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    this._notify();
  }

  updateState(partial) {
    this.state = { ...this.state, ...partial };
    this._notify();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.state, this.logs);
      } catch (err) {
        console.error('Debug listener error:', err);
      }
    }
  }

  clearLogs() {
    this.logs = [];
    this._notify();
  }

  isDebugEnabled() {
    if (typeof window === 'undefined') return false;
    const urlParams = new URLSearchParams(window.location.search);
    return (
      urlParams.get('debug') === '1' ||
      window.location.hash.includes('debug=1') ||
      window.localStorage.getItem('visionmate_debug') === '1'
    );
  }
}

export const debugLogger = new DebugLogger();
