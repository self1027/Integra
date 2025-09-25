const { PassThrough } = require('stream');
const { SpeechClient } = require('@google-cloud/speech');
const { Translate } = require('@google-cloud/translate').v2;

class GoogleBilingualSTT {
  constructor({ 
    sampleRate, 
    primaryLanguage, 
    secondaryLanguage, 
    onTranscription,
    model = 'default',
    enableAutomaticPunctuation = true 
  }) {
    this._client = new SpeechClient();
    this._translator = new Translate();
    this._sampleRate = sampleRate;
    this._primaryLanguage = primaryLanguage;
    this._secondaryLanguage = secondaryLanguage;
    this._onTranscription = onTranscription;
    this._model = model;
    this._enableAutomaticPunctuation = enableAutomaticPunctuation;
    this._audioInputStream = null;
    this._recognizeStream = null;
    this._isActive = false;
  }

  async init() {
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
        console.warn("[GSTT-Bilingual] Stream write error, restarting:", error.message);
        this._restartStream();
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
        languageCode: this._primaryLanguage,
        alternativeLanguageCodes: this._secondaryLanguage ? [this._secondaryLanguage] : undefined,
        model: this._model,
        enableAutomaticPunctuation: this._enableAutomaticPunctuation
      },
      interimResults: true,
      singleUtterance: false
    };

    this._recognizeStream = this._client
      .streamingRecognize(request)
      .on('error', (err) => {
        console.error("[GSTT-Bilingual] Recognition error:", err);
        this._isActive = false;
        setTimeout(() => this._restartStream(), 1000);
      })
      .on('end', () => {
        this._isActive = false;
        setTimeout(() => this._restartStream(), 100);
        console.log("restartou");
      })
      .on('data', (data) => {
        this._handleSpeechData(data);
      });

    this._audioInputStream.pipe(this._recognizeStream);
    this._isActive = true;
    console.log(`[GSTT-Bilingual] Stream started for languages: ${this._primaryLanguage}, ${this._secondaryLanguage}`);
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

      // Função que aguarda a tradução - SEMPRE tenta traduzir
      async function handleTranslation(transcript, translator, targetLanguage) {
    if (!translator || !targetLanguage || !transcript) return null;
    
    try {
        console.log(`[DEBUG] Original: "${transcript}"`);
        
        // 1. Extrai partes em inglês
        const englishParts = extractEnglishPhrases(transcript);
        console.log(`[DEBUG] English parts found:`, englishParts);
        
        if (englishParts.length === 0) {
            console.log(`[DEBUG] No English parts to translate`);
            return null;
        }
        
        // 2. Traduz apenas as partes em inglês
        const translatedParts = [];
        for (const part of englishParts) {
            try {
                const [translated] = await translator.translate(part, targetLanguage);
                if (translated && translated.toLowerCase() !== part.toLowerCase()) {
                    translatedParts.push({ original: part, translated });
                }
            } catch (err) {
                console.warn(`[DEBUG] Failed to translate part: "${part}"`, err);
            }
        }
        
        if (translatedParts.length === 0) {
            console.log(`[DEBUG] No successful translations`);
            return null;
        }
        
        // 3. Substitui no texto original
        let finalText = transcript;
        for (const { original, translated } of translatedParts) {
            finalText = finalText.replace(original, translated);
        }
        
        console.log(`[DEBUG] Final translated text: "${finalText}"`);
        return finalText;
        
    } catch (err) {
        console.error("[GSTT-Bilingual] Translation error:", err);
    }
    return null;
}

function extractEnglishPhrases(text) {
    const phrases = new Set();
    const words = text.split(/\s+/).filter(word => word); // Filter out empty strings from multiple spaces

    // This nested loop creates and checks every possible word combination up to 5 words long.
    for (let i = 0; i < words.length; i++) {
        // Iterate through potential phrase endings
        for (let j = i + 1; j <= Math.min(i + 5, words.length); j++) {
            const phrase = words.slice(i, j).join(' ');
            if (isLikelyEnglish(phrase)) {
                phrases.add(phrase);
            }
        }
    }

    // Sort the phrases by length in descending order to return the longest, most complete ones first.
    return Array.from(phrases).sort((a, b) => b.length - a.length);
}

