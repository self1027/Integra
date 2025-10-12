const { TranslationServiceClient } = require('@google-cloud/translate');
const { BaseGoogleSTT } = require('./BaseGoogleSTT');

class GoogleBilingualSTT extends BaseGoogleSTT {
  constructor({ 
    sampleRate, 
    primaryLanguage, 
    secondaryLanguage, 
    onTranscription,
    model = 'default',
    enableAutomaticPunctuation = true,
    projectId = process.env.GOOGLE_CLOUD_PROJECT
  }) {
    super({ 
      sampleRate, 
      primaryLanguage, 
      secondaryLanguage, 
      onTranscription,
      model,
      enableAutomaticPunctuation 
    });
    
    this._translationClient = new TranslationServiceClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });
    
    this._projectId = projectId;
    this._location = 'global';
  }

  getRequestConfig() {
    return {
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: this._config.sampleRate,
        languageCode: this._config.primaryLanguage,
        alternativeLanguageCodes: this._config.secondaryLanguage ? [this._config.secondaryLanguage] : undefined,
        model: this._config.model,
        enableAutomaticPunctuation: this._config.enableAutomaticPunctuation
      },
      interimResults: true,
      singleUtterance: false
    };
  }

  async _handleSpeechData(data) {
    if (!data.results || !data.results[0]) return;

    const result = data.results[0];
    if (!result.alternatives || !result.alternatives[0]) return;

    const transcript = result.alternatives[0].transcript.trim();
    const isFinal = result.isFinal;
    const languageCode = result.languageCode;

    if (!isFinal || !transcript || !this._onTranscription) return;

    console.log(`[GSTT-Bilingual] FINAL (${languageCode}): "${transcript}"`);

    // SEMPRE tentar traduzir, independente do idioma detectado
    const translatedText = await this._handleTranslation(transcript, languageCode);
    
    const payload = {
      raw: transcript,
      translated: translatedText,
      language: languageCode,
      confidence: result.alternatives[0].confidence,
      isPrimary: languageCode.toLowerCase() === this._config.primaryLanguage.toLowerCase()
    };

    console.log(`[GSTT-Bilingual] Payload:`, {
      language: payload.language,
      isPrimary: payload.isPrimary,
      hasTranslation: !!payload.translated,
      transcriptLength: transcript.length
    });

    this._onTranscription(payload);
  }

  async _handleTranslation(transcript, detectedLanguage) {
    if (!this._translationClient || !this._projectId || !this._config.primaryLanguage || !this._config.secondaryLanguage || !transcript) {
      return null;
    }
    
    try {
      console.log(`[DEBUG] Attempting translation from ${this._config.secondaryLanguage} to ${this._config.primaryLanguage}: "${transcript}"`);
      
      // SEMPRE tentar traduzir do secondary para primary
      const request = {
        parent: `projects/${this._projectId}/locations/${this._location}`,
        contents: [transcript],
        mimeType: 'text/plain',
        sourceLanguageCode: this._config.secondaryLanguage,
        targetLanguageCode: this._config.primaryLanguage,
      };

      const [response] = await this._translationClient.translateText(request);
      
      if (response.translations && response.translations[0]) {
        const translatedText = response.translations[0].translatedText;
        
        console.log(`[DEBUG] API Response: "${translatedText}"`);
        
        if (translatedText && translatedText.toLowerCase() !== transcript.toLowerCase()) {
          console.log(`[DEBUG] Translation successful`);
          return translatedText;
        } else {
          console.log(`[DEBUG] Translation identical to original`);
          return null;
        }
      }
      
      return null;
      
    } catch (err) {
      console.error("[GSTT-Bilingual] Translation error:", err);
      return null;
    }
  }

  _onStreamStart() {
    console.log(`[GSTT-Bilingual] Stream started for languages: ${this._config.primaryLanguage}, ${this._config.secondaryLanguage}`);
  }
}

module.exports = { GoogleBilingualSTT };