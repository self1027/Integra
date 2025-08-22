const vosk = require('vosk');

let recognizer = null;

function init({ model, sampleRate }) {
  stop();
  recognizer = new vosk.Recognizer({ model, sampleRate });
}

function acceptAudio(pcmBuffer) {
  if (!recognizer) return null;
  if (recognizer.acceptWaveform(pcmBuffer)) {
    return recognizer.result().text;
  }
  return null;
}

function stop() {
  if (recognizer) {
    try { recognizer.free(); } catch {}
    recognizer = null;
  }
}

module.exports = { init, acceptAudio, stop };
