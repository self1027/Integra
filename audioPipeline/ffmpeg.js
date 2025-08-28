const { spawn } = require('child_process');

let ffmpegProcess = null;
let isFFmpegRunning = false;

function start({ inputSampleRate, outputSampleRate, onData }) {
  stop(); // Limpa qualquer processo existente

  const args = [
    '-f', 's16le', 
    '-ar', String(inputSampleRate), 
    '-ac', '1',
    '-i', 'pipe:0',
    '-f', 's16le', 
    '-ar', String(outputSampleRate), 
    '-ac', '1',
    '-loglevel', 'error', 
    'pipe:1'
  ];

  ffmpegProcess = spawn('ffmpeg', args);
  isFFmpegRunning = true;

  ffmpegProcess.stdout.on('data', onData);
  
  ffmpegProcess.stderr.on('data', d => {
    const message = d.toString();
    // Filtra mensagens comuns que não são erros
    if (!message.includes('size=') && !message.includes('time=')) {
      console.error('[FFMPEG]', message);
    }
  });
  
  ffmpegProcess.on('error', e => {
    console.error('[FFMPEG] Erro:', e);
    isFFmpegRunning = false;
  });
  
  ffmpegProcess.on('close', code => {
    isFFmpegRunning = false;
    // Código 255 é normal quando o FFmpeg é terminado
    if (code !== 0 && code !== 255) {
      console.log(`[FFMPEG] Finalizado com código ${code}`);
    }
  });
}

function pushAudio(buffer) {
  if (ffmpegProcess?.stdin?.writable && isFFmpegRunning) {
    try {
      ffmpegProcess.stdin.write(buffer);
    } catch (error) {
      console.warn('[FFMPEG] Erro ao escrever no stdin:', error.message);
    }
  } else {
    console.warn('[FFMPEG] stdin não disponível para escrita');
  }
}

function stop() {
  if (ffmpegProcess) {
    try { 
      if (ffmpegProcess.stdin && !ffmpegProcess.stdin.destroyed) {
        ffmpegProcess.stdin.end(); 
      }
      if (isFFmpegRunning) {
        ffmpegProcess.kill(); 
      }
    } catch (error) {
      console.warn('[FFMPEG] Erro ao parar processo:', error.message);
    }
    ffmpegProcess = null;
    isFFmpegRunning = false;
  }
}

module.exports = { start, pushAudio, stop };