/**
 * Uji integrasi ujung-ke-ujung: bot dijalankan sungguhan, API Telegram di-stub
 * lewat transformer grammy dan KATSU AI di-stub lewat global fetch.
 * Memverifikasi alur perintah, generasi streaming, tombol inline, pemilih model,
 * dan pembatas laju.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TELEGRAM_BOT_TOKEN = '123:smoke';
process.env.KATSU_API_KEY = 'smoke-key';
process.env.RATE_LIMIT_REQUESTS = '3';
process.env.RATE_LIMIT_WINDOW_SECONDS = '60';

const ME = { id: 42, is_bot: true, first_name: 'Botai', username: 'botai_bot', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false };

const telegramCalls = [];
const payloads = [];
let messageId = 100;

// Patch start sebelum index.js dimuat agar tidak long polling sungguhan.
import { Bot } from 'grammy';
Bot.prototype.start = async function start() { this.me ??= ME; };

// Stub KATSU AI (dipanggil oleh ai.js pada saat handleUpdate).
globalThis.fetch = async (url) => {
  const target = String(url);
  if (target.includes('/v1/models')) {
    return Response.json({ data: [{ id: 'auto' }, { id: 'gpt-4o-mini' }, { id: 'qwen2.5:7b' }] });
  }
  if (target.includes('/v1/chat/completions')) {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        const frames = [
          'data: {"choices":[{"delta":{"content":"Jawaban **tebal** dengan kode:\\n\\n"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"```js\\nconsole.log(1);\\n```\\n\\n"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"<script>alert(1)</script>"}}]}\n\n',
          'data: [DONE]\n\n',
        ];
        for (const frame of frames) controller.enqueue(encoder.encode(frame));
        controller.close();
      },
    });
    return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
  }
  throw new Error(`URL tidak di-stub: ${target}`);
};

const { bot } = await import('../src/index.js');

// Stub API Telegram lewat transformer (dicatat agar bisa dites).
bot.api.config.use(async (prev, method, payload) => {
  telegramCalls.push(method);
  const ok = result => ({ ok: true, result });
  switch (method) {
    case 'sendMessage':
    case 'editMessageText':
      payloads.push({ method, ...payload });
      return ok({ message_id: ++messageId, date: 0, chat: { id: 7, type: 'private' }, text: '' });
    default:
      return ok(true);
  }
});

const lastText = () => payloads.at(-1)?.text ?? '';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const USER = { id: 7, is_bot: false, first_name: 'Uji' };
const CHAT = { id: 7, type: 'private', first_name: 'Uji' };
let updateId = 0;
const textUpdate = (text, entities) => ({
  update_id: ++updateId,
  message: {
    message_id: ++messageId, date: 0, chat: CHAT, from: USER, text,
    ...(entities ? { entities } : {}),
  },
});
const commandUpdate = text => textUpdate(text, [{ type: 'bot_command', offset: 0, length: text.length }]);
const callbackUpdate = (data, messageText = 'x') => ({
  update_id: ++updateId,
  callback_query: {
    id: `cb${updateId}`, from: USER, data, chat_instance: 'c',
    message: { message_id: ++messageId, date: 0, chat: CHAT, text: messageText },
  },
});

test('alur lengkap: sambutan, streaming, tombol, pemilih model', async () => {
  // /start
  await bot.handleUpdate(commandUpdate('/start'));
  assert.ok(lastText().includes('KATSU AI'), 'kartu sambutan');
  assert.ok(lastText().includes('<b>Uji</b>'), 'nama pengguna dirender HTML');

  // Pertanyaan → placeholder, pratinjau streaming, jawaban akhir berformat
  await bot.handleUpdate(textUpdate('Siapa presiden Indonesia?'));
  await delay(20);
  const flow = payloads.slice(-3).map(p => p.text ?? '');
  assert.ok(flow[0].includes('🧠'), 'placeholder sedang berpikir');
  assert.ok(flow[1].includes('✍️'), 'pratinjau streaming disunting');
  const final = flow[2];
  assert.ok(final.includes('<b>tebal</b>'), 'markdown tebal dirender');
  assert.ok(final.includes('<pre><code class="language-js">'), 'blok kode dengan bahasa');
  assert.ok(final.includes('&lt;script&gt;'), 'injeksi HTML di-escape');
  assert.ok(!final.includes('<script>alert'), 'tidak ada script mentah');
  assert.ok(final.includes('⚡ auto · ⏱'), 'footer model & durasi');

  // Tombol ♻️ Ulangi → jawaban disusun ulang (kuota ke-2)
  payloads.length = 0;
  await bot.handleUpdate(callbackUpdate('retry'));
  await delay(20);
  assert.ok(lastText().includes('⚡ auto · ⏱'), 'jawaban dibuat ulang');

  // /model → daftar model dari GET /v1/models
  await bot.handleUpdate(commandUpdate('/model'));
  assert.ok(lastText().includes('Pilih Model AI'), 'kartu pemilih model');
  assert.ok(payloads.at(-1).reply_markup.inline_keyboard.flat().some(b => b.callback_data === 'ms:0:qwen2.5:7b'), 'model dari API ditampilkan sebagai tombol');

  // Pilih model lewat tombol → ✅ pindah
  await bot.handleUpdate(callbackUpdate('ms:0:gpt-4o-mini'));
  await delay(20);
  assert.ok(payloads.some(p => p.reply_markup?.inline_keyboard?.flat().some(b => b.text === '✅ gpt-4o-mini')), 'model baru ditandai');

  // Pertanyaan berikutnya memakai model baru (kuota ke-3)
  payloads.length = 0;
  await bot.handleUpdate(textUpdate('halo lagi'));
  await delay(20);
  assert.ok(lastText().includes('⚡ gpt-4o-mini'), 'footer memakai model baru');

  // Tombol hapus & tutup
  await bot.handleUpdate(callbackUpdate('del'));
  await bot.handleUpdate(callbackUpdate('close'));
  assert.ok(telegramCalls.includes('deleteMessage'), 'pesan dihapus');

  // Perintah tak dikenal & pesan non-teks
  await bot.handleUpdate(commandUpdate('/wkwk'));
  assert.ok(lastText().includes('tidak dikenal'), 'penanda perintah asing');
  await bot.handleUpdate({ update_id: ++updateId, message: { message_id: ++messageId, date: 0, chat: CHAT, from: USER, photo: [{ file_id: 'x' }] } });
  assert.ok(lastText().includes('pesan teks'), 'penanda pesan non-teks');

  // /status menampilkan model aktif & kuota
  await bot.handleUpdate(commandUpdate('/status'));
  assert.ok(lastText().includes('gpt-4o-mini'), 'status menampilkan model aktif');
  assert.ok(lastText().includes('Kuota'), 'status menampilkan kuota');
});

test('pembatas laju memblokir permintaan setelah kuota habis', async () => {
  payloads.length = 0;
  await bot.handleUpdate(textUpdate('apalagi?'));
  await delay(20);
  const notice = lastText();
  assert.ok(notice.includes('Terlalu banyak permintaan'), 'kartu pembatas laju');
  assert.ok(notice.includes('detik'), 'waktu tunggu disebut');
});

test('chat baru menghapus konteks dan memulai ulang', async () => {
  payloads.length = 0;
  await bot.handleUpdate(callbackUpdate('new'));
  assert.ok(lastText().includes('Chat baru dimulai'), 'pemberitahuan chat baru');
  assert.ok(payloads.some(p => p.reply_markup?.inline_keyboard?.flat().some(b => b.text === '🧠 Model')), 'menu utama muncul kembali');
});