function isLikelyEnglish(phrase) {
    if (phrase.length < 3) return false;

    const englishWords = [
        // Articles & Determiners
        'the', 'a', 'an', 'this', 'that', 'these', 'those', 'some', 'any', 'every',
        // Pronouns
        'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'who', 'what', 'where', 'when', 'why', 'how', 'which', 'whom',
        // Common Verbs (infinitive form)
        'be', 'is', 'am', 'are', 'was', 'were', 'been', 'do', 'did', 'done', 'have', 'has', 'had', 'go', 'went', 'gone', 'get', 'got', 'make', 'made', 'know', 'knew', 'known', 'take', 'took', 'taken', 'see', 'saw', 'seen', 'come', 'came', 'coming', 'think', 'thought', 'want', 'look', 'use', 'find', 'give', 'tell', 'say', 'saying', 'said', 'work', 'call', 'try', 'ask', 'need', 'feel', 'become', 'leave', 'put', 'let', 'show', 'mean', 'keep', 'begin',
        // Prepositions
        'of', 'in', 'to', 'for', 'on', 'with', 'at', 'from', 'by', 'about', 'as', 'into', 'like', 'through', 'after', 'over', 'between', 'under', 'down', 'up', 'out', 'across', 'against', 'around',
        // Conjunctions
        'and', 'or', 'but', 'if', 'because', 'so', 'until', 'while', 'when',
        // Adverbs & Adjectives
        'not', 'just', 'more', 'most', 'very', 'only', 'also', 'then', 'now', 'well', 'first', 'new', 'good', 'great', 'many', 'much', 'little', 'high', 'low', 'old', 'young', 'able', 'right', 'left', 'small', 'big', 'long', 'short',
        // Common Nouns
        'time', 'person', 'year', 'way', 'day', 'man', 'thing', 'woman', 'life', 'world', 'hand', 'part', 'child', 'eye', 'place', 'work', 'week', 'case', 'point', 'company', 'number', 'group', 'problem', 'home', 'business', 'book', 'table'
    ];

    const words = phrase.toLowerCase().split(/\s+/);
    
    // Check if at least 3 words in the phrase are from the common English word list.
    // A higher threshold (e.g., 3 instead of 2) makes the detection more reliable for short phrases.
    const englishCount = words.filter(word => englishWords.includes(word)).length;
    return englishCount >= 3;
}

      // SEMPRE tenta traduzir, independente da língua detectada
      const translatedText = await handleTranslation(
          transcript, 
          this._translator, 
          this._primaryLanguage
      );

      const payload = {
          raw: transcript,
          translated: translatedText, // Será null se a tradução for idêntica ou falhar
          language: languageCode,
          confidence: result.alternatives[0].confidence,
          isPrimary: languageCode.toLowerCase() === this._primaryLanguage.toLowerCase()
      };

      // Log final para debugging
      console.log(`[GSTT-Bilingual] Payload:`, {
          language: payload.language,
          isPrimary: payload.isPrimary,
          hasTranslation: !!payload.translated,
          transcriptLength: transcript.length
      });

      this._onTranscription(payload);
  }

  _restartStream() {
    console.log("[GSTT-Bilingual] Restarting stream");
    this._cleanupStreams();
    this._startStream();
  }

  _cleanupStreams() {
    if (this._recognizeStream) {
      try {
        this._recognizeStream.removeAllListeners();
        this._recognizeStream.destroy();
      } catch (e) {
        console.warn("[GSTT-Bilingual] Error cleaning recognize stream:", e);
      }
    }
    
    if (this._audioInputStream) {
      try {
        this._audioInputStream.removeAllListeners();
        this._audioInputStream.destroy();
      } catch (e) {
        console.warn("[GSTT-Bilingual] Error cleaning audio stream:", e);
      }
    }
  }

  stop() {
    this._isActive = false;
    this._cleanupStreams();
  }
}

module.exports = { GoogleBilingualSTT };
