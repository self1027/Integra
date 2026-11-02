const { test } = require('node:test');
const assert = require('node:assert/strict');
const { StreamingSession } = require('../audioPipeline/StreamingSession');

const tick = () => new Promise(resolve => setImmediate(resolve));
function words(text, offset = 0) {
  return text.split(' ').map((word, i) => ({ word, start: offset + i * 0.4, end: offset + i * 0.4 + 0.3 }));
}
function setup(translate = async text => text.toUpperCase()) {
  let time = 0;
  const events = [];
  const session = new StreamingSession({ send: event => events.push(event), translate, now: () => time });
  const recognize = (text, final = false, timed = true) => session.recognize({ text, words: timed ? words(text) : [], final, audioTime: 10 });
  return { session, events, recognize, advance: value => { time = value; }, queue: () => events.findLast(e => e.type === 'queue')?.blocks || [] };
}

test('prepara um prefixo estável durante a fala e o final não repete o bloco consumido', async () => {
  const f = setup();
  const text = 'bom dia hoje vamos estudar juntos';
  f.recognize(text); f.advance(300); f.recognize(text); f.advance(650); f.recognize(text);
  await tick();
  assert.deepEqual(f.queue().map(b => b.text), ['bom dia hoje vamos']);
  const id = f.queue()[0].id;
  f.session.playback({ action: 'request', id });
  assert.equal(f.events.findLast(e => e.type === 'play').text, 'bom dia hoje vamos');
  f.session.playback({ action: 'ended', id });
  f.recognize(text, true);
  await tick();
  assert.deepEqual(f.queue().map(b => b.text), ['estudar juntos']);
});

test('invalida tradução em voo quando uma hipótese é corrigida', async () => {
  const pending = [];
  const f = setup(text => new Promise(resolve => pending.push({ text, resolve })));
  f.recognize('bom dia hoje vamos estudar juntos'); f.advance(300); f.recognize('bom dia hoje vamos estudar juntos'); f.advance(650); f.recognize('bom dia hoje vamos estudar juntos');
  await tick();
  f.recognize('boa tarde hoje vamos estudar juntos', true);
  pending[0].resolve('TRADUCAO ANTIGA');
  await tick();
  for (const p of pending.slice(1)) p.resolve('TRADUCAO NOVA');
  await tick();
  assert.ok(f.queue().every(b => b.gloss !== 'TRADUCAO ANTIGA'));
  assert.deepEqual(f.queue().map(b => b.text), ['boa tarde hoje vamos estudar juntos']);
});

test('respostas fora de ordem não autorizam ultrapassar o primeiro bloco', async () => {
  const pending = [];
  const f = setup(text => new Promise(resolve => pending.push({ text, resolve })));
  f.recognize('um dois três quatro cinco seis sete oito nove dez onze doze', true);
  await tick();
  pending[1].resolve('SEGUNDO'); await tick();
  f.session.playback({ action: 'request', id: f.queue()[1].id });
  assert.equal(f.events.filter(e => e.type === 'play').length, 0);
  pending[0].resolve('PRIMEIRO'); await tick();
  f.session.playback({ action: 'request', id: f.queue()[0].id });
  assert.equal(f.events.findLast(e => e.type === 'play').gloss, 'PRIMEIRO');
});

test('repetições reais são preservadas e parciais sem tempos não tocam antes do final', async () => {
  const f = setup();
  f.recognize('sim sim hoje vamos estudar juntos', false, false); f.advance(300); f.recognize('sim sim hoje vamos estudar juntos', false, false); f.advance(650); f.recognize('sim sim hoje vamos estudar juntos', false, false);
  await tick();
  assert.equal(f.queue()[0].hold, true);
  f.session.playback({ action: 'request', id: f.queue()[0].id });
  assert.equal(f.events.filter(e => e.type === 'play').length, 0);
  f.recognize('sim sim hoje vamos estudar juntos', true, false); await tick();
  assert.equal(f.queue()[0].text, 'sim sim hoje vamos');
  assert.equal(f.queue()[0].hold, false);
});

test('cancelamento impede resposta tardia e evento de fim duplicado não consome outro bloco', async () => {
  const f = setup(); f.recognize('um dois três quatro cinco seis sete oito', true); await tick();
  const first = f.queue()[0].id;
  f.session.playback({ action: 'request', id: first });
  f.session.playback({ action: 'ended', id: first });
  f.session.playback({ action: 'ended', id: first });
  assert.deepEqual(f.queue().map(b => b.text), ['sete oito']);
  f.session.cancel();
  f.session.playback({ action: 'request', id: f.queue()[0]?.id });
  assert.equal(f.queue().length, 0);
});

