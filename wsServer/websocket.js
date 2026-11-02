const { randomUUID } = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');
const { StreamingSession } = require('../audioPipeline/StreamingSession');
const { Translator } = require('../audioPipeline/Translator');

function attachWebSocket(server, { createPipeline, translate } = {}) {
  const translator = new Translator();
  const wss = new WebSocketServer({ server, maxPayload: 128 * 1024 });
  wss.on('connection', ws => {
    const sessionId = randomUUID();
    const send = event => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ ...event, sessionId }));
    };
    let pipeline;
    let ending = false;
    let closed = false;
    const session = new StreamingSession({
      translate: translate || translator.translate.bind(translator),
      send: event => {
        send(event);
      },
    });
    const fail = error => { send({ type: 'error', fatal: true, message: error.message }); cleanup(); ws.close(1011, 'Falha no pipeline de áudio'); };
    async function finish() {
      if (!pipeline || ending || closed) return;
      ending = true;
      try {
        await pipeline.finish();
        send({ type: 'audio_ended' });
      } catch (error) { if (!closed) fail(error); }
    }
    function cleanup() {
      if (closed) return;
      closed = true; clearTimeout(metadataTimer); session.cancel(); pipeline?.stop();
    }
    const metadataTimer = setTimeout(() => {
      if (!pipeline) { send({ type: 'error', message: 'Metadados de áudio não recebidos.' }); ws.close(1008, 'Metadados ausentes'); }
    }, 5000);
    send({ type: 'session' });
    ws.on('message', (data, isBinary) => {
      if (closed) return;
      try {
        if (isBinary) {
          if (!pipeline || ending || data.length % 2) { send({ type: 'error', message: 'Frame PCM fora de uma captura ativa ou inválido.' }); return; }
          pipeline.pushAudio(data); return;
        }
        const msg = JSON.parse(data.toString('utf8'));
        if (!msg || typeof msg !== 'object') throw new Error('Mensagem de controle inválida.');
        switch (msg.type) {
          case 'audio_metadata':
            if (pipeline) throw new Error('Esta sessão já possui uma captura.');
            if (!Number.isInteger(msg.sampleRate) || msg.sampleRate < 8000 || msg.sampleRate > 192000) throw new Error('Taxa de amostragem inválida.');
            clearTimeout(metadataTimer);
            pipeline = createPipeline(msg.sampleRate, event => { if (!closed) session.recognize(event); }, fail);
            send({ type: 'audio_ready' });
            break;
          case 'end_audio': finish(); break;
          case 'playback': session.playback(msg); break;
          case 'resolve': session.resolve(msg); break;
          case 'cancel': cleanup(); send({ type: 'cancelled' }); break;
          default: throw new Error('Controle desconhecido.');
        }
      } catch (error) { send({ type: 'error', message: error.message }); }
    });
    ws.on('close', cleanup);
    ws.on('error', cleanup);
  });
  return wss;
}

class WebSocketServerManager {
  static init({ httpServer, httpsServer }) {
    const vosk = require('vosk');
    const { MODEL_PATH, TARGET_SAMPLE_RATE } = require('../config');
    const { Ffmpeg } = require('../audioPipeline/Ffmpeg');
    const { VoskSTT } = require('../audioPipeline/VoskSTT');
    vosk.setLogLevel(-1);
    const model = new vosk.Model(MODEL_PATH);
    const createPipeline = (inputSampleRate, onRecognition, onError) => {
      const stt = new VoskSTT({ model, sampleRate: TARGET_SAMPLE_RATE, onRecognition });
      const ffmpeg = new Ffmpeg({ inputSampleRate, outputSampleRate: TARGET_SAMPLE_RATE });
      ffmpeg.start({ onData: data => { try { stt.pushAudio(data); } catch (error) { onError(error); } }, onError });
      return {
        pushAudio: buffer => ffmpeg.pushAudio(buffer),
        finish: async () => { await ffmpeg.finish(); stt.finish(); },
        stop: () => { ffmpeg.stop(); stt.stop(); },
      };
    };
    return [httpServer, httpsServer].filter(Boolean).map(server => attachWebSocket(server, { createPipeline }));
  }
}

module.exports = { WebSocketServerManager, attachWebSocket };
