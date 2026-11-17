import test from 'node:test';
import assert from 'node:assert/strict';
import { AIError, chat, complete, extractModelIds, listModels } from '../src/ai.js';
import { loadConfig } from '../src/config.js';

const config = loadConfig({ TELEGRAM_BOT_TOKEN: 't', KATSU_API_KEY: 'test-key' });

function sseResponse(chunks) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

test('complete: kontrak request chat completions', async () => {
  const messages = [{ role: 'user', content: 'Halo' }];
  const answer = await complete(config, messages, async (url, options) => {
    assert.equal(url, 'https://ai.katsuvip.eu.cc/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    assert.deepEqual(JSON.parse(options.body), { model: 'auto', messages, stream: false, temperature: 0.7 });
    return Response.json({ choices: [{ message: { content: ' Hai! ' } }] });
  });
  assert.equal(answer, 'Hai!');
});

test('complete: header alternatif dan max_tokens', async () => {
  const special = { ...config, authHeader: 'X-API-Key', maxTokens: 512 };
  await complete(special, [], async (_, options) => {
    assert.equal(options.headers['X-API-Key'], 'test-key');
    assert.equal(JSON.parse(options.body).max_tokens, 512);
    return Response.json({ choices: [{ message: { content: 'OK' } }] });
  });
});

test('complete: galat API tidak membocorkan isi respons', async () => {
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(
      complete(config, [], async () => new Response('secret', { status })),
      e => e instanceof AIError && !e.message.includes('secret'),
    );
  }
});

test('complete: respons rusak, kosong, dan jaringan gagal', async () => {
  await assert.rejects(complete(config, [], async () => Response.json({})), /jawaban teks/);
  await assert.rejects(complete(config, [], async () => new Response('not json')), /Format/);
  await assert.rejects(complete(config, [], async () => { throw new Error('secret'); }), /tidak dapat dihubungi/);
});

test('chat: streaming SSE mengalirkan delta dan mengumpulkan teks', async () => {
  const deltas = [];
  const fetcher = async (url, options) => {
    assert.equal(JSON.parse(options.body).stream, true);
    return sseResponse([
      'data: {"choices":[{"delta":{"content":"Halo"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":", dunia"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"!"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);
  };
  const { text, truncated } = await chat(config, [{ role: 'user', content: 'Hai' }], {
    onDelta: (_, full) => deltas.push(full),
  }, fetcher);
  assert.equal(text, 'Halo, dunia!');
  assert.equal(truncated, false);
  assert.deepEqual(deltas, ['Halo', 'Halo, dunia', 'Halo, dunia!']);
});

test('chat: server mengabaikan stream dan membalas JSON utuh', async () => {
  const fetcher = async () => Response.json({ choices: [{ message: { content: 'Jawaban utuh' } }] });
  const { text } = await chat(config, [], {}, fetcher);
  assert.equal(text, 'Jawaban utuh');
});

test('chat: aliran terputus dengan konten parsial ditandai terpotong', async () => {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    // Chunk pertama diantar, lalu koneksi mati ketika pembaca meminta lanjutan.
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Sebagian"}}]}\n\n'));
    },
    pull(controller) {
      controller.error(new DOMException('TimeoutError', 'TimeoutError'));
    },
  });
  const fetcher = async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } });
  const { text, truncated } = await chat(config, [], {}, fetcher);
  assert.equal(text, 'Sebagian');
  assert.equal(truncated, true);
});

test('chat: galat di tengah aliran tanpa konten tetap AIError', async () => {
  const encoder = new TextEncoder();
  const body = new ReadableStream({ start(controller) { controller.error(new Error('boom')); } });
  const fetcher = async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } });
  await assert.rejects(chat(config, [], {}, fetcher), /terputus/);
});

test('extractModelIds: berbagai bentuk respons', () => {
  assert.deepEqual(extractModelIds({ data: [{ id: 'auto' }, { id: 'gpt-4o' }, { id: 'auto' }] }), ['auto', 'gpt-4o']);
  assert.deepEqual(extractModelIds(['auto', 'qwen2.5:7b']), ['auto', 'qwen2.5:7b']);
  assert.deepEqual(extractModelIds({ models: [{ name: 'llama3' }] }), ['llama3']);
  assert.deepEqual(extractModelIds({ detail: 'Missing bearer token' }), []);
  assert.deepEqual(extractModelIds(null), []);
});

test('listModels: HTTP galat dipetakan menjadi AIError', async () => {
  await assert.rejects(listModels(config, async () => new Response('x', { status: 401 })), /Kredensial/);
  await assert.rejects(listModels(config, async () => { throw new Error('x'); }), /dapat dihubungi/);
});
