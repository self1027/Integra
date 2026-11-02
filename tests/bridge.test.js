const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('ponte aceita 3x e 4x sem liberar velocidades inválidas ou mensagens de outra origem', () => {
  const sent = [];
  const listeners = {};
  const parent = {};
  vm.runInNewContext(fs.readFileSync('public/player/bridge.js', 'utf8'), {
    window: { addEventListener: (event, listener) => { listeners[event] = listener; } },
    parent, location: { origin: 'https://integra.test' },
    UnityLoader: { instantiate: () => ({ SendMessage: (...args) => sent.push(args) }) },
  });
  const message = (speed, origin = 'https://integra.test') => listeners.message({
    origin, source: parent, data: { type: 'unity', object: 'PlayerManager', method: 'setSlider', params: speed },
  });
  for (const speed of [0.5, 1, 1.5, 2, 3, 4]) message(speed);
  for (const speed of [0, -1, 5, NaN, Infinity, '4']) message(speed);
  message(4, 'https://outro.test');
  assert.deepEqual(sent, [
    ['PlayerManager', 'setSlider', 0.5], ['PlayerManager', 'setSlider', 1],
    ['PlayerManager', 'setSlider', 1.5], ['PlayerManager', 'setSlider', 2],
    ['PlayerManager', 'setSlider', 3], ['PlayerManager', 'setSlider', 4],
  ]);
});
