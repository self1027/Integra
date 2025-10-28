// === LESSONMEMORY INCLUÍDO DIRETAMENTE NO ARQUIVO ===
class LessonMemory {
  constructor() {
    this.resetLesson();
  }

  startLesson() {
    this.entries = [];
    this.startedAt = new Date().toISOString();
    console.log('[LessonMemory] Aula iniciada:', this.startedAt);
  }

  addEntry({ raw, translated = null, confidence = null, isPrimary = null, language = null }) {
    if (!this.entries) this.startLesson();
    
    const entry = {
      timestamp: new Date().toISOString(),
      raw,
      translated,
      confidence,
      isPrimary,
      language
    };
    
    this.entries.push(entry);
    console.log('[LessonMemory] Frase adicionada:', {
      total: this.entries.length,
      raw: raw.substring(0, 50) + '...'
    });
  }

  endLesson() {
    const endedAt = new Date().toISOString();
    const lessonData = {
      startedAt: this.startedAt,
      endedAt: endedAt,
      entries: this.entries || []
    };
    
    console.log('[LessonMemory] Aula finalizada:', {
      startedAt: this.startedAt,
      endedAt: endedAt,
      totalPhrases: this.entries?.length || 0
    });
    
    return lessonData;
  }

  getEntryCount() {
    return this.entries?.length || 0;
  }

  resetLesson() {
    this.entries = [];
    this.startedAt = null;
  }

  async sendLessonToServer() {
    const data = this.endLesson();
    
    try {
      const response = await fetch('/lesson', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      
      const result = await response.json();
      console.log("[LessonMemory] Aula salva com sucesso:", result);
      
      this.resetLesson();
      return true;
      
    } catch (err) {
      console.error("[LessonMemory] Erro ao salvar aula:", err);
      return false;
    }
  }
}

// === CÓDIGO PRINCIPAL ===
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDiv = document.getElementById('status');
const sampleRateInfo = document.getElementById('sampleRateInfo') || document.createElement('div');

// Inicializar LessonMemory IMEDIATAMENTE
const lessonMemory = new LessonMemory();
window.lessonMemory = lessonMemory;
console.log('✅ LessonMemory inicializado');

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

// Conexão WebSocket com tratamento de erros e reconexão
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
        
        // Verificar se o LessonMemory está disponível
        if (!window.lessonMemory) {
          console.error('❌ LessonMemory não encontrado no window');
          return;
        }

        let phraseData = {};
        
        if (data.tipo === 'frase-bilingual') {
          phraseData = {
            raw: data.raw,
            translated: data.translated,
            language: data.language,
            confidence: data.confidence,
            isPrimary: data.isPrimary
          };
          window.addNewPhrase(phraseData);
        } else if (data.tipo === 'frase-simples') {
          phraseData = {
            raw: data.texto,
            translated: null,
            language: null,
            confidence: null,
            isPrimary: null
          };
          window.addNewPhrase(phraseData);
        } else if (data.tipo === 'frase') {
          phraseData = {
            raw: data.raw || data.texto,
            translated: data.translated || null,
            language: data.language || data.idioma || null,
            confidence: data.confidence || data.confianca || null,
            isPrimary: data.isPrimary || null
          };
          window.addNewPhrase(phraseData);
        }

        // Adiciona à memória da aula
        console.log('📝 Adicionando frase ao LessonMemory:', phraseData);
        window.lessonMemory.addEntry(phraseData);
        console.log('✅ Frases no LessonMemory:', window.lessonMemory.getEntryCount());

      } catch (error) {
        console.error("[WS] Erro ao processar mensagem:", error);
      }
    };
  });
}

// Pipeline de processamento de áudio
function setupAudioProcessing() {
  try {
    updateStatus('AUDIO_PROCESSING');

    const source = audioContext.createMediaStreamSource(stream);

    const highpass = audioContext.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 300;
    highpass.Q.value = 0.707;

    const notch = audioContext.createBiquadFilter();
    notch.type = "notch";
    notch.frequency.value = 60;
    notch.Q.value = 5.0;

    const preEmphasis = audioContext.createBiquadFilter();
    preEmphasis.type = 'highshelf';
    preEmphasis.frequency.value = 2000;
    preEmphasis.gain.value = 4.0;

    const deesser = audioContext.createBiquadFilter();
    deesser.type = 'peaking';
    deesser.frequency.value = 5000;
    deesser.gain.value = -6.0;
    deesser.Q.value = 2.0;

    const lowpass = audioContext.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 3400;
    lowpass.Q.value = 0.707;

    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.1;

    processor = audioContext.createScriptProcessor(4096, 1, 1);

    const mute = audioContext.createGain();
    mute.gain.value = 0;

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

    return Promise.resolve(true);
  } catch (error) {
    console.error('[AUDIO] Erro no processamento:', error);
    updateStatus('ERROR', { error });
    return Promise.resolve(false);
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

// Fluxo principal
async function startRecording() {
  try {
    startBtn.disabled = true;
    stopBtn.disabled = false;

    console.log('🎤 Iniciando gravação...');
    console.log('📚 LessonMemory disponível?', !!window.lessonMemory);
    
    if (window.lessonMemory) {
      window.lessonMemory.startLesson();
      console.log('✅ Aula iniciada no LessonMemory');
    } else {
      console.error('❌ LessonMemory não encontrado');
    }

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
async function stopRecording() {
  console.log('[APP] Parando gravação...');
  
  if (socket) {
    if (socket.metadataInterval) clearInterval(socket.metadataInterval);
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

  // Salva a aula usando o LessonMemory
  console.log('💾 Verificando LessonMemory para salvar...');
  console.log('📊 LessonMemory disponível?', !!window.lessonMemory);
  
  if (window.lessonMemory) {
    const entryCount = window.lessonMemory.getEntryCount();
    console.log(`📝 Total de frases no LessonMemory: ${entryCount}`);
    
    if (entryCount > 0) {
      console.log('[APP] Salvando aula com', entryCount, 'frases');
      try {
        await window.lessonMemory.sendLessonToServer();
        console.log('[APP] Aula salva com sucesso no banco de dados');
      } catch (err) {
        console.error('[APP] Erro ao salvar aula:', err);
      }
    } else {
      console.log('[APP] Nenhuma frase para salvar - LessonMemory vazio');
    }
  } else {
    console.error('[APP] LessonMemory não encontrado para salvar aula');
  }
}

// Event listeners
startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
window.addEventListener('beforeunload', stopRecording);
window.addEventListener('pagehide', stopRecording);

window.addEventListener('error', (event) => {
  updateStatus('ERROR', { error: event.error });
});

if (!navigator.mediaDevices?.getUserMedia) {
  updateStatus('ERROR', { error: "API de mídia não suportada" });
  startBtn.disabled = true;
}

if (!window.WebSocket) {
  updateStatus('ERROR', { error: "WebSocket não suportado" });
  startBtn.disabled = true;
}

updateStatus('INITIAL');

// Função de debug para verificar o estado
window.debugLessonMemory = () => {
  console.log('🔍 Debug LessonMemory:');
  console.log('- Disponível:', !!window.lessonMemory);
  if (window.lessonMemory) {
    console.log('- Entries count:', window.lessonMemory.getEntryCount());
    console.log('- Started at:', window.lessonMemory.startedAt);
    console.log('- Entries:', window.lessonMemory.entries);
  }
};

console.log('🚀 audio_ws.js carregado com sucesso');
console.log('📚 LessonMemory disponível globalmente como window.lessonMemory');