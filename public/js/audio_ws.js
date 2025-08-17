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

// Configurações de status - centraliza todos os possíveis estados da UI para manter consistência
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

// Envia metadados críticos sobre o áudio para sincronização no servidor
function sendAudioMetadata() {
  if (socket?.readyState === WebSocket.OPEN && audioContext) {
    const metadata = {
      type: "audio_metadata",
      sampleRate: audioContext.sampleRate,
    };

    console.log("[METADATA] Enviando:", metadata);

    socket.send(JSON.stringify(metadata));
    return true;
  }

  console.warn("[METADATA] Não enviado - Conexão não está pronta");
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

// Conexão WebSocket com tratamento de erros e reconexão
async function connectWebSocket() {
  return new Promise((resolve, reject) => {
    updateStatus('CONNECTING');
    
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

// Pipeline complexo de processamento de áudio com múltiplos estágios de filtragem
function setupAudioProcessing() {
  try {
    updateStatus('AUDIO_PROCESSING');

    const source = audioContext.createMediaStreamSource(stream);

    // Configuração dos filtros de áudio (ordem é crítica para o resultado final)
    // Highpass Filter (300Hz) - Remove frequências indesejadas
    const highpass = audioContext.createBiquadFilter();
    highpass.type = 'highpass';          // Corta frequências abaixo do corte
    highpass.frequency.value = 300;      // Ideal para remover ruídos de vento/vibração
    highpass.Q.value = 0.707;            // Curva suave (Butterworth) sem distorção

    // Notch Filter (60Hz) - Elimina interferência elétrica
    const notch = audioContext.createBiquadFilter();
    notch.type = "notch";                // Corta estreitamente uma frequência específica
    notch.frequency.value = 60;          // Alvo: ruído de rede elétrica (50Hz na Europa)
    notch.Q.value = 5.0;                 // Banda estreita para não afetar vozes

    // Pre-Ênfase (High Shelf) - Melhora inteligibilidade
    const preEmphasis = audioContext.createBiquadFilter();
    preEmphasis.type = 'highshelf';      // Aumenta apenas altas frequências
    preEmphasis.frequency.value = 2000;  // Foco em consoantes (2000-3400Hz)
    preEmphasis.gain.value = 4.0;        // +4dB boost - Suficiente para ASR sem distorção

    // De-esser - Reduz sibilância ("s" estridentes)
    const deesser = audioContext.createBiquadFilter();
    deesser.type = 'peaking';            // Corte seletivo
    deesser.frequency.value = 5000;      // Faixa crítica de sibilância
    deesser.gain.value = -6.0;           // Redução moderada
    deesser.Q.value = 2.0;               // Banda estreita para não afetar outras frequências

    // Lowpass Filter (3400Hz) - Remove hiss/ruídos agudos
    const lowpass = audioContext.createBiquadFilter();
    lowpass.type = 'lowpass';            // Corta frequências acima do corte
    lowpass.frequency.value = 3400;      // Limite superior da voz humana para ASR
    lowpass.Q.value = 0.707;             // Curva natural (Butterworth)

    // Compressor - Normaliza volume dinâmico
    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -20;    // Inicia compressão em -20dBFS (evita picos)
    compressor.ratio.value = 4;          // 4:1 - Redução suave sem "bombeamento"
    compressor.attack.value = 0.01;      // 10ms - Resposta rápida a picos repentinos
    compressor.release.value = 0.1;      // 100ms - Liberação natural

    processor = audioContext.createScriptProcessor(4096, 1, 1);

    const mute = audioContext.createGain();
    mute.gain.value = 0;

    // Conexão dos componentes na ordem específica para melhor qualidade de áudio
    source.connect(highpass);
    highpass.connect(notch);
    notch.connect(preEmphasis);
    preEmphasis.connect(deesser);
    deesser.connect(lowpass);
    lowpass.connect(compressor);
    compressor.connect(processor);
    processor.connect(mute);
    mute.connect(audioContext.destination);

    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(console.error);
    }

    let frameCount = 0;

    processor.onaudioprocess = (e) => {
      if (socket?.readyState !== WebSocket.OPEN) return;

      try {
        const input = e.inputBuffer.getChannelData(0);

        if ((frameCount++ % 30) === 0) {
          let sum = 0;
          for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
          const rms = Math.sqrt(sum / input.length);
          console.log(`[AUDIO] len=${input.length} rms=${rms.toFixed(4)}`);
        }

        // Conversão de float32 para PCM16 (formato esperado pelo back)
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

    return true;
  } catch (error) {
    console.error('[AUDIO] Erro no processamento:', error);
    updateStatus('ERROR', { error });
    return false;
  }
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

    // Técnica para detectar o sample rate real do dispositivo
    const tempContext = new (window.AudioContext || window.webkitAudioContext)();
    const detectedSampleRate = tempContext.sampleRate;
    await tempContext.close();
    
    audioContext = new AudioContext({ sampleRate: detectedSampleRate });
    
    sampleRateInfo.textContent = `Taxa de amostragem: ${audioContext.sampleRate}Hz`;
    console.log("[AUDIO] Sample rate detectado:", audioContext.sampleRate);
    
    return true;
  } catch (error) {
    console.error("[AUDIO] Erro na detecção:", error);
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

    sendAudioMetadata();

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

// Limpeza segura de todos os recursos
function stopRecording() {
  console.log("[APP] Parando gravação...");
  
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
  console.error("[GLOBAL] Erro não capturado:", event.error);
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