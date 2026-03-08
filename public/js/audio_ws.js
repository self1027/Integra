const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDiv = document.getElementById('status');

// Variáveis de estado
let socket;
let audioContext;
let processor;
let stream;
let reconnectAttempts = 0;
const MAX_RETRIES = 5;
const RECONNECT_DELAY_BASE = 1000;
const METADATA_INTERVAL = 30000;

// Configurações de status
const statusStates = {
    INITIAL: { text: "Pronto para conectar", className: "status ready" },
    CONNECTING: { text: "Conectando ao servidor...", className: "status connecting" },
    CONNECTED: { text: "Conectado - Transmitindo áudio", className: "status connected" },
    DISCONNECTED: { text: "Desconectado", className: "status disconnected" },
    ERROR: { text: (error) => `Erro: ${error.message || error}`, className: "status error" },
    RECONNECTING: { text: (attempt) => `Reconectando (${attempt}/${MAX_RETRIES})...`, className: "status reconnecting" },
    MIC_ERROR: { text: "Erro no acesso ao microfone", className: "status error" },
    AUDIO_PROCESSING: { text: "Processando áudio...", className: "status processing" },
    SAMPLE_RATE_DETECTION: { text: "Detectando configurações de áudio...", className: "status processing" }
};

function updateStatus(state, options = {}) {
    const statusConfig = statusStates[state];
    if (!statusConfig) return;

    // 1. Atualiza o texto SEM apagar o ícone <i>
    const textSpan = statusDiv.querySelector('span');
    const newText = typeof statusConfig.text === 'function' 
        ? statusConfig.text(options.error || options.attempt) 
        : statusConfig.text;
    
    if (textSpan) {
        textSpan.textContent = newText.toUpperCase();
    }

    // 2. Troca a classe da caixa para mudar a cor da bola via CSS
    statusDiv.className = 'status-box'; 
    
    const stateClass = statusConfig.className.replace('status ', '').trim();
    statusDiv.classList.add(stateClass);
}

// Envia metadados para o backend
function sendAudioMetadata() {
    if (socket?.readyState === WebSocket.OPEN && audioContext) {
        socket.send(JSON.stringify({
            type: "audio_metadata",
            sampleRate: audioContext.sampleRate,
        }));
    }
}

async function connectWebSocket() {
    return new Promise((resolve, reject) => {
        updateStatus('CONNECTING');
        
        const urlParams = new URLSearchParams(window.location.search);
        const engine = urlParams.get("engine") || "vosk";
        const wsUrl = `wss://${window.location.host}?engine=${engine}`;

        socket = new WebSocket(wsUrl);
        socket.binaryType = 'arraybuffer';

        socket.onopen = async () => {
            reconnectAttempts = 0;
            updateStatus('CONNECTED');
            sendAudioMetadata();
            
            const audioStarted = await setupAudioProcessing();
            if (!audioStarted) {
                reject(new Error("Falha no processamento de áudio"));
                return;
            }
            resolve();
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                // Apenas exibe a frase na tela (window.addNewPhrase deve estar no index)
                if (data.texto || data.raw) {
                    window.addNewPhrase(data.texto || data.raw);
                }
            } catch (e) { console.error("Erro no parse:", e); }
        };

        socket.onclose = () => {
            updateStatus('DISCONNECTED');
        };

        socket.onerror = (error) => reject(error);
    });
}

function setupAudioProcessing() {
    try {
        updateStatus('AUDIO_PROCESSING');
        const source = audioContext.createMediaStreamSource(stream);

        // Cadeia de filtros para melhor reconhecimento de voz
        const highpass = audioContext.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 300;

        const notch = audioContext.createBiquadFilter();
        notch.type = "notch";
        notch.frequency.value = 60;

        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -20;
        compressor.ratio.value = 4;

        processor = audioContext.createScriptProcessor(4096, 1, 1);
        const mute = audioContext.createGain();
        mute.gain.value = 0;

        source.connect(highpass);
        highpass.connect(notch);
        notch.connect(compressor);
        compressor.connect(processor);
        processor.connect(mute);
        mute.connect(audioContext.destination);

        processor.onaudioprocess = (e) => {
            if (socket?.readyState !== WebSocket.OPEN) return;
            const input = e.inputBuffer.getChannelData(0);
            const pcm = new Int16Array(input.length);
            for (let i = 0; i < input.length; i++) {
                let s = input[i];
                pcm[i] = (Math.max(-1, Math.min(1, s)) * 32767) | 0;
            }
            socket.send(pcm.buffer);
        };

        return Promise.resolve(true);
    } catch (error) {
        return Promise.resolve(false);
    }
}

async function detectAudioSettings() {
    try {
        updateStatus('SAMPLE_RATE_DETECTION');
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        return true;
    } catch (error) {
        updateStatus('MIC_ERROR', { error });
        return false;
    }
}

async function startRecording() {
    startBtn.disabled = true;
    stopBtn.disabled = false;
    
    const settingsDetected = await detectAudioSettings();
    if (settingsDetected) {
        try {
            await connectWebSocket();
        } catch (error) {
            if (reconnectAttempts < MAX_RETRIES) {
                reconnectAttempts++;
                updateStatus('RECONNECTING', { attempt: reconnectAttempts });
                setTimeout(startRecording, RECONNECT_DELAY_BASE * reconnectAttempts);
            }
        }
    }
}

function stopRecording() {
    if (socket) socket.close();
    if (processor) processor.disconnect();
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (audioContext) audioContext.close();

    updateStatus('DISCONNECTED');
    startBtn.disabled = false;
    stopBtn.disabled = true;
}

startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
updateStatus('INITIAL');