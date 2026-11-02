const fs = require('fs');

const SSL_OPTIONS = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem'),
};

const HTTP_PORT = 2000;
const HTTPS_PORT = 443;
const HTTP_REDIRECT_PORT = 1000;

const MODEL_PATH = './vosk-model-small-pt-0.3';
const TARGET_SAMPLE_RATE = 16000;

module.exports = {
  SSL_OPTIONS,
  HTTP_PORT,
  HTTPS_PORT,
  HTTP_REDIRECT_PORT,
  MODEL_PATH,
  TARGET_SAMPLE_RATE,
};
