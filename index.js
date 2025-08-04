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
    const METADATA_WAIT_TIMEOUT = 5000; // 5 segundos para esperar metadados
    const TARGET_SAMPLE_RATE = 16000;
    const FALLBACK_SAMPLE_RATE = 48000;
    const DEBUG_DIR = './debug_recordings';

    if (!fs.existsSync(DEBUG_DIR)) {
        fs.mkdirSync(DEBUG_DIR, { recursive: true });
    }

    let rec = null;
    let ffmpeg = null;
    let inputSampleRate = null;
    let connectionAlive = true;
    let audioBuffer = [];
    let metadataTimeout = null;
    let debugInterval = null;
    let isMetadataReceived = false; // Estado para otimização

    // Inicializa FFmpeg e Vosk quando temos o sample rate
    function initializeFfmpeg(sampleRate) {
        if (ffmpeg) {
            try {
                ffmpeg.stdin.end();
                ffmpeg.kill('SIGTERM');
            } catch (e) {
                console.error('Error killing previous ffmpeg:', e);
            }
        }
        
        // Cria o recognizer VOSK com a taxa de amostragem alvo
        rec = new vosk.Recognizer({ model, sampleRate: TARGET_SAMPLE_RATE });

        console.log(`[FFMPEG] Starting with input sample rate: ${sampleRate}Hz, output: ${TARGET_SAMPLE_RATE}Hz`);
        
        ffmpeg = spawn('ffmpeg', [
            '-f', 's16le',
            '-ar', String(sampleRate),
            '-ac', '1',
            '-i', 'pipe:0',
            '-f', 's16le',
            '-ar', String(TARGET_SAMPLE_RATE),
            '-ac', '1',
            '-loglevel', 'error',
            'pipe:1'
        ]);

        ffmpeg.stdout.on('data', (data) => {
            if (rec && connectionAlive) {
                if (rec.acceptWaveform(data)) {
                    const result = rec.result();
                    if (result.text) {
                        console.log('Result:', result.text);
                        ws.send(JSON.stringify({ tipo: 'frase', texto: result.text }));
                    }
                }
            }
        });

        ffmpeg.stderr.on('data', (data) => { console.error('[FFMPEG]', data.toString()); });
        ffmpeg.on('error', (err) => { console.error('FFmpeg error:', err); });
        ffmpeg.on('close', (code) => {
            console.log(`FFmpeg exited with code ${code}`);
            if (connectionAlive && code !== 0) {
                console.log('Restarting FFmpeg...');
                setTimeout(() => initializeFfmpeg(sampleRate), 1000);
            }
        });

        if (audioBuffer.length > 0) {
            console.log(`Processing ${audioBuffer.length} buffered chunks`);
            audioBuffer.forEach(chunk => ffmpeg.stdin.write(chunk));
            audioBuffer = [];
        }
    }

    // Inicia o timeout para metadados imediatamente
    metadataTimeout = setTimeout(() => {
        if (!isMetadataReceived) {
            console.log(`[TIMEOUT] Using fallback sample rate: ${FALLBACK_SAMPLE_RATE}Hz`);
            inputSampleRate = FALLBACK_SAMPLE_RATE;
            isMetadataReceived = true;
            initializeFfmpeg(inputSampleRate);
        }
    }, METADATA_WAIT_TIMEOUT);

    // Inicia o heartbeat de debug
    debugInterval = setInterval(() => {
        if (connectionAlive) console.log('[STATUS] Connection alive, sample rate:', inputSampleRate || 'waiting...');
    }, 10000);

    ws.on('message', (data) => {        
        // Se metadados já foram recebidos, assume que é áudio e otimiza
        if (isMetadataReceived) {
            if (Buffer.isBuffer(data)) {
                if (ffmpeg && ffmpeg.stdin.writable) {
                    ffmpeg.stdin.write(data);
                }
            }
            return;
        }

        // Tenta processar a mensagem como metadados JSON
        let messageContent = data;
        if (Buffer.isBuffer(data)) {
            try {
                messageContent = data.toString('utf8');
            } catch (e) {
                messageContent = data;
            }
        }

        if (typeof messageContent === 'string') {
            console.log("[DEBUG] Mensagem recebida:", data);
            try {
                const message = JSON.parse(messageContent);
                if (message.type === 'audio_metadata' && message.sampleRate) {
                    console.log(`[METADATA] Received sample rate: ${message.sampleRate}`);
                    
                    clearTimeout(metadataTimeout);
                    inputSampleRate = message.sampleRate;
                    isMetadataReceived = true;
                    initializeFfmpeg(inputSampleRate);
                    
                    return;
                }
            } catch (err) {
                // Não é JSON válido, ignora
            }
        }
        
        // Se ainda não recebeu metadados e é áudio, bufferiza
        if (Buffer.isBuffer(data)) {
            audioBuffer.push(data);
            // O timeout já foi iniciado, não é preciso iniciá-lo novamente
        }
    });

    function cleanup() {
        if (!connectionAlive) return;
        connectionAlive = false;
        
        if (debugInterval) clearInterval(debugInterval);
        if (metadataTimeout) clearTimeout(metadataTimeout);
        
        if (ffmpeg) {
            try { ffmpeg.stdin.end(); ffmpeg.kill(); } catch (e) { console.error('Cleanup error:', e); }
        }
        
        if (rec) {
            try { rec.free(); } catch (e) { console.error('Recognizer free error:', e); }
        }

        console.log('[CLEANUP] Connection closed.');
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