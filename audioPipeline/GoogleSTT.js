const { PassThrough } = require('stream');
const { SpeechClient } = require('@google-cloud/speech');

class GoogleSTT {
  constructor({ sampleRate, languageCode, onTranscription }) {
    this._client = new SpeechClient();
    this._sampleRate = sampleRate;
    this._languageCode = languageCode;
    this._onTranscription = onTranscription;
    this._audioInputStream = null;
    this._recognizeStream = null;
    this._isActive = false;
  }

  async init() {
    // Simple initialization - no complex async needed
    return Promise.resolve();
  }

  pushAudio(pcmBuffer) {
    if (!this._isActive) {
      this._startStream();
    }

    if (this._audioInputStream && this._audioInputStream.writable) {
      try {
        this._audioInputStream.write(pcmBuffer);
      } catch (error) {
        console.warn("[GSTT] Stream write error, restarting:", error.message);
        this._restartStream();
        // Retry after a short delay
        setTimeout(() => {
          if (this._audioInputStream && this._audioInputStream.writable) {
            this._audioInputStream.write(pcmBuffer);
          }
        }, 50);
      }
    }
  }

  _startStream() {
    this._cleanupStreams();

    this._audioInputStream = new PassThrough();
    
    const request = {
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: this._sampleRate,
        languageCode: this._languageCode,
        model: 'default',
        enableAutomaticPunctuation: true,
        speechContexts: [{
          phrases: [
            'alô', 'olá', 'testando', 'google', 'ouvindo',
            'boa noite', 'boa tarde', 'como vai', 'tá me ouvindo'
          ],
          boost: 15.0
        }]
      },
      interimResults: true,
      singleUtterance: false
    };

    this._recognizeStream = this._client
      .streamingRecognize(request)
      .on('error', (err) => {
        console.error("[GSTT] Recognition error:", err);
        this._isActive = false;
        setTimeout(() => this._restartStream(), 1000);
      })
      .on('end', () => {
        this._isActive = false;
        setTimeout(() => this._restartStream(), 100);
      })
      .on('data', (data) => {
        this._handleSpeechData(data);
      });

    this._audioInputStream.pipe(this._recognizeStream);
    this._isActive = true;
    console.log("[GSTT] Stream started");
  }

  _restartStream() {
    console.log("[GSTT] Restarting stream");
    this._cleanupStreams();
    this._startStream();
  }

  _cleanupStreams() {
    if (this._recognizeStream) {
      try {
        this._recognizeStream.removeAllListeners();
        this._recognizeStream.destroy();
      } catch (e) {
        console.warn("[GSTT] Error cleaning recognize stream:", e);
      }
    }
    
    if (this._audioInputStream) {
      try {
        this._audioInputStream.removeAllListeners();
        this._audioInputStream.destroy();
      } catch (e) {
        console.warn("[GSTT] Error cleaning audio stream:", e);
      }
    }
  }

  _handleSpeechData(data) {
    if (data.results && data.results[0]) {
      const result = data.results[0];
      if (result.alternatives && result.alternatives[0]) {
        const transcript = result.alternatives[0].transcript;
        const isFinal = result.isFinal;

        if (isFinal && transcript.trim() && this._onTranscription) {
          console.log(`[GSTT] FINAL: "${transcript}"`);
          this._onTranscription(transcript.trim());
        }
      }
    }
  }

  stop() {
    this._isActive = false;
    this._cleanupStreams();
  }
}

module.exports = { GoogleSTT };