const speech = require('@google-cloud/speech');
const { PassThrough } = require('stream');

let client;
let recognizeStream;
let sampleRateHertz;
let languageCode;
let onTranscription;
let audioInputStream;
let isStreamActive = false;

function init({ sampleRate, languageCode: lang, onTranscription: callback }) {
  sampleRateHertz = sampleRate;
  languageCode = lang;
  onTranscription = callback;

  if (!client) {
    client = new speech.SpeechClient();
  }

  startContinuousStream();
}

function startContinuousStream() {
  // Limpa streams existentes
  if (recognizeStream) {
    try {
      recognizeStream.removeAllListeners();
      recognizeStream.destroy();
    } catch (e) {}
  }

  if (audioInputStream) {
    try {
      audioInputStream.removeAllListeners();
      audioInputStream.destroy();
    } catch (e) {}
  }

  // Cria novo stream de áudio
  audioInputStream = new PassThrough();
  audioInputStream.on('error', (err) => {});

  const request = {
    config: {
      encoding: 'LINEAR16',
      sampleRateHertz: sampleRateHertz,
      languageCode: languageCode,
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

  recognizeStream = client
    .streamingRecognize(request)
    .on('error', (err) => {
      isStreamActive = false;
      setTimeout(() => {
        startContinuousStream();
      }, 1000);
    })
    .on('end', () => {
      isStreamActive = false;
      setTimeout(() => {
        startContinuousStream();
      }, 100);
    })
    .on('data', (data) => {
      handleSpeechData(data);
    });

  audioInputStream.pipe(recognizeStream);
  isStreamActive = true;
}

function handleSpeechData(data) {
  if (data.results && data.results[0]) {
    const result = data.results[0];
    
    if (result.alternatives && result.alternatives[0]) {
      const transcript = result.alternatives[0].transcript;
      const isFinal = result.isFinal;

      if (!isFinal) {
        console.log(`[GSTT] INTERIM: "${transcript}"`);
      } else {
        console.log(`[GSTT] FINAL: "${transcript}"`);
        
        if (transcript.trim() && onTranscription) {
          onTranscription(transcript.trim());
        }
      }
    }
  }
}

function acceptAudio(pcmBuffer) {
  if (!isStreamActive) {
    startContinuousStream();
    setTimeout(() => acceptAudio(pcmBuffer), 100);
    return;
  }

  if (audioInputStream && audioInputStream.writable && !audioInputStream.destroyed) {
    try {
      audioInputStream.write(pcmBuffer);
    } catch (error) {
      startContinuousStream();
    }
  } else {
    startContinuousStream();
  }
}

function stop() {
  isStreamActive = false;
  
  if (recognizeStream) {
    try {
      recognizeStream.removeAllListeners();
      recognizeStream.destroy();
    } catch (e) {}
    recognizeStream = null;
  }
  
  if (audioInputStream) {
    try {
      audioInputStream.removeAllListeners();
      audioInputStream.destroy();
    } catch (e) {}
    audioInputStream = null;
  }
}

module.exports = { init, acceptAudio, stop };