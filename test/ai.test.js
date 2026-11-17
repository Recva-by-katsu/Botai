import test from 'node:test';
import assert from 'node:assert/strict';
import { complete, splitMessage, AIError } from '../src/ai.js';
import { loadConfig } from '../src/config.js';
const env = { TELEGRAM_BOT_TOKEN: 'test-token', KATSU_API_KEY: 'test-key' };
const config = loadConfig(env);

test('konfigurasi default dan allowlist', () => {
  assert.equal(config.model, 'auto');
  assert.equal(loadConfig({ ...env, ALLOWED_USER_IDS: '123, 456' }).allowed.size, 2);
  assert.throws(() => loadConfig({}), /wajib/);
  assert.throws(() => loadConfig({ ...env, HISTORY_TURNS: '0' }), /bilangan/);
  assert.throws(() => loadConfig({ ...env, ALLOWED_USER_IDS: 'abc' }), /ID angka/);
  assert.throws(() => loadConfig({ ...env, KATSU_BASE_URL: 'http://example.com' }), /HTTPS/);
});
test('request sesuai kontrak chat completions', async () => {
  const messages = [{ role: 'user', content: 'Halo' }];
  const answer = await complete(config, messages, async (url, options) => {
    assert.equal(url, 'https://ai.katsuvip.eu.cc/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    assert.deepEqual(JSON.parse(options.body), { model: 'auto', messages, stream: false });
    return Response.json({ choices: [{ message: { content: ' Hai! ' } }] });
  });
  assert.equal(answer, 'Hai!');
});
test('mendukung header API key alternatif', async () => {
  await complete({ ...config, authHeader: 'X-API-Key' }, [], async (_, options) => {
    assert.equal(options.headers['X-API-Key'], 'test-key');
    return Response.json({ choices: [{ message: { content: 'OK' } }] });
  });
});
test('error API tidak membocorkan respons server', async () => {
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(complete(config, [], async () => new Response('secret', { status })), e => e instanceof AIError && !e.message.includes('secret'));
  }
});
test('respons rusak dan jaringan gagal ditangani', async () => {
  await assert.rejects(complete(config, [], async () => Response.json({})), /jawaban teks/);
  await assert.rejects(complete(config, [], async () => new Response('not json')), /Format/);
  await assert.rejects(complete(config, [], async () => { throw new Error('secret'); }), /tidak dapat dihubungi/);
});
test('pesan panjang terpotong tanpa merusak emoji', () => {
  const text = 'a'.repeat(3999) + '😀'.repeat(4000);
  const chunks = splitMessage(text);
  assert.equal(chunks.join(''), text);
  assert.ok(chunks.every(c => c.length <= 4000));
  assert.ok(chunks.every(c => !/[\uD800-\uDBFF]$/.test(c)));
});
