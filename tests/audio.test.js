const { test } = require('node:test');
const assert = require('node:assert/strict');
const { VoskSTT } = require('../audioPipeline/VoskSTT');
const { Ffmpeg } = require('../audioPipeline/Ffmpeg');

test('Vosk emite parciais temporizados e libera resultado pendente antes de free', () => {
  const events = [];
  let freed = false;
  const recognizer = {
    setWords() {}, setPartialWords() {}, acceptWaveform: () => false,
    partialResult: () => ({ partial: 'bom dia', partial_result: [{ word: 'bom', start: 0, end: 0.3 }] }),
    finalResult: () => { assert.equal(freed, false); return { text: 'bom dia', result: [{ word: 'bom', start: 0, end: 0.3 }, { word: 'dia', start: 0.4, end: 0.7 }] }; },
    free: () => { freed = true; },
  };
  const stt = new VoskSTT({ model: {}, sampleRate: 16000, onRecognition: e => events.push(e), createRecognizer: () => recognizer });
  stt.pushAudio(Buffer.alloc(8000));
  stt.finish(); stt.stop();
  assert.equal(events[0].text, 'bom dia');
  assert.equal(events[0].final, false);
  assert.equal(events[0].words[0].word, 'bom');
  assert.equal(events.at(-1).final, true);
  assert.equal(events.at(-1).text, 'bom dia');
  assert.equal(freed, true);
});

test('FFmpeg drena todo PCM antes de concluir finish', async () => {
  const chunks = [];
  const ffmpeg = new Ffmpeg({ inputSampleRate: 48000, outputSampleRate: 16000 });
  ffmpeg.start({ onData: b => chunks.push(b), onError: () => {} });
  ffmpeg.pushAudio(Buffer.alloc(48000 * 2));
  await ffmpeg.finish();
  assert.equal(Buffer.concat(chunks).length, 16000 * 2);
  ffmpeg.stop();
});

test('morte inesperada do FFmpeg por sinal é informada ao chamador', async t => {
  const { once } = require('node:events');
  const errors = [];
  const ffmpeg = new Ffmpeg({ inputSampleRate: 16000, outputSampleRate: 16000 });
  t.after(() => ffmpeg.stop());
  ffmpeg.start({ onData() {}, onError: error => errors.push(error) });
  const child = ffmpeg.process;
  await once(child, 'spawn');
  child.kill();
  await once(child, 'close');
  assert.equal(errors.length, 1);
});
