const { spawn } = require('child_process');

let ffmpegProcess = null;

function start({ inputSampleRate, outputSampleRate, onData }) {
  stop(); // garante limpeza

  ffmpegProcess = spawn('ffmpeg', [
    '-f', 's16le', '-ar', String(inputSampleRate), '-ac', '1',
    '-i', 'pipe:0',
    '-f', 's16le', '-ar', String(outputSampleRate), '-ac', '1',
    '-loglevel', 'error', 'pipe:1'
  ]);

  ffmpegProcess.stdout.on('data', onData);
  ffmpegProcess.stderr.on('data', d => console.error('[FFMPEG]', d.toString()));
  ffmpegProcess.on('error', e => console.error('FFmpeg error:', e));
  ffmpegProcess.on('close', code => console.log(`[FFMPEG] Finalizado com código ${code}`));
}

function pushAudio(buffer) {
  if (ffmpegProcess?.stdin.writable) ffmpegProcess.stdin.write(buffer);
}

function stop() {
  if (ffmpegProcess) {
    try { ffmpegProcess.stdin.end(); ffmpegProcess.kill(); } catch {}
    ffmpegProcess = null;
  }
}

module.exports = { start, pushAudio, stop };
