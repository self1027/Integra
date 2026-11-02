const vosk = require('vosk');

class VoskSTT {
  constructor({ model, sampleRate, onRecognition, createRecognizer = options => new vosk.Recognizer(options) }) {
    this.recognizer = createRecognizer({ model, sampleRate });
    this.recognizer.setWords(true);
    this.recognizer.setPartialWords(true);
    this.sampleRate = sampleRate;
    this.onRecognition = onRecognition;
    this.samples = 0;
    this.lastPartial = -Infinity;
  }

  pushAudio(buffer) {
    if (!this.recognizer) return;
    this.samples += buffer.length / 2;
    const audioTime = this.samples / this.sampleRate;
    if (this.recognizer.acceptWaveform(buffer)) {
      this._emit(this.recognizer.result(), true, audioTime);
    } else if (audioTime - this.lastPartial >= 0.2) {
      this.lastPartial = audioTime;
      this._emit(this.recognizer.partialResult(), false, audioTime);
    }
  }

  _emit(result, final, audioTime) {
    this.onRecognition({ text: (final ? result.text : result.partial) || '', words: (final ? result.result : result.partial_result) || [], final, audioTime });
  }

  finish() {
    if (!this.recognizer) return;
    this._emit(this.recognizer.finalResult(), true, this.samples / this.sampleRate);
    this.stop();
  }

  stop() {
    if (!this.recognizer) return;
    this.recognizer.free();
    this.recognizer = null;
  }
}

module.exports = { VoskSTT };
