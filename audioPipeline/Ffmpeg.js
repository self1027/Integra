const { spawn } = require('child_process');

class Ffmpeg {
  /**
   * Constructs an Ffmpeg instance.
   * @param {object} config The configuration object.
   * @param {number} config.inputSampleRate The input audio sample rate in Hz.
   * @param {number} config.outputSampleRate The desired output audio sample rate in Hz.
   */
  constructor({ inputSampleRate, outputSampleRate }) {
    this._inputSampleRate = inputSampleRate;
    this._outputSampleRate = outputSampleRate;
    this._ffmpegProcess = null;
    this._isRunning = false;
    this._onDataCallback = null;
    this._onReadyCallback = null;
    this._onErrorCallback = null;
  }

  /**
   * Starts the FFmpeg process with the configured sample rates.
   * It pipes audio input to FFmpeg and receives the resampled audio from its output.
   * @param {object} config Configuration object
   * @param {Function} config.onData A callback function to handle the processed audio data.
   * @param {Function} config.onReady A callback function called when FFmpeg is ready.
   * @param {Function} config.onError A callback function called when FFmpeg encounters an error.
   */
  start({ onData, onReady, onError }) {
    this.stop(); // Ensure any existing process is stopped before starting a new one.

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
      console.log(`[FFMPEG] Process started with PID: ${this._ffmpegProcess.pid}`);

      // FFmpeg is ready immediately for writing (no need to wait for 'ready' event)
      if (this._onReadyCallback) {
        this._onReadyCallback();
      }

      // Attach event listeners to the new process instance
      this._ffmpegProcess.stdout.on('data', (data) => {
        if (this._onDataCallback) {
          this._onDataCallback(data);
        }
      });
      
      this._ffmpegProcess.stderr.on('data', d => {
        const message = d.toString();
        // Filter out common status messages that aren't errors
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
        // Code 255 is normal when FFmpeg is terminated by the user
        if (code !== 0 && code !== 255) {
          console.log(`[FFMPEG] Process exited with code ${code}`);
          if (this._onErrorCallback) {
            this._onErrorCallback(new Error(`FFmpeg exited with code ${code}`));
          }
        } else {
          console.log('[FFMPEG] Process closed normally');
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

  /**
   * Pushes an audio buffer to the FFmpeg process's stdin pipe.
   * @param {Buffer} buffer The audio buffer to write.
   */
  pushAudio(buffer) {
    if (this._isRunning && this._ffmpegProcess?.stdin?.writable) {
      try {
        this._ffmpegProcess.stdin.write(buffer);
      } catch (error) {
        console.warn('[FFMPEG] Error writing to stdin:', error.message);
        if (this._onErrorCallback) {
          this._onErrorCallback(error);
        }
      }
    } else {
      console.warn('[FFMPEG] stdin not available for writing or process is not running.');
    }
  }

  stop() {
    console.log('[FFMPEG] Stopping process');
    if (this._ffmpegProcess) {
      try { 
        if (this._ffmpegProcess.stdin && !this._ffmpegProcess.stdin.destroyed) {
          this._ffmpegProcess.stdin.end(); 
        }
        if (this._isRunning) {
          this._ffmpegProcess.kill('SIGTERM'); 
        }
      } catch (error) {
        console.warn('[FFMPEG] Error stopping process:', error.message);
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