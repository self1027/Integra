const { WebSocketServer } = require('ws');
const { Ffmpeg } = require('../audioPipeline/Ffmpeg.js');
const { VoskSTT } = require('../audioPipeline/VoskSTT.js');
const { GoogleSTT } = require('../audioPipeline/GoogleSTT.js');
const { GoogleBilingualSTT } = require('../audioPipeline/GoogleBilingualSTT.js');
const { MODEL_PATH, TARGET_SAMPLE_RATE, FALLBACK_SAMPLE_RATE, METADATA_WAIT_TIMEOUT } = require('../config.js');
const vosk = require('vosk');
const fs = require('fs');

if (!fs.existsSync(MODEL_PATH)) { 
  console.error('Modelo não encontrado'); 
  process.exit(1); 
}

const voskModel = new vosk.Model(MODEL_PATH);
vosk.setLogLevel(0);

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

    const mainLang = urlParams.searchParams.get('main') || 'pt-BR';
    const secondaryLang = urlParams.searchParams.get('secondary');

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
        if (secondaryLang && mainLang !== secondaryLang) {
          sttInstance = new GoogleBilingualSTT({
            sampleRate: TARGET_SAMPLE_RATE,
            primaryLanguage: mainLang,
            secondaryLanguage: secondaryLang,
            onTranscription: (result) => {
              try {
                ws.send(JSON.stringify({
                  tipo: 'frase-bilingual',
                  ...result
                }));
              } catch (error) {
                console.error('[WS] Erro ao enviar transcrição (Bilingual):', error);
              }
            }
          });
        } else {
          sttInstance = new GoogleSTT({
            sampleRate: TARGET_SAMPLE_RATE,
            languageCode: mainLang,
            onTranscription: (text) => {
              try {
                ws.send(JSON.stringify({ 
                  tipo: 'frase-simples', 
                  texto: text 
                }));
              } catch (error) {
                console.error('[WS] Erro ao enviar transcrição (GSTT):', error);
              }
            }
          });
        }
      }

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
          if (audioBuffer.length > 0) {
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