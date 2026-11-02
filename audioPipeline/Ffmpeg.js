const { spawn } = require('node:child_process');

class Ffmpeg {
  constructor({ inputSampleRate, outputSampleRate }) {
    this.inputSampleRate = inputSampleRate;
    this.outputSampleRate = outputSampleRate;
    this.process = null;
  }

  start({ onData, onReady = () => {}, onError }) {
    this.stop();
    const child = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-f', 's16le', '-ar', String(this.inputSampleRate),
      '-ac', '1', '-i', 'pipe:0', '-f', 's16le', '-ar', String(this.outputSampleRate), '-ac', '1', 'pipe:1',
    ], { windowsHide: true });
    this.process = child;
    this.stopping = false;
    this.finishing = false;
    let stderr = '';
    const fail = error => { if (this.process === child && !this.stopping) onError(error); };
    child.once('spawn', onReady);
    child.stdout.on('data', onData);
    child.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-2000); });
    child.on('error', fail);
    child.stdin.on('error', fail);
    child.on('close', (code, signal) => {
      if (this.process !== child) return;
      this.process = null;
      if (code !== 0 && !this.stopping) onError(new Error(stderr || 'FFmpeg encerrou inesperadamente: ' + (signal || code)));
    });
  }

  pushAudio(buffer) {
    if (this.process?.stdin.writable && !this.finishing) this.process.stdin.write(buffer);
  }

  finish() {
    if (this.finishPromise) return this.finishPromise;
    const child = this.process;
    if (!child) return Promise.resolve();
    this.finishing = true;
    this.finishPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { child.kill(); reject(new Error('FFmpeg não concluiu o áudio em 5 segundos.')); }, 5000);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('close', code => {
        clearTimeout(timeout);
        if (code === 0) resolve(); else reject(new Error('FFmpeg encerrou com código ' + code));
      });
      child.stdin.end();
    });
    return this.finishPromise;
  }

  stop() {
    this.stopping = true;
    if (this.process) {
      this.process.stdin.destroy();
      this.process.kill();
      this.process = null;
    }
  }
}

module.exports = { Ffmpeg };
