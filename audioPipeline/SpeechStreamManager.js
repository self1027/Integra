const { PassThrough } = require('stream');

class SpeechStreamManager {
  constructor() {
    this._audioInputStream = null;
    this._recognizeStream = null;
    this._isActive = false;
    this._restartTimeout = null;
  }

  createAudioStream() {
    this._audioInputStream = new PassThrough();
    return this._audioInputStream;
  }

  setupStreamHandlers(recognizeStream, {
    onError = () => {},
    onEnd = () => {},
    onData = () => {},
    onRestart = () => {}
  } = {}) {
    this._recognizeStream = recognizeStream
      .on('error', (err) => {
        console.error("[SpeechStream] Recognition error:", err);
        this._isActive = false;
        onError(err);
        setTimeout(() => onRestart(), 1000);
      })
      .on('end', () => {
        this._isActive = false;
        onEnd();
        setTimeout(() => onRestart(), 100);
      })
      .on('data', onData);

    return this._recognizeStream;
  }

  pushAudio(pcmBuffer, onStreamRestart) {
    if (!this._isActive) {
      onStreamRestart();
    }

    if (this._audioInputStream && this._audioInputStream.writable) {
      try {
        this._audioInputStream.write(pcmBuffer);
      } catch (error) {
        console.warn("[SpeechStream] Stream write error, restarting:", error.message);
        this._restartStream();
        setTimeout(() => {
          if (this._audioInputStream && this._audioInputStream.writable) {
            this._audioInputStream.write(pcmBuffer);
          }
        }, 50);
      }
    }
  }

  _restartStream() {
    this.cleanup();
  }

  cleanup() {
    if (this._restartTimeout) {
      clearTimeout(this._restartTimeout);
    }

    [this._recognizeStream, this._audioInputStream].forEach(stream => {
      if (stream) {
        try {
          stream.removeAllListeners();
          stream.destroy();
        } catch (e) {
          console.warn("[SpeechStream] Error cleaning stream:", e);
        }
      }
    });

    this._isActive = false;
  }

  setActive(active) {
    this._isActive = active;
  }

  isActive() {
    return this._isActive;
  }
}

module.exports = { SpeechStreamManager };