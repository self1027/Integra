const mic = require('mic');
process.env.PATH = __dirname + '\\node_modules\\vosk;' + process.env.PATH;
const vosk = require('vosk');
const fs = require('fs');

const MODEL_PATH = './vosk-model-small-pt-0.3';
const SAMPLE_RATE = 16000;

if (!fs.existsSync(MODEL_PATH)) {
  console.error('Modelo não encontrado. Baixe em: https://alphacephei.com/vosk/models');
  process.exit(1);
}

vosk.setLogLevel(0); // 0 para silencioso
const model = new vosk.Model(MODEL_PATH);
const rec = new vosk.Recognizer({ model: model, sampleRate: SAMPLE_RATE });

const micInstance = mic({
  rate: String(SAMPLE_RATE),
  channels: '1',
  debug: false,
  device: 'default' // você pode trocar isso se quiser usar outro microfone
});

const micInputStream = micInstance.getAudioStream();

micInputStream.on('data', (data) => {
  if (rec.acceptWaveform(data)) {
    const result = rec.result();
    if (result.text) console.log(`🗣️ Resultado: ${result.text}`);
  } else {
    const partial = rec.partialResult();
    if (partial.partial) process.stdout.write(`⌛ Parcial: ${partial.partial}\r`);
  }
});

micInputStream.on('error', (err) => {
  console.error('Erro no microfone:', err);
});

micInputStream.on('end', () => {
  console.log('Transcrição final:', rec.finalResult());
  rec.free();
  model.free();
});

console.log('🎤 Iniciando microfone. Fale algo em português...');
micInstance.start();
