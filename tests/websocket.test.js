const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const { attachWebSocket } = require('../wsServer/websocket');

test('separa controle de PCM e faz flush no fim sem fechar a fila', async t => {
  let rate; const audio = []; const received = [];
  const server = http.createServer();
  const wss = attachWebSocket(server, { translate: async text => text.toUpperCase(), createPipeline: (sampleRate, emit) => {
    rate = sampleRate;
    return { pushAudio: b => audio.push(b), finish: async () => emit({ text: 'bom dia', words: [], final: true }), stop() {} };
  } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}`);
  t.after(() => { ws.terminate(); wss.close(); server.close(); });
  ws.on('message', data => received.push(JSON.parse(data)));
  await once(ws, 'open');
  ws.send(JSON.stringify({ type: 'audio_metadata', sampleRate: 48000 }));
  ws.send(Buffer.from([0, 0, 1, 0]));
  ws.send(JSON.stringify({ type: 'end_audio' }));
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(rate, 48000); assert.equal(audio.length, 1); assert.equal(audio[0].length, 4);
  assert.ok(received.some(e => e.type === 'transcript' && e.final && e.text === 'bom dia'));
  const b = received.findLast(e => e.type === 'queue').blocks[0];
  ws.send(JSON.stringify({ type: 'playback', action: 'request', id: b.id }));
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.ok(received.some(e => e.type === 'play' && e.gloss === 'BOM DIA'));
});

test('taxa inválida não cria pipeline e PCM antes dos metadados não é interpretado como JSON', async t => {
  let pipelines = 0; const received = [];
  const server = http.createServer();
  const wss = attachWebSocket(server, { translate: async text => text, createPipeline: () => { pipelines++; } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}`);
  t.after(() => { ws.terminate(); wss.close(); server.close(); });
  ws.on('message', data => received.push(JSON.parse(data)));
  await once(ws, 'open');
  ws.send(JSON.stringify({ type: 'audio_metadata', sampleRate: -1 }));
  ws.send(Buffer.from('bonjour'));
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(pipelines, 0);
  assert.ok(received.some(e => e.type === 'error'));
});

test('erro do processo de áudio encerra a captura e libera a sessão', async t => {
  let stopped = 0; const received = [];
  const server = http.createServer();
  const wss = attachWebSocket(server, { translate: async text => text, createPipeline: (_, emit, fail) => {
    setImmediate(() => fail(new Error('FFmpeg encerrou inesperadamente.')));
    return { pushAudio() {}, finish: async () => {}, stop: () => stopped++ };
  } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}`);
  t.after(() => { ws.terminate(); wss.close(); server.close(); });
  ws.on('message', data => received.push(JSON.parse(data)));
  await once(ws, 'open'); ws.send(JSON.stringify({ type: 'audio_metadata', sampleRate: 16000 }));
  const [code] = await once(ws, 'close');
  assert.equal(code, 1011); assert.equal(stopped, 1);
  assert.ok(received.some(e => e.type === 'error' && e.fatal));
});
