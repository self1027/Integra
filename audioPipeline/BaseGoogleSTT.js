const { SpeechClient } = require('@google-cloud/speech');
const { SpeechStreamManager } = require('./SpeechStreamManager');

class BaseGoogleSTT {
  constructor(config) {
    this._client = new SpeechClient();
    this._config = config;
    this._streamManager = new SpeechStreamManager();
    this._onTranscription = config.onTranscription;
  }

  async init() {
    return Promise.resolve();
  }

  getRequestConfig() {
    throw new Error('getRequestConfig must be implemented by subclass');
  }

  _handleSpeechData(data) {
    throw new Error('_handleSpeechData must be implemented by subclass');
  }

  _startStream() {
    this._streamManager.cleanup();

    const audioStream = this._streamManager.createAudioStream();
    const requestConfig = this.getRequestConfig();

    const recognizeStream = this._client.streamingRecognize(requestConfig);
    
    this._streamManager.setupStreamHandlers(recognizeStream, {
      onError: (err) => this._onStreamError(err),
      onEnd: () => this._onStreamEnd(),
      onData: (data) => this._handleSpeechData(data),
      onRestart: () => this._restartStream()
    });

    audioStream.pipe(recognizeStream);
    this._streamManager.setActive(true);
    
    this._onStreamStart();
  }

  _onStreamError(err) {
    // Can be overridden by subclasses
  }

  _onStreamEnd() {
    // Can be overridden by subclasses
  }

  _onStreamStart() {
    // Can be overridden by subclasses
  }

  _restartStream() {
    console.log("[BaseGoogleSTT] Restarting stream");
    this._startStream();
  }

  pushAudio(pcmBuffer) {
    this._streamManager.pushAudio(pcmBuffer, () => this._startStream());
  }

  stop() {
    this._streamManager.cleanup();
  }
}

module.exports = { BaseGoogleSTT };