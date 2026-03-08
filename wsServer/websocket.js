const { WebSocketServer } = require('ws');
const { Ffmpeg } = require('../audioPipeline/Ffmpeg.js');
const { VoskSTT } = require('../audioPipeline/VoskSTT.js');
const { MODEL_PATH, TARGET_SAMPLE_RATE, FALLBACK_SAMPLE_RATE, METADATA_WAIT_TIMEOUT } = require('../config.js');
const vosk = require('vosk');
const fs = require('fs');

if (!fs.existsSync(MODEL_PATH)) { 
    console.error('Modelo Vosk não encontrado em:', MODEL_PATH); 
    process.exit(1); 
}

const voskModel = new vosk.Model(MODEL_PATH);
vosk.setLogLevel(-1);

class WebSocketServerManager {
    static init({ httpServer, httpsServer }) {
        const servers = [httpServer, httpsServer].filter(Boolean);
        servers.forEach(server => {
            new WebSocketServer({ server }).on('connection', (ws, req) => {
                this._wsServerHandler(ws, req);
            });
        });
    }

    static _wsServerHandler(ws, req) {
        let isPipelineInitialized = false;
        let audioBuffer = [];
        let inputSampleRate = FALLBACK_SAMPLE_RATE;
        let ffmpegInstance = null;
        let sttInstance = null;

        // Timeout para iniciar o pipeline caso os metadados demorem
        const metadataTimeout = setTimeout(() => {
            if (!isPipelineInitialized) initPipeline(FALLBACK_SAMPLE_RATE);
        }, METADATA_WAIT_TIMEOUT);

        ws.on('message', (data) => {    
            if (isPipelineInitialized) {
                ffmpegInstance.pushAudio(data);
                return;
            }

            const msg = tryParseJson(data);

            // Prioridade 1: Metadados explícitos do front
            if (msg?.type === 'audio_metadata' && msg.sampleRate) {
                clearTimeout(metadataTimeout);
                inputSampleRate = msg.sampleRate;
                initPipeline(inputSampleRate);
                return;
            }

            // Prioridade 2: Se começar a chegar buffer binário antes dos metadados
            if (Buffer.isBuffer(data)) {
                clearTimeout(metadataTimeout);
                audioBuffer.push(data);
                if (!isPipelineInitialized) initPipeline(inputSampleRate);
            }
        });

        ws.on('close', cleanup);
        ws.on('error', cleanup);

        function initPipeline(sampleRate) {
            if (isPipelineInitialized) return;
            isPipelineInitialized = true;

            // STT focado apenas no Vosk para a Demo
            sttInstance = new VoskSTT({ 
                model: voskModel, 
                sampleRate: TARGET_SAMPLE_RATE,
                onTranscription: (text) => {
                    try {
                        ws.send(JSON.stringify({ texto: text }));
                    } catch (e) { console.error('[WS] Erro ao enviar:', e); }
                }
            });

            ffmpegInstance = new Ffmpeg({
                inputSampleRate: sampleRate,
                outputSampleRate: TARGET_SAMPLE_RATE
            });

            ffmpegInstance.start({
                onData: (pcm) => sttInstance.pushAudio(pcm),
                onReady: () => {
                    if (audioBuffer.length > 0) {
                        audioBuffer.forEach(chunk => ffmpegInstance.pushAudio(chunk));
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
            if (ffmpegInstance) ffmpegInstance.stop();
            if (sttInstance) sttInstance.stop();
            isPipelineInitialized = false;
        }
    }
}

function tryParseJson(data) {
    if (Buffer.isBuffer(data)) data = data.toString('utf8');
    try { return JSON.parse(data); } catch { return null; }
}

module.exports = { WebSocketServerManager };