const { spawn } = require('child_process');

class Ffmpeg {
  constructor({ inputSampleRate, outputSampleRate }) {
    this._inputSampleRate = inputSampleRate;
    this._outputSampleRate = outputSampleRate;
    this._ffmpegProcess = null;
    this._isRunning = false;
    this._onDataCallback = null;
    this._onReadyCallback = null;
    this._onErrorCallback = null;
  }

  start({ onData, onReady, onError }) {
    this.stop();

    this._onDataCallback = onData;
    this._onReadyCallback = onReady;
    this._onErrorCallback = onError;

    const args = [
      '-f', 's16le', 
      '-ar', String(this._inputSampleRate), 
      '-ac', '1',
      '-i', 'pipe:0',
      '-f', 's16le', 
      '-ar', String(this._outputSampleRate), 
      '-ac', '1',
      '-loglevel', 'error', 
      'pipe:1'
    ];

    try {
      this._ffmpegProcess = spawn('ffmpeg', args);
      this._isRunning = true;

      if (this._onReadyCallback) {
        this._onReadyCallback();
      }

      this._ffmpegProcess.stdout.on('data', (data) => {
        if (this._onDataCallback) {
          this._onDataCallback(data);
        }
      });
      
      this._ffmpegProcess.stderr.on('data', d => {
        const message = d.toString();
        if (!message.includes('size=') && !message.includes('time=')) {
          console.error('[FFMPEG] stderr:', message);
          if (this._onErrorCallback) {
            this._onErrorCallback(new Error(message));
          }
        }
      });
      
      this._ffmpegProcess.on('error', e => {
        console.error('[FFMPEG] Error:', e);
        this._isRunning = false;
        if (this._onErrorCallback) {
          this._onErrorCallback(e);
        }
      });
      
      this._ffmpegProcess.on('close', code => {
        this._isRunning = false;
        if (code !== 0 && code !== 255) {
          if (this._onErrorCallback) {
            this._onErrorCallback(new Error(`FFmpeg exited with code ${code}`));
          }
        }
      });
    } catch (e) {
      console.error('[FFMPEG] Failed to spawn FFmpeg process:', e.message);
      this._isRunning = false;
      if (this._onErrorCallback) {
        this._onErrorCallback(e);
      }
    }
  }

  pushAudio(buffer) {
    if (this._isRunning && this._ffmpegProcess?.stdin?.writable) {
      try {
        this._ffmpegProcess.stdin.write(buffer);
      } catch (error) {
        if (this._onErrorCallback) {
          this._onErrorCallback(error);
        }
      }
    }
  }

  stop() {
    if (this._ffmpegProcess) {
      try { 
        if (this._ffmpegProcess.stdin && !this._ffmpegProcess.stdin.destroyed) {
          this._ffmpegProcess.stdin.end(); 
        }
        if (this._isRunning) {
          this._ffmpegProcess.kill('SIGTERM'); 
        }
      } catch (error) {
        // Silent cleanup
      }
      this._ffmpegProcess = null;
      this._isRunning = false;
      this._onDataCallback = null;
      this._onReadyCallback = null;
      this._onErrorCallback = null;
    }
  }
}

module.exports = { Ffmpeg };