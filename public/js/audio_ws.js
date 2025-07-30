const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDiv = document.getElementById('status');
const sampleRateInfo = document.getElementById('sampleRateInfo') || document.createElement('div');

let socket;
let audioContext;
let processor;
let stream;
let reconnectAttempts = 0;
const MAX_RETRIES = 3;
const RECONNECT_DELAY_BASE = 1000;

const statusStates = {
  INITIAL: { text: "Pronto para conectar", className: "status ready" },
  CONNECTING: { text: "Conectando ao servidor...", className: "status connecting" },
  CONNECTED: { text: "Conectado - Transmitindo áudio", className: "status connected" },
  DISCONNECTED: { text: "Desconectado", className: "status disconnected" },
  ERROR: { text: (error) => `Erro: ${error.message || error}`, className: "status error" },
  RECONNECTING: { text: (attempt) => `Reconectando (${attempt}/${MAX_RETRIES})...`, className: "status reconnecting" },
  MIC_ERROR: { text: "Erro no acesso ao microfone", className: "status error" },
  AUDIO_PROCESSING: { text: "Processando áudio...", className: "status processing" },
  SAMPLE_RATE_DETECTION: { text: "Detectando configurações do microfone...", className: "status processing" }
};

function sendAudioMetadata() {
  if (socket && socket.readyState === WebSocket.OPEN && audioContext) {
    const metadata = {
      type: "audio_metadata",
      sampleRate: audioContext.sampleRate,
      channels: 1 // Mono
    };
    socket.send(JSON.stringify(metadata));
    console.log("Metadados enviados:", metadata);
  }
}

function updateStatus(state, options = {}) {
  let statusConfig = typeof state === 'string' ? statusStates[state] : null;
  
  if (!statusConfig) {
    statusDiv.textContent = state;
    statusDiv.className = options.className || "status disconnected";
    return;
  }

  statusDiv.textContent = typeof statusConfig.text === 'function' 
    ? statusConfig.text(options.error || options.attempt) 
    : statusConfig.text;
    
  statusDiv.className = statusConfig.className;
}

async function connectWebSocket() {
  return new Promise((resolve, reject) => {
    updateStatus('CONNECTING');

    socket = new WebSocket(`wss://${window.location.hostname}`);
    socket.binaryType = 'arraybuffer';

    socket.onopen = () => {
      reconnectAttempts = 0;
      updateStatus('CONNECTED');
      resolve();
    };

    socket.onerror = (error) => {
      updateStatus('ERROR', { error: error || new Error("Erro na conexão WebSocket") });
      reject(error);
    };

    socket.onclose = () => {
      if (!socket) return;
      updateStatus('DISCONNECTED');
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.tipo === 'frase' && typeof window.adicionarFraseNova === 'function') {
          window.adicionarFraseNova(msg.texto);
        }
      } catch (error) {
        console.error("Erro ao processar mensagem:", error);
      }
    };
  });
}

// Função startAudio completamente modificada para detecção dinâmica
async function startAudio() {
  try {
    updateStatus('SAMPLE_RATE_DETECTION');
    
    // 1. Primeiro obtemos o stream sem restrições de sampleRate
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
        // Removemos sampleRate fixo para permitir detecção automática
      },
      video: false
    });

    updateStatus('AUDIO_PROCESSING');
    
    // 2. Criamos o AudioContext com o sampleRate nativo do dispositivo
    audioContext = new AudioContext();
    
    // Exibimos o sampleRate detectado (para debug)
    sampleRateInfo.textContent = `Sample Rate Detectado: ${audioContext.sampleRate}Hz`;
    console.log("Sample Rate do dispositivo:", audioContext.sampleRate);
    
    // 3. Enviamos os metadados para o servidor
    sendAudioMetadata();

    // 4. Configuramos o processamento de áudio
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
    console.error("Erro no áudio:", error);
    updateStatus('MIC_ERROR', { error });
    return false;
  }
}

async function startRecording() {
  try {
    startBtn.disabled = true;
    stopBtn.disabled = false;
    
    await connectWebSocket();
    const audioStarted = await startAudio();
    
    if (!audioStarted) {
      startBtn.disabled = false;
      stopBtn.disabled = true;
      return;
    }

  } catch (error) {
    if (reconnectAttempts < MAX_RETRIES) {
      const delay = RECONNECT_DELAY_BASE * Math.pow(2, reconnectAttempts);
      updateStatus('RECONNECTING', { attempt: reconnectAttempts + 1 });
      reconnectAttempts++;
      setTimeout(startRecording, delay);
    } else {
      updateStatus('ERROR', { error });
      startBtn.disabled = false;
      stopBtn.disabled = true;
    }
  }
}

function stopRecording() {
  if (socket) {
    socket.onclose = null;
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
    audioContext.close().catch(console.error);
    audioContext = null;
  }

  updateStatus('DISCONNECTED');
  startBtn.disabled = false;
  stopBtn.disabled = true;
  reconnectAttempts = 0;
}

startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);

window.addEventListener('beforeunload', stopRecording);
window.addEventListener('pagehide', stopRecording);

window.addEventListener('error', (event) => {
  updateStatus('ERROR', { error: event.error });
  console.error("Erro não capturado:", event.error);
});

// Inicialização
updateStatus('INITIAL');