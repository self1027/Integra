const { WebSocketServer } = require('ws');
const ffmpeg = require('../audioPipeline/ffmpeg');
const voskRecognizer = require('../audioPipeline/voskRecognizer');
const gstt = require('../audioPipeline/gsttPipeline');
const { MODEL_PATH, TARGET_SAMPLE_RATE, FALLBACK_SAMPLE_RATE, METADATA_WAIT_TIMEOUT } = require('../config');
const vosk = require('vosk');
const fs = require('fs');

if (!fs.existsSync(MODEL_PATH)) { 
  console.error('Modelo não encontrado'); 
  process.exit(1); 
}

const voskModel = new vosk.Model(MODEL_PATH);
vosk.setLogLevel(0);

const WebSocketServerManager = {
  init({ httpServer, httpsServer }) {
    [httpServer, httpsServer].forEach(server => {
      new WebSocketServer({ server }).on('connection', wsServerHandler);
    });
  }
};

function wsServerHandler(ws, req) {
  let isPipelineInitialized = false;
  let engine = 'vosk'; // padrão
  let audioBuffer = [];
  let inputSampleRate = FALLBACK_SAMPLE_RATE;

  // Detecta o engine pela URL/query
  const urlParams = new URL(req.url, `http://${req.headers.host}`);
  if (urlParams.searchParams.has('engine')) {
    engine = urlParams.searchParams.get('engine');
  }

  const metadataTimeout = setTimeout(() => {
    if (!isPipelineInitialized) {
      initPipeline(FALLBACK_SAMPLE_RATE);
    }
  }, METADATA_WAIT_TIMEOUT);

  ws.on('message', (data) => {    
    if (isPipelineInitialized) {
      return ffmpeg.pushAudio(data);
    }

    const msg = tryParseJson(data);

    // Processa metadados de áudio
    if (msg?.type === 'audio_metadata' && msg.sampleRate) {
      clearTimeout(metadataTimeout);
      inputSampleRate = msg.sampleRate;
      initPipeline(inputSampleRate);
      return;
    }

    // Processa buffer de áudio recebido antes da inicialização
    if (Buffer.isBuffer(data)) {
      clearTimeout(metadataTimeout);
      audioBuffer.push(data);
      
      if (!isPipelineInitialized) {
        initPipeline(inputSampleRate);
      }
    }
  });

  ws.on('close', cleanup);
  ws.on('error', cleanup);

  function initPipeline(sampleRate) {
    if (isPipelineInitialized) return;

    isPipelineInitialized = true;

    if (engine === 'vosk') {
      voskRecognizer.init({ model: voskModel, sampleRate: TARGET_SAMPLE_RATE });
    } else if (engine === 'gstt') {
      gstt.init({
        sampleRate: TARGET_SAMPLE_RATE,
        languageCode: 'pt-BR',
        onTranscription: (text) => {
          try {
            ws.send(JSON.stringify({ tipo: 'frase', texto: text }));
          } catch (error) {
            console.error('[WS] Erro ao enviar transcrição:', error);
          }
        }
      });
    }

    ffmpeg.start({
      inputSampleRate: sampleRate,
      outputSampleRate: TARGET_SAMPLE_RATE,
      onData: (pcm) => {
        if (engine === 'vosk') {
          const text = voskRecognizer.acceptAudio(pcm);
          if (text) {
            try {
              ws.send(JSON.stringify({ tipo: 'frase', texto: text }));
            } catch (error) {
              console.error('[WS] Erro ao enviar transcrição:', error);
            }
          }
        } else if (engine === 'gstt') {
          gstt.acceptAudio(pcm);
        }
      }
    });
    
    // Processa buffer de áudio armazenado
    setTimeout(() => {
      if (audioBuffer.length > 0) {
        audioBuffer.forEach(chunk => {
          if (ffmpeg.pushAudio) {
            ffmpeg.pushAudio(chunk);
          }
        });
        audioBuffer = [];
      }
    }, 100);
  }

  function cleanup() {
    clearTimeout(metadataTimeout);
    ffmpeg.stop();
    voskRecognizer.stop();
    gstt.stop();
    isPipelineInitialized = false;
  }
}

function tryParseJson(data) {
  if (Buffer.isBuffer(data)) data = data.toString('utf8');
  try { return JSON.parse(data); } catch { return null; }
}

module.exports = { WebSocketServerManager };