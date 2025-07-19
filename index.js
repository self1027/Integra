const { spawn } = require('child_process');
const vosk = require('vosk');
const fs = require('fs');

const MODEL_PATH = './vosk-model-small-pt-0.3';
const SAMPLE_RATE = 16000;

if (!fs.existsSync(MODEL_PATH)) {
  console.error('Modelo não encontrado. Baixe em: https://alphacephei.com/vosk/models');
  process.exit(1);
}

vosk.setLogLevel(0);
const model = new vosk.Model(MODEL_PATH);
const rec = new vosk.Recognizer({ model: model, sampleRate: SAMPLE_RATE });

const ffmpeg = spawn('ffmpeg', [
  '-f', 'dshow',                     
  '-i', 'audio=Microphone (SHEM-BOY)', 
  '-ar', String(SAMPLE_RATE),        
  '-ac', '1',                        
  '-f', 's16le',                     
  '-bufsize', '4096',                
  '-loglevel', 'quiet',              
  'pipe:1'                           
]);

// Error handling
ffmpeg.stderr.on('data', (data) => {
  console.error('FFmpeg error:', data.toString());
});

ffmpeg.on('error', (err) => {
  console.error('Failed to start FFmpeg:', err);
});

// Process audio data
ffmpeg.stdout.on('data', (data) => {
  if (rec.acceptWaveform(data)) {
    const result = rec.result();
    if (result.text) console.log(`🗣️ Resultado: ${result.text}`);
  } else {
    const partial = rec.partialResult();
    if (partial.partial) process.stdout.write(`⌛ Parcial: ${partial.partial}\r`);
  }
});

// Cleanup
function shutdown() {
  ffmpeg.kill();
  rec.free();
  model.free();
  process.exit();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('🎤 Iniciando captura de áudio via FFmpeg (USB Audio Device)...');
console.log('Pressione Ctrl+C para parar...');