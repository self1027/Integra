const vosk = require('vosk');

class VoskSTT {
  /**
   * Constructs a VoskSTT instance.
   * @param {object} config The configuration object.
   * @param {object} config.model The Vosk model object.
   * @param {number} config.sampleRate The audio sample rate in Hz.
   * @param {Function} onTranscription The callback to receive transcription results.
   */
  constructor({ model, sampleRate, onTranscription }) {
    this._recognizer = null;
    this._model = model;
    this._sampleRate = sampleRate;
    this._onTranscription = onTranscription;

    if (!vosk) {
      console.error("Vosk library not found. Please install it.");
      return;
    }

    // Auto-initialize the recognizer
    this.init();
  }

  /**
   * Initializes the Vosk recognizer with the provided model and sample rate.
   */
  init() {
    this.stop(); // Ensure any existing recognizer is free
    this._recognizer = new vosk.Recognizer({ model: this._model, sampleRate: this._sampleRate });
    console.log("[Vosk] Recognizer initialized.");
  }

  /**
   * Accepts a PCM audio buffer for offline processing.
   * @param {Buffer} pcmBuffer The audio data buffer.
   * @returns {string|null} The final transcribed text, or null if no result yet.
   */
  pushAudio(pcmBuffer) {
    if (!this._recognizer) {
      console.warn("[Vosk] Recognizer not initialized. Cannot accept audio.");
      return null;
    }
    if (this._recognizer.acceptWaveform(pcmBuffer)) {
      const result = this._recognizer.result().text;
      if (result) {
        console.log(`[Vosk] FINAL: "${result}"`);
        if (this._onTranscription) {
          this._onTranscription(result.trim());
        }
        return result.trim();
      }
    }
    return null;
  }

  /**
   * Stops and frees the Vosk recognizer instance.
   */
  stop() {
    if (this._recognizer) {
      try {
        this._recognizer.free();
      } catch {}
      this._recognizer = null;
      console.log("[Vosk] Recognizer stopped and freed.");
    }
  }
}

module.exports = { VoskSTT };