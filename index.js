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
  res.sendFile(path.join(__dirname, 'public', 'landpage.html'));
});

app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

const httpServer = http.createServer(app);
const httpsServer = https.createServer(SSL_OPTIONS, app);

// WebSocket Server para HTTP
const wssHttp = new WebSocketServer({ server: httpServer });

// WebSocket Server para HTTPS
const wssHttps = new WebSocketServer({ server: httpsServer });

function setupWebSocket(ws) {
    const TARGET_SAMPLE_RATE = 16000; // Fixo para o Vosk
    const FALLBACK_SAMPLE_RATE = 48000; // Valor fallback
    
    let rec = new vosk.Recognizer({ 
        model, 
        sampleRate: TARGET_SAMPLE_RATE
    });

    let ffmpeg = null;
    let inputSampleRate = FALLBACK_SAMPLE_RATE;
    let connectionAlive = true;
    let usingWsSampleRate = false; // Flag para controlar a origem do sample rate

    // Inicializa com fallback
    initializeFfmpeg(FALLBACK_SAMPLE_RATE, false);

    ws.on('message', (data) => {
        if (!connectionAlive) return;

        try {
            // Verifica se é metadado com sample rate
            if (typeof data === 'string') {
                try {
                    const message = JSON.parse(data);
                    if (message.type === 'audio_metadata' && message.sampleRate) {
                        const newSampleRate = Number(message.sampleRate);
            
                        if (newSampleRate !== inputSampleRate) {
                            inputSampleRate = newSampleRate;
                            usingWsSampleRate = true;
                            initializeFfmpeg(inputSampleRate, true);
                            console.log(`[WS-SR] Configurado FFmpeg com sample rate do WebSocket: ${inputSampleRate}Hz → ${TARGET_SAMPLE_RATE}Hz`);
                        }
                    }
                    return;
                } catch (err) {
                    console.warn('Ignorando dado string inválido:', err.message);
                }
            }            

            // Processa dados de áudio
            if (data instanceof Buffer && ffmpeg && !ffmpeg.stdin.writableEnded) {
                ffmpeg.stdin.write(data);
            }
        } catch (err) {
            console.error('Erro ao processar mensagem:', err);
        }
    });

    function initializeFfmpeg(sampleRate, fromWebSocket) {
        if (ffmpeg) {
            try { ffmpeg.kill(); } catch (e) { 
                console.error('Error killing ffmpeg:', e); 
            }
        }

        ffmpeg = spawn('ffmpeg', [
            '-f', 's16le',
            '-ar', String(sampleRate),
            '-ac', '1',
            '-i', 'pipe:0',
            '-f', 's16le',
            '-ar', String(TARGET_SAMPLE_RATE),
            '-ac', '1',
            '-loglevel', 'quiet',
            'pipe:1'
        ]);

        setupFfmpegHandlers();
        
        if (!fromWebSocket) {
            console.log(`[FALLBACK-SR] Configurado FFmpeg com sample rate fallback: ${sampleRate}Hz → ${TARGET_SAMPLE_RATE}Hz`);
        }
    }

    function setupFfmpegHandlers() {
        ffmpeg.stdout.on('data', (resampled) => {
            if (!connectionAlive) return;
            if (rec.acceptWaveform(resampled)) {
                const result = rec.result();
                if (result.text) {
                    ws.send(JSON.stringify({ 
                        tipo: 'frase', 
                        texto: result.text
                    }));
                    console.log(result.text)
                }
            }
        });

        ffmpeg.stderr.on('data', (data) => {
            console.error('ffmpeg stderr:', data.toString());
        });

        ffmpeg.on('error', (err) => {
            console.error('ffmpeg error:', err);
            cleanup();
        });

        ffmpeg.on('close', (code) => {
            console.log(`ffmpeg process exited with code ${code}`);
            cleanup();
        });
    }

    function cleanup() {
        if (!connectionAlive) return;
        connectionAlive = false;
        
        try { rec.free(); } catch (e) { 
            console.error('Error freeing recognizer:', e); 
        }
        
        try { if (ffmpeg) ffmpeg.kill(); } catch (e) { 
            console.error('Error killing ffmpeg:', e); 
        }
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