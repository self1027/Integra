const { test } = require('node:test');
const assert = require('node:assert/strict');

test('player espera animação começar e não avança por loading, pausa ou idle duplicado', async () => {
  const { PlayerController } = await import('../public/js/player.mjs');
  const sent = []; const commands = [];
  const p = new PlayerController({ sendToServer: e => sent.push(e), sendToPlayer: e => commands.push(e) });
  p.update([{ id: 1, status: 'ready' }, { id: 2, status: 'ready' }]);
  assert.equal(sent.length, 0);
  p.handleEvent({ event: 'on_load_player' });
  assert.equal(sent.at(-1).action, 'request');
  p.play({ id: 1, gloss: 'BOM DIA', text: 'bom dia' });
  p.handleEvent({ event: 'on_playing_state_change', data: ['False', 'False', 'False', 'True', 'False'] });
  p.handleEvent({ event: 'on_playing_state_change', data: ['False', 'False', 'False', 'False', 'False'] });
  assert.equal(sent.filter(e => e.action === 'ended').length, 0);
  p.handleEvent({ event: 'on_playing_state_change', data: ['True', 'False', 'False', 'False', 'False'] });
  p.handleEvent({ event: 'on_playing_state_change', data: ['False', 'True', 'False', 'False', 'False'] });
  assert.equal(sent.filter(e => e.action === 'ended').length, 0);
  p.handleEvent({ event: 'on_playing_state_change', data: ['False', 'False', 'False', 'False', 'False'] });
  p.update([{ id: 2, status: 'ready' }]);
  p.play({ id: 2, gloss: 'OBRIGADO', text: 'obrigado' });
  p.handleEvent({ event: 'on_playing_state_change', data: ['False', 'False', 'False', 'False', 'False'] });
  assert.equal(sent.filter(e => e.action === 'ended').length, 1);
  assert.equal(commands.filter(e => e.method === 'playNow').length, 2);
  p.cancel();
});

test('cancelar invalida autorização atrasada e bloco em hold não é solicitado', async () => {
  const { PlayerController } = await import('../public/js/player.mjs');
  const sent = []; const commands = [];
  const p = new PlayerController({ sendToServer: e => sent.push(e), sendToPlayer: e => commands.push(e) });
  p.handleEvent({ event: 'on_load_player' });
  p.update([{ id: 1, status: 'ready', hold: true }]);
  assert.equal(sent.length, 0);
  p.update([{ id: 1, status: 'ready', hold: false }]);
  assert.equal(sent.length, 1);
  p.cancel(); p.play({ id: 1, gloss: 'ANTIGA' });
  assert.equal(commands.filter(e => e.method === 'playNow').length, 0);
});

test('o build real confirma sinal pelo contador mesmo sem novo evento playing após loading', async () => {
  const { PlayerController } = await import('../public/js/player.mjs');
  const sent = [];
  const p = new PlayerController({ sendToServer: e => sent.push(e), sendToPlayer() {} });
  p.handleEvent({ event: 'on_load_player' }); p.update([{ id: 1, status: 'ready' }]); p.play({ id: 1, gloss: 'OBRIGADO' });
  p.handleEvent({ event: 'counter_gloss', data: [0, 0] });
  p.handleEvent({ event: 'on_playing_state_change', data: ['True', 'False', 'False', 'True', 'True'] });
  assert.equal(sent.filter(e => e.action === 'started').length, 0);
  p.handleEvent({ event: 'counter_gloss', data: [1, 1] });
  p.handleEvent({ event: 'on_playing_state_change', data: ['False', 'False', 'False', 'False', 'True'] });
  assert.equal(sent.filter(e => e.action === 'started').length, 1);
  assert.equal(sent.filter(e => e.action === 'ended').length, 1);
  p.cancel();
});

test('autorização recusada por revisão permite novo pedido quando o bloco volta a ficar pronto', async t => {
  const { PlayerController } = await import('../public/js/player.mjs');
  const { StreamingSession } = require('../audioPipeline/StreamingSession');
  const events = [], sent = [];
  let now = 0;
  const session = new StreamingSession({ send: e => events.push(e), translate: async () => 'BOM DIA HOJE VAMOS', now: () => now });
  const p = new PlayerController({ sendToServer: e => sent.push(e), sendToPlayer() {} });
  t.after(() => { p.cancel(); session.cancel(); });
  const text = 'bom dia hoje vamos estudar juntos';
  const words = text.split(' ').map((word, i) => ({ word, start: i * .4, end: i * .4 + .3 }));
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const deliver = () => { for (const e of events.splice(0)) {
    if (e.type === 'queue') p.update(e.blocks);
    if (e.type === 'play_denied') p.deny(e.id);
    if (e.type === 'play') p.play(e);
  } };
  session.recognize({ text, words }); now = 300; session.recognize({ text, words }); now = 650; session.recognize({ text, words });
  await tick(); p.handleEvent({ event: 'on_load_player' }); deliver();
  assert.equal(sent.length, 1);
  now = 900; session.recognize({ text, words: [] });
  session.playback(sent[0]); deliver();
  session.recognize({ text, words, final: true }); await tick(); deliver();
  assert.equal(sent.length, 2);
  session.playback(sent[1]); deliver();
  assert.equal(p.active.id, 1);
});
