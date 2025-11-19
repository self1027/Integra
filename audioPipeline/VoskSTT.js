const vosk = require('vosk');

class VoskSTT {
  constructor({ model, sampleRate, onTranscription }) {
    this._recognizer = null;
    this._model = model;
    this._sampleRate = sampleRate;
    this._onTranscription = onTranscription;

    if (!vosk) {
      console.error("Vosk library not found. Please install it.");
      return;
    }

    this.init();
  }

  init() {
    this.stop();
    this._recognizer = new vosk.Recognizer({ model: this._model, sampleRate: this._sampleRate });
  }

  pushAudio(pcmBuffer) {
    if (!this._recognizer) {
      console.warn("[Vosk] Recognizer not initialized. Cannot accept audio.");
      return null;
    }
    if (this._recognizer.acceptWaveform(pcmBuffer)) {
      const result = this._recognizer.result().text;
      if (result) {
        if (this._onTranscription) {
          this._onTranscription(result.trim());
        }
        return result.trim();
      }
    }
    return null;
  }

  stop() {
    if (this._recognizer) {
      try {
        this._recognizer.free();
      } catch {}
      this._recognizer = null;
    }
  }
}

module.exports = { VoskSTT };