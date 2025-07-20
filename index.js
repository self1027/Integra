const express = require('express');
const path = require('path');
const { WebSocketServer } = require('ws');
const http = require('http');
const vosk = require('vosk');
const fs = require('fs');
const wav = require('wav');
const { spawn } = require('child_process');

// Configuração
const MODEL_PATH = './vosk-model-small-pt-0.3';
const TARGET_SAMPLE_RATE = 16000; // Vosk requer 16kHz
const DEBUG_DIR = 'debug_audio';

if (!fs.existsSync(MODEL_PATH)) {
  console.error('Modelo não encontrado. Baixe em: https://alphacephei.com/vosk/models');
  process.exit(1);
}

if (!fs.existsSync(DEBUG_DIR)) {
  fs.mkdirSync(DEBUG_DIR);
}

vosk.setLogLevel(0);
const model = new vosk.Model(MODEL_PATH);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

wss.on('connection', (ws) => {
    console.log('Cliente conectado via WebSocket');

    // Criação dos arquivos de debug
    const rawWriter = new wav.Writer({
        sampleRate: 48000,
        channels: 1,
        bitDepth: 16
    });
    const rawFile = fs.createWriteStream(`${DEBUG_DIR}/raw_${Date.now()}.wav`);
    rawWriter.pipe(rawFile);

    const processedWriter = new wav.Writer({
        sampleRate: TARGET_SAMPLE_RATE,
        channels: 1,
        bitDepth: 16
    });
    const processedFile = fs.createWriteStream(`${DEBUG_DIR}/processed_${Date.now()}.wav`);
    processedWriter.pipe(processedFile);

    const rec = new vosk.Recognizer({ 
        model, 
        sampleRate: TARGET_SAMPLE_RATE 
    });

    const ffmpeg = spawn('ffmpeg', [
        '-f', 's16le',
        '-ar', '48000',
        '-ac', '1',
        '-i', 'pipe:0',
        '-f', 's16le',
        '-ar', String(TARGET_SAMPLE_RATE),
        '-ac', '1',
        '-loglevel', 'quiet',
        'pipe:1'
    ]);

    ws.on('message', (data) => {
        if (data instanceof Buffer) {
            rawWriter.write(data);
            ffmpeg.stdin.write(data);
        }
    });

    ffmpeg.stdout.on('data', (resampled) => {
        processedWriter.write(resampled);

        if (rec.acceptWaveform(resampled)) {
            const result = rec.result();
            if (result.text) {
                console.log('Transcrição:', result.text);
            }
        }
    });

    function cleanup() {
        rawWriter.end();
        processedWriter.end();
        rec.free();
        ffmpeg.kill();
        console.log(`Áudio original salvo em: ${DEBUG_DIR}/raw_*.wav`);
        console.log(`Áudio processado salvo em: ${DEBUG_DIR}/processed_*.wav`);
    }

    ws.on('close', () => {
        console.log('Cliente desconectado');
        cleanup();
    });

    ws.on('error', (error) => {
        console.error('Erro WebSocket:', error);
        cleanup();
    });
});

server.listen(3000, () => {
    console.log('Servidor disponível em http://localhost:3000');
});
