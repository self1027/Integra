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
const METADATA_INTERVAL = 30000; // 30 segundos

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

// Atualiza o status na UI
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

function sendAudioMetadata() {
  if (socket?.readyState === WebSocket.OPEN && audioContext) {
    const metadata = {
      type: "audio_metadata",
      sampleRate: audioContext.sampleRate,
    };

    console.log("[METADATA] Enviando:", metadata);

    // Envia o objeto como uma string JSON
    socket.send(JSON.stringify(metadata));
    return true;
  }

  console.warn("[METADATA] Não enviado - Conexão não está pronta");
  return false;
}

// Configura o intervalo de envio de metadados
function setupMetadataHeartbeat() {
  if (!socket) return;
  
  // Envia imediatamente
  sendAudioMetadata();
  
  // Configura intervalo periódico
  if (socket.metadataInterval) {
    clearInterval(socket.metadataInterval);
  }
  
  socket.metadataInterval = setInterval(() => {
    sendAudioMetadata();
  }, METADATA_INTERVAL);
}

// Conecta ao WebSocket
async function connectWebSocket() {
  return new Promise((resolve, reject) => {
    updateStatus('CONNECTING');
    
    // Fecha conexão existente se houver
    if (socket) {
      socket.onclose = null;
      socket.close();
    }
    
    socket = new WebSocket(`wss://${window.location.hostname}`);
    socket.binaryType = 'arraybuffer';

    socket.onopen = () => {
      reconnectAttempts = 0;
      setTimeout(() => {
        sendAudioMetadata();
      }, 2000);
      updateStatus('CONNECTED');
      setupMetadataHeartbeat();
      resolve();
    };

    socket.onerror = (error) => {
      console.error("[WS] Erro na conexão:", error);
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
        const msg = JSON.parse(event.data);
        if (msg.tipo === 'frase' && typeof window.adicionarFraseNova === 'function') {
          window.adicionarFraseNova(msg.texto);
        }
      } catch (error) {
        console.error("[WS] Erro ao processar mensagem:", error);
      }
    };
  });
}

// Processamento de áudio
function setupAudioProcessing() {
  try {
    updateStatus('AUDIO_PROCESSING');
    
    const source = audioContext.createMediaStreamSource(stream);
    processor = audioContext.createScriptProcessor(4096, 1, 1);

    source.connect(processor);
    processor.connect(audioContext.destination);

    processor.onaudioprocess = (e) => {
      if (socket?.readyState === WebSocket.OPEN) {
        const input = e.inputBuffer.getChannelData(0);
        const pcm = new Int16Array(input.length);
        
        // Converte para PCM 16-bit
        for (let i = 0; i < input.length; i++) {
          pcm[i] = Math.max(-32768, Math.min(32767, input[i] * 32767));
        }
        
        // Verifica tamanho do chunk
        if (pcm.length % 2 !== 0) {
          console.warn("[AUDIO] Chunk com tamanho ímpar:", pcm.length);
          return;
        }
        
        // Envia o áudio
        try {
          socket.send(pcm.buffer);
        } catch (err) {
          console.error("[AUDIO] Erro ao enviar:", err);
        }
      }
    };

    return true;
  } catch (error) {
    console.error("[AUDIO] Erro no processamento:", error);
    updateStatus('ERROR', { error });
    return false;
  }
}

// Detecta as configurações de áudio do dispositivo
async function detectAudioSettings() {
  try {
    updateStatus('SAMPLE_RATE_DETECTION');
    
    // 1. Obtém o stream de áudio
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: { ideal: 48000 } // Sugere a melhor taxa
      },
      video: false
    });

    // 2. Detecta o sample rate usando contexto temporário
    const tempContext = new (window.AudioContext || window.webkitAudioContext)();
    const detectedSampleRate = tempContext.sampleRate;
    await tempContext.close();
    
    // 3. Cria o contexto definitivo
    audioContext = new AudioContext({ sampleRate: detectedSampleRate });
    
    // Exibe informações
    sampleRateInfo.textContent = `Taxa de amostragem: ${audioContext.sampleRate}Hz`;
    console.log("[AUDIO] Sample rate detectado:", audioContext.sampleRate);
    
    return true;
  } catch (error) {
    console.error("[AUDIO] Erro na detecção:", error);
    updateStatus('MIC_ERROR', { error });
    return false;
  }
}

// Inicia a gravação e transmissão
async function startRecording() {
  try {
    startBtn.disabled = true;
    stopBtn.disabled = false;

    // 1. Detecta configurações de áudio antes (pra garantir audioContext pronto)
    const settingsDetected = await detectAudioSettings();
    if (!settingsDetected) throw new Error("Falha na detecção de áudio");

    // 2. Conecta ao WebSocket
    await connectWebSocket();

    // 3. Envia metadados (com audioContext já disponível)
    sendAudioMetadata();

    // 4. Configura o processamento de áudio
    const audioStarted = await setupAudioProcessing();
    if (!audioStarted) throw new Error("Falha no processamento de áudio");

  } catch (error) {
    console.error("[APP] Erro inicial:", error);

    if (reconnectAttempts < MAX_RETRIES) {
      const delay = RECONNECT_DELAY_BASE * Math.pow(2, reconnectAttempts);
      reconnectAttempts++;

      updateStatus('RECONNECTING', { attempt: reconnectAttempts });
      console.log(`[APP] Tentando reconectar em ${delay}ms...`);

      setTimeout(startRecording, delay);
    } else {
      updateStatus('ERROR', { error });
      stopRecording();
    }
  }
}


// Para a gravação e limpa recursos
function stopRecording() {
  console.log("[APP] Parando gravação...");
  
  // Limpa WebSocket
  if (socket) {
    if (socket.metadataInterval) {
      clearInterval(socket.metadataInterval);
    }
    socket.onclose = null;
    socket.close();
    socket = null;
  }

  // Limpa processamento de áudio
  if (processor) {
    processor.disconnect();
    processor = null;
  }
  
  // Limpa stream de mídia
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  
  // Limpa contexto de áudio
  if (audioContext) {
    audioContext.close().catch(console.error);
    audioContext = null;
  }

  // Atualiza UI
  updateStatus('DISCONNECTED');
  startBtn.disabled = false;
  stopBtn.disabled = true;
  reconnectAttempts = 0;
}

// Event listeners
startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);

// Limpeza ao sair da página
window.addEventListener('beforeunload', stopRecording);
window.addEventListener('pagehide', stopRecording);

// Tratamento de erros globais
window.addEventListener('error', (event) => {
  console.error("[GLOBAL] Erro não capturado:", event.error);
  updateStatus('ERROR', { error: event.error });
});

// Verificação inicial de suporte
if (!navigator.mediaDevices?.getUserMedia) {
  updateStatus('ERROR', { error: "API de mídia não suportada" });
  startBtn.disabled = true;
}

if (!window.WebSocket) {
  updateStatus('ERROR', { error: "WebSocket não suportado" });
  startBtn.disabled = true;
}

// Inicialização
updateStatus('INITIAL');