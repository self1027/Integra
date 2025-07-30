const express = require('express');
const path = require('path');
const { WebSocketServer } = require('ws');
const http = require('http');
const https = require('https');
const fs = require('fs');
const vosk = require('vosk');
const wav = require('wav');
const { spawn } = require('child_process');

const MODEL_PATH = './vosk-model-small-pt-0.3';
const TARGET_SAMPLE_RATE = 16000;

if (!fs.existsSync(MODEL_PATH)) {
  console.error('Modelo não encontrado.');
  process.exit(1);
}

const HTTPS_PORT = 443;
const HTTP_PORT = 2000;
const SSL_OPTIONS = {
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem')
};

vosk.setLogLevel(0);
const model = new vosk.Model(MODEL_PATH);

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const httpServer = http.createServer(app);
const httpsServer = https.createServer(SSL_OPTIONS, app);

// WebSocket Server para HTTP
const wssHttp = new WebSocketServer({ server: httpServer });

// WebSocket Server para HTTPS
const wssHttps = new WebSocketServer({ server: httpsServer });

function setupWebSocket(ws) {
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
                ws.send(JSON.stringify({ tipo: 'frase', texto: result.text }));
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
}

wssHttp.on('connection', setupWebSocket);
wssHttps.on('connection', setupWebSocket);

http.createServer((req, res) => {
    res.writeHead(301, { 
        "Location": `https://${req.headers.host}${req.url}` 
    });
    res.end();
}).listen(HTTP_PORT);

httpServer.listen(1000, () => {
    console.log('Servidor HTTP disponível em http://localhost:1000');
});

httpsServer.listen(HTTPS_PORT, () => {
    console.log(`Servidor HTTPS disponível em https://localhost:${HTTPS_PORT}`);
});