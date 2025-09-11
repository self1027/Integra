const { WebSocketServer } = require('ws');
const { Ffmpeg } = require('../audioPipeline/Ffmpeg.js');
const { VoskSTT } = require('../audioPipeline/VoskSTT.js');
const { GoogleSTT } = require('../audioPipeline/GoogleSTT.js');
const { MODEL_PATH, TARGET_SAMPLE_RATE, FALLBACK_SAMPLE_RATE, METADATA_WAIT_TIMEOUT } = require('../config.js');
const vosk = require('vosk');
const fs = require('fs');

if (!fs.existsSync(MODEL_PATH)) { 
  console.error('Modelo não encontrado'); 
  process.exit(1); 
}

// The Vosk model is instantiated once, as it is a heavy object.
const voskModel = new vosk.Model(MODEL_PATH);
vosk.setLogLevel(0);

/**
 * A class to manage the WebSocket server, handling incoming connections
 * and orchestrating the audio transcription pipeline.
 */
class WebSocketServerManager {
  static init({ httpServer, httpsServer }) {
    [httpServer, httpsServer].forEach(server => {
      new WebSocketServer({ server }).on('connection', (ws, req) => {
        this._wsServerHandler(ws, req);
      });
    });
  }

  static _wsServerHandler(ws, req) {
    let isPipelineInitialized = false;
    let engine = 'vosk';
    let audioBuffer = [];
    let inputSampleRate = FALLBACK_SAMPLE_RATE;
    let ffmpegInstance = null;
    let sttInstance = null;

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
        ffmpegInstance.pushAudio(data);
        return;
      }

      const msg = tryParseJson(data);

      if (msg?.type === 'audio_metadata' && msg.sampleRate) {
        clearTimeout(metadataTimeout);
        inputSampleRate = msg.sampleRate;
        initPipeline(inputSampleRate);
        return;
      }

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
      console.log(`[WS] Initializing pipeline with engine: ${engine}, sample rate: ${sampleRate}`);

      // Create STT instance first
      if (engine === 'vosk') {
        sttInstance = new VoskSTT({ 
          model: voskModel, 
          sampleRate: TARGET_SAMPLE_RATE,
          onTranscription: (text) => {
            try {
              ws.send(JSON.stringify({ tipo: 'frase', texto: text }));
            } catch (error) {
              console.error('[WS] Erro ao enviar transcrição (Vosk):', error);
            }
          }
        });
      } else if (engine === 'gstt') {
        sttInstance = new GoogleSTT({
          sampleRate: TARGET_SAMPLE_RATE,
          languageCode: 'pt-BR',
          onTranscription: (text) => {
            try {
              ws.send(JSON.stringify({ tipo: 'frase', texto: text }));
            } catch (error) {
              console.error('[WS] Erro ao enviar transcrição (GSTT):', error);
            }
          }
        });
      }

      // Create and start FFmpeg instance
      ffmpegInstance = new Ffmpeg({
        inputSampleRate: sampleRate,
        outputSampleRate: TARGET_SAMPLE_RATE
      });

      ffmpegInstance.start({
        onData: (pcm) => {
          if (sttInstance) {
            sttInstance.pushAudio(pcm);
          }
        },
        onReady: () => {
          console.log('[WS] FFmpeg is ready');
          // Process buffered audio after FFmpeg is ready
          if (audioBuffer.length > 0) {
            console.log(`[WS] Processing ${audioBuffer.length} buffered chunks`);
            // Process buffered audio
            audioBuffer.forEach(chunk => {
              ffmpegInstance.pushAudio(chunk);
            });
            audioBuffer = [];
          }
        },
        onError: (error) => {
          console.error('[WS] FFmpeg error:', error);
          cleanup();
        }
      });
    }

    function cleanup() {
      console.log('[WS] Cleaning up');
      clearTimeout(metadataTimeout);
      
      if (ffmpegInstance) {
        ffmpegInstance.stop();
      }
      
      if (sttInstance && sttInstance.stop) {
        sttInstance.stop();
      }
      
      isPipelineInitialized = false;
      audioBuffer = [];
    }
  }
}

function tryParseJson(data) {
  if (Buffer.isBuffer(data)) data = data.toString('utf8');
  try { return JSON.parse(data); } catch { return null; }
}

module.exports = { WebSocketServerManager };