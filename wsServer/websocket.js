const { WebSocketServer } = require('ws');
const ffmpeg = require('../audioPipeline/ffmpeg');
const voskRecognizer = require('../audioPipeline/voskRecognizer');
const { MODEL_PATH, TARGET_SAMPLE_RATE, FALLBACK_SAMPLE_RATE, METADATA_WAIT_TIMEOUT } = require('../config');
const vosk = require('vosk');
const fs = require('fs');

if (!fs.existsSync(MODEL_PATH)) { console.error('Modelo não encontrado'); process.exit(1); }

const voskModel = new vosk.Model(MODEL_PATH);
vosk.setLogLevel(0);

const WebSocketServerManager = {
  init({ httpServer, httpsServer }) {
    [httpServer, httpsServer].forEach(server => {
      new WebSocketServer({ server }).on('connection', wsServerHandler);
    });
    console.log('[WS] Servidores WebSocket inicializados');
  }
};

function wsServerHandler(ws) {
  let inputSampleRate = null;
  let audioBuffer = [];
  let isMetadataReceived = false;

  const metadataTimeout = setTimeout(() => {
    if (!isMetadataReceived) initPipeline(FALLBACK_SAMPLE_RATE);
  }, METADATA_WAIT_TIMEOUT);

  ws.on('message', (data) => {
    if (isMetadataReceived) return ffmpeg.pushAudio(data);

    const msg = tryParseJson(data);
    if (msg?.type === 'audio_metadata' && msg.sampleRate) {
      clearTimeout(metadataTimeout);
      initPipeline(msg.sampleRate);
      return;
    }

    if (Buffer.isBuffer(data)) audioBuffer.push(data);
  });

  ws.on('close', cleanup);
  ws.on('error', cleanup);

  function initPipeline(sampleRate) {
    isMetadataReceived = true;
    inputSampleRate = sampleRate;

    voskRecognizer.init({ model: voskModel, sampleRate: TARGET_SAMPLE_RATE });
    ffmpeg.start({
      inputSampleRate: sampleRate,
      outputSampleRate: TARGET_SAMPLE_RATE,
      onData: (pcm) => {
        const text = voskRecognizer.acceptAudio(pcm);
        if (text) ws.send(JSON.stringify({ tipo: 'frase', texto: text }));
      }
    });

    audioBuffer.forEach(chunk => ffmpeg.pushAudio(chunk));
    audioBuffer = [];
  }

  function cleanup() {
    clearTimeout(metadataTimeout);
    ffmpeg.stop();
    voskRecognizer.stop();
  }
}

function tryParseJson(data) {
  if (Buffer.isBuffer(data)) data = data.toString('utf8');
  try { return JSON.parse(data); } catch { return null; }
}

module.exports = { WebSocketServerManager };
