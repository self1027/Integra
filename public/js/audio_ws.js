const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDiv = document.getElementById('status');

let socket;
let audioContext;
let processor;
let stream;
let reconnectAttempts = 0;
const MAX_RETRIES = 3;

function updateStatus(text, className) {
    statusDiv.textContent = text;
    statusDiv.className = className;
}

async function connectWebSocket() {
    return new Promise((resolve, reject) => {
        updateStatus("Conectando ao servidor...", "connecting");

        socket = new WebSocket(`ws://${window.location.hostname}:3000`);
        socket.binaryType = 'arraybuffer';

        socket.onopen = () => {
            reconnectAttempts = 0;
            updateStatus("Conectado", "connected");
            resolve();
        };

        socket.onerror = () => {
            reject(new Error("Erro na conexão WebSocket"));
        };

        socket.onclose = () => {
            updateStatus("Desconectado", "error");
        };

        socket.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.tipo === 'frase' && typeof window.adicionarFraseNova === 'function') {
                window.adicionarFraseNova(msg.texto);
            }
        };
    });
}

async function startAudio() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                sampleRate: 48000,
                echoCancellation: false,
                noiseSuppression: false
            }
        });

        audioContext = new AudioContext({ sampleRate: 48000 });
        const source = audioContext.createMediaStreamSource(stream);
        processor = audioContext.createScriptProcessor(4096, 1, 1);

        source.connect(processor);
        processor.connect(audioContext.destination);

        processor.onaudioprocess = (e) => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                const input = e.inputBuffer.getChannelData(0);
                const pcm = new Int16Array(input.length);
                for (let i = 0; i < input.length; i++) {
                    pcm[i] = Math.max(-32768, Math.min(32767, input[i] * 32767));
                }
                socket.send(pcm.buffer);
            }
        };

        return true;
    } catch (error) {
        updateStatus(`Erro: ${error.message}`, "error");
        return false;
    }
}

async function startRecording() {
    try {
        await connectWebSocket();
        const ok = await startAudio();
        if (ok) {
            startBtn.disabled = true;
            stopBtn.disabled = false;
        }
    } catch (error) {
        if (reconnectAttempts < MAX_RETRIES) {
            reconnectAttempts++;
            setTimeout(startRecording, 1000 * reconnectAttempts);
        } else {
            updateStatus(`Falha na conexão`, "error");
        }
    }
}

function stopRecording() {
    if (socket) {
        socket.close();
        socket = null;
    }
    if (processor) {
        processor.disconnect();
        processor = null;
    }
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }

    updateStatus("Desconectado", "connecting");
    startBtn.disabled = false;
    stopBtn.disabled = true;
    reconnectAttempts = 0;
}

startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
window.addEventListener('beforeunload', stopRecording);