test('correção de bloco já sinalizado usa fronteira de áudio, sem repetir a frase', async () => {
  const f = setup();
  const text = 'bom dia hoje vamos estudar juntos';
  f.recognize(text); f.advance(300); f.recognize(text); f.advance(650); f.recognize(text); await tick();
  const id = f.queue()[0].id; f.session.playback({ action: 'request', id });
  f.recognize('boa tarde hoje vamos estudar juntos', true); await tick();
  assert.equal(f.queue().filter(b => b.status === 'ready').length, 0);
  f.session.playback({ action: 'ended', id }); await tick();
  assert.deepEqual(f.queue().map(b => b.text), ['estudar juntos']);
});

test('fila limitada interrompe captura, mas o texto aceito continua drenando', async () => {
  const f = setup();
  const text = Array.from({ length: 90 }, (_, i) => `palavra${i}`).join(' ');
  f.recognize(text, true); await tick();
  assert.equal(f.queue().length, 12);
  assert.ok(f.events.some(e => e.type === 'flow_control'));
  const played = [];
  while (f.queue().length) {
    await tick();
    const b = f.queue()[0]; assert.equal(b.status, 'ready');
    played.push(b.text); f.session.playback({ action: 'request', id: b.id }); f.session.playback({ action: 'ended', id: b.id });
  }
  assert.equal(played.join(' '), text);
});

test('a margem pertence às palavras mais recentes e não quebra o prefixo em palavras isoladas', async () => {
  const f = setup();
  f.recognize('bom dia hoje'); f.advance(300); f.recognize('bom dia hoje'); f.advance(650); f.recognize('bom dia hoje');
  f.advance(900); f.recognize('bom dia hoje vamos estudar');
  f.advance(1200); f.recognize('bom dia hoje vamos estudar'); await tick();
  assert.deepEqual(f.queue().map(b => b.text), ['bom dia hoje']);
});

test('final que mescla palavras reconcilia por tempo sem perder a primeira palavra restante', async () => {
  const f = setup(); const text = 'bom dia hoje vamos estudar juntos';
  f.recognize(text); f.advance(300); f.recognize(text); f.advance(650); f.recognize(text); await tick();
  const id = f.queue()[0].id; f.session.playback({ action: 'request', id }); f.session.playback({ action: 'ended', id });
  f.session.recognize({ text: 'bomdia hoje vamos estudar juntos', final: true, words: [
    { word: 'bomdia', start: 0, end: 0.7 }, { word: 'hoje', start: 0.8, end: 1.1 }, { word: 'vamos', start: 1.2, end: 1.5 },
    { word: 'estudar', start: 1.6, end: 1.9 }, { word: 'juntos', start: 2, end: 2.3 },
  ] }); await tick();
  assert.deepEqual(f.queue().map(b => b.text), ['estudar juntos']);
});

test('restante corrigido do primeiro enunciado precede o segundo mesmo se estiver em reprodução', async () => {
  const f = setup(); const text = 'bom dia hoje vamos estudar juntos';
  f.recognize(text); f.advance(300); f.recognize(text); f.advance(650); f.recognize(text); await tick();
  const id = f.queue()[0].id; f.session.playback({ action: 'request', id });
  f.recognize('boa tarde hoje vamos estudar juntos', true);
  f.recognize('este segundo enunciado', true);
  f.session.playback({ action: 'ended', id }); await tick();
  assert.deepEqual(f.queue().map(b => b.text), ['estudar juntos', 'este segundo enunciado']);
});

test('conflito temporal pausa também enunciados seguintes até uma escolha explícita', async () => {
  const f = setup(); const text = 'bom dia hoje vamos estudar juntos';
  f.recognize(text); f.advance(300); f.recognize(text); f.advance(650); f.recognize(text); await tick();
  const id = f.queue()[0].id; f.session.playback({ action: 'request', id }); f.session.playback({ action: 'ended', id });
  const correctedWords = words('boa tarde hoje vamos estudar juntos');
  correctedWords[3].end = 1.8; correctedWords[4].start = 1.9; correctedWords[4].end = 1.95;
  f.session.recognize({ text: 'boa tarde hoje vamos estudar juntos', final: true, words: correctedWords });
  assert.ok(f.events.some(e => e.type === 'conflict'));
  f.recognize('este segundo enunciado', true); await tick();
  const count = f.events.filter(e => e.type === 'play').length;
  f.session.playback({ action: 'request', id: f.queue()[0]?.id });
  assert.equal(f.events.filter(e => e.type === 'play').length, count);
  f.session.resolve({ action: 'skip', utteranceId: 1 }); await tick();
  assert.deepEqual(f.queue().map(b => b.text), ['este segundo enunciado']);
});
