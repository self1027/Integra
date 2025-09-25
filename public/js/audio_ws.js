const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDiv = document.getElementById('status');
const sampleRateInfo = document.getElementById('sampleRateInfo') || document.createElement('div');

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

// Envia metadados sobre o áudio para sincronização no servidor
function sendAudioMetadata() {
  if (socket?.readyState === WebSocket.OPEN && audioContext) {
    const metadata = {
      type: "audio_metadata",
      sampleRate: audioContext.sampleRate,
    };

    socket.send(JSON.stringify(metadata));
    return true;
  }

  return false;
}

// Mantém o servidor atualizado sobre as configurações de áudio periodicamente
function setupMetadataHeartbeat() {
  if (!socket) return;
  
  sendAudioMetadata();
  
  if (socket.metadataInterval) {
      clearInterval(socket.metadataInterval);
  }
  
  socket.metadataInterval = setInterval(() => {
    sendAudioMetadata();
  }, METADATA_INTERVAL);
}

// Conexão WebSocket com tratamento de erros and reconexão
async function connectWebSocket() {
  return new Promise((resolve, reject) => {
    updateStatus('CONNECTING');
    
    if (socket) {
      socket.onclose = null;
      socket.close();
    }
    
    const urlParams = new URLSearchParams(window.location.search);
    const engine = urlParams.get("engine") || "vosk";
    const mainLang = urlParams.get("main") || "pt-BR";
    const secondaryLang = urlParams.get("secondary");

    // Build WebSocket URL with ALL parameters from the page URL
    let wsUrl = `wss://${window.location.hostname}?engine=${engine}&main=${encodeURIComponent(mainLang)}`;
    if (secondaryLang) {
      wsUrl += `&secondary=${encodeURIComponent(secondaryLang)}`;
    }

    console.log(`[WS] Connecting to: ${wsUrl}`);
    socket = new WebSocket(wsUrl);
    socket.binaryType = 'arraybuffer';

    socket.onopen = async () => {
      reconnectAttempts = 0;
      updateStatus('CONNECTED');
      sendAudioMetadata();
      setupMetadataHeartbeat();
      
      const audioStarted = await setupAudioProcessing();
      if (!audioStarted) {
          reject(new Error("Falha no processamento de áudio"));
          return;
      }
      resolve();
    };

    socket.onerror = (error) => {
      updateStatus('ERROR', { error });
      reject(error);
    };

    socket.onclose = () => {
      if (socket?.metadataInterval) {
        clearInterval(socket.metadataInterval);
      }
      updateStatus('DISCONNECTED');
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Dados recebidos:', data);
        
        // Verifica o tipo de mensagem
        if (data.tipo === 'frase-bilingual') {
          // É uma transcrição bilingual - usa o objeto completo
          window.addNewPhrase({
            raw: data.raw,
            translated: data.translated,
            language: data.language,
            confidence: data.confidence,
            isPrimary: data.isPrimary
          });
        } else if (data.tipo === 'frase-simples') {
          // É uma transcrição simples
          window.addNewPhrase({
            raw: data.texto,
            translated: null,
            language: null,
            confidence: null,
            isPrimary: null
          });
        } else if (data.tipo === 'frase') {
          // Formato legado - compatibilidade
          window.addNewPhrase({
            raw: data.raw || data.texto,
            translated: data.translated || null,
            language: data.language || data.idioma || null,
            confidence: data.confidence || data.confianca || null,
            isPrimary: data.isPrimary || null
          });
        }
      } catch (error) {
        console.error("[WS] Erro ao processar mensagem:", error);
      }
    };
  });
}

// Pipeline de processamento de áudio
function setupAudioProcessing() {
  return new Promise((resolve, reject) => {
    try {
      updateStatus('AUDIO_PROCESSING');
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      const mute = audioContext.createGain();
      mute.gain.value = 0;

      // Conexão dos componentes
      source.connect(processor);
      processor.connect(mute);
      mute.connect(audioContext.destination);

      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(console.error);
      }

      processor.onaudioprocess = (e) => {
        if (socket?.readyState !== WebSocket.OPEN) return;
        try {
          const input = e.inputBuffer.getChannelData(0);
          const pcm = new Int16Array(input.length);
          for (let i = 0; i < input.length; i++) {
            let s = input[i];
            if (s > 1) s = 1;
            else if (s < -1) s = -1;
            pcm[i] = (s * 32767) | 0;
          }
          socket.send(pcm.buffer);
        } catch (err) {
          console.error('[AUDIO] Erro no onaudioprocess:', err);
        }
      };
      resolve(true);
    } catch (error) {
      updateStatus('ERROR', { error });
      reject(new Error("Falha no processamento de áudio"));
    }
  });
}

// Detecta as configurações de áudio do dispositivo
async function detectAudioSettings() {
  try {
    updateStatus('SAMPLE_RATE_DETECTION');
    
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: { ideal: 48000 }
      },
      video: false
    });

    const tempContext = new (window.AudioContext || window.webkitAudioContext)();
    const detectedSampleRate = tempContext.sampleRate;
    await tempContext.close();
    
    audioContext = new AudioContext({ sampleRate: detectedSampleRate });
    
    sampleRateInfo.textContent = `Taxa de amostragem: ${audioContext.sampleRate}Hz`;
    
    return true;
  } catch (error) {
    updateStatus('MIC_ERROR', { error });
    return false;
  }
}

// Fluxo principal com tratamento de erros e retentativas automáticas
async function startRecording() {
  try {
    startBtn.disabled = true;
    stopBtn.disabled = false;

    const settingsDetected = await detectAudioSettings();
    if (!settingsDetected) throw new Error("Falha na detecção de áudio");

    await connectWebSocket();
  } catch (error) {
    if (reconnectAttempts < MAX_RETRIES) {
      const delay = RECONNECT_DELAY_BASE * Math.pow(2, reconnectAttempts);
      reconnectAttempts++;
      updateStatus('RECONNECTING', { attempt: reconnectAttempts });
      setTimeout(startRecording, delay);
    } else {
      updateStatus('ERROR', { error });
      stopRecording();
    }
  }
}

// Limpeza segura de todos os recursos
function stopRecording() {
  if (socket) {
    if (socket.metadataInterval) {
      clearInterval(socket.metadataInterval);
    }
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

// Event listeners
startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
window.addEventListener('beforeunload', stopRecording);
window.addEventListener('pagehide', stopRecording);

window.addEventListener('error', (event) => {
  updateStatus('ERROR', { error: event.error });
});

// Verificação de suporte às APIs necessárias
if (!navigator.mediaDevices?.getUserMedia) {
  updateStatus('ERROR', { error: "API de mídia não suportada" });
  startBtn.disabled = true;
}

if (!window.WebSocket) {
  updateStatus('ERROR', { error: "WebSocket não suportado" });
  startBtn.disabled = true;
}

updateStatus('INITIAL');