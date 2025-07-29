const express = require('express');
const path = require('path');
const { WebSocketServer } = require('ws');
const http = require('http');
const vosk = require('vosk');
const fs = require('fs');
const wav = require('wav');
const { spawn } = require('child_process');

const MODEL_PATH = './vosk-model-small-pt-0.3';
const TARGET_SAMPLE_RATE = 16000;

if (!fs.existsSync(MODEL_PATH)) {
  console.error('Modelo não encontrado.');
  process.exit(1);
}

vosk.setLogLevel(0);
const model = new vosk.Model(MODEL_PATH);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

wss.on('connection', (ws) => {
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

    let connectionAlive = true;

    ws.on('message', (data) => {
        if (!connectionAlive) return;
        if (data instanceof Buffer && !ffmpeg.stdin.writableEnded) {
            ffmpeg.stdin.write(data);
        }
    });

    ffmpeg.stdout.on('data', (resampled) => {
        if (!connectionAlive) return;
        if (rec.acceptWaveform(resampled)) {
            const result = rec.result();
            if (result.text) {
                ws.send(JSON.stringify({ tipo: 'frase', texto: result.text })); //Envia pro front
            }
        }
    });

    function cleanup() {
        connectionAlive = false;
        try { rec.free(); } catch (e) {}
        try { ffmpeg.kill(); } catch (e) {}
    }

    ws.on('close', cleanup);
    ws.on('error', cleanup);
});

// Rota principal - redireciona para landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota para a landing page
app.get('/landing', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// Rota para a versão desktop
app.get('/desktop', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'desktop.html'));
});

// Rota para a versão mobile
app.get('/mobile', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
});

server.listen(3000, () => {
    console.log('Servidor disponível em http://localhost:3000');
});