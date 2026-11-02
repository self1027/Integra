const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { Translator } = require('../audioPipeline/Translator');

test('aceita resposta texto/JSON, repete falha transitória e reutiliza tradução', async t => {
  let calls = 0;
  const server = http.createServer((req, res) => {
    calls++; let body = ''; req.on('data', b => body += b); req.on('end', () => {
      assert.deepEqual(JSON.parse(body), { text: 'bom dia' });
      if (calls === 1) { res.writeHead(503); res.end(); return; }
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ traducao: 'BOM DIA' }));
    });
  }).listen(0, '127.0.0.1');
  await once(server, 'listening'); t.after(() => server.close());
  const tr = new Translator({ url: `http://127.0.0.1:${server.address().port}`, timeout: 100 });
  assert.equal(await tr.translate('bom dia'), 'BOM DIA');
  assert.equal(await tr.translate('bom dia'), 'BOM DIA');
  assert.equal(calls, 2);
});

test('não transforma erro ou resposta vazia em glosas e respeita cancelamento', async t => {
  const server = http.createServer((req, res) => res.end('')).listen(0, '127.0.0.1');
  await once(server, 'listening'); t.after(() => server.close());
  const tr = new Translator({ url: `http://127.0.0.1:${server.address().port}` });
  await assert.rejects(tr.translate('olá'), /vazia/i);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(tr.translate('teste', { signal: controller.signal }), { name: 'AbortError' });
});
