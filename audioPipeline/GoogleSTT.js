const { BaseGoogleSTT } = require('./BaseGoogleSTT');

class GoogleSTT extends BaseGoogleSTT {
  constructor({ sampleRate, languageCode, onTranscription }) {
    super({ sampleRate, languageCode, onTranscription });
  }

  getRequestConfig() {
    return {
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: this._config.sampleRate,
        languageCode: this._config.languageCode,
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

  _onStreamStart() {
    console.log("[GSTT] Stream started");
  }
}

module.exports = { GoogleSTT };