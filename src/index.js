import 'dotenv/config';
import { Bot } from 'grammy';
import { loadConfig } from './config.js';
import { AIError, chat, listModels } from './ai.js';
import { escapeHtml, markdownToBlocks, packBlocks } from './markdown.js';
import { createSessionStore } from './session.js';
import { createRateLimiter } from './ratelimit.js';
import * as ui from './ui.js';

let config;
try { config = loadConfig(); } catch (error) { console.error(error.message); process.exit(1); }

const bot = new Bot(config.token);
const sessions = createSessionStore({
  maxSessions: config.maxSessions,
  ttlMs: config.sessionTtl,
  historyTurns: config.historyTurns,
});
const limiter = createRateLimiter({ limit: config.rateLimit.requests, windowMs: config.rateLimit.windowMs });
const KNOWN_COMMANDS = new Set(['start', 'help', 'new', 'reset', 'model', 'settings', 'status']);
const MODELS_PER_PAGE = 6;
const MODELS_CACHE_TTL = 5 * 60000;
let modelsCache = { ids: null, at: 0 };

const redact = s => String(s).replace(/bot\d+:[\w-]{20,}/g, '[TOKEN DISENSOR]');
const effective = {
  model: session => session?.model || config.model,
  temperature: session => session?.temperature ?? config.temperature,
  stream: session => session?.stream ?? config.streamEnabled,
};
const sendHtml = (ctx, text, extra = {}) => ctx.reply(text, { parse_mode: 'HTML', ...extra });

async function safeEdit(chatId, messageId, text, extra = {}) {
  try {
    await bot.api.editMessageText(chatId, messageId, text, extra);
    return true;
  } catch (error) {
    // "message is not modified" diabaikan; kegagalan lain dilaporkan tanpa membocorkan detail.
    if (!String(error?.message).includes('message is not modified')) {
      console.error('Gagal menyunting pesan:', redact(error?.message || error));
    }
    return false;
  }
}

function startTyping(ctx) {
  const send = () => ctx.api.sendChatAction(ctx.chat.id, 'typing').catch(() => {});
  send();
  const timer = setInterval(send, 4000);
  return () => clearInterval(timer);
}

function previewText(full) {
  const max = 3500;
  const body = full.length > max ? `…${full.slice(-max)}` : full;
  return `${body}\n\n✍️ ${full.length} karakter…`;
}

function buildPrompt(ctx, text) {
  const replied = ctx.message.reply_to_message;
  if (replied?.from?.id === ctx.me.id && typeof replied.text === 'string' && replied.text.trim()) {
    const quote = replied.text.replace(/\s+/g, ' ').trim().slice(0, 800);
    return {
      text,
      content: `Konteks jawabanmu sebelumnya:\n"${quote}"\n\nPertanyaan lanjutanku: ${text}`,
    };
  }
  return { text, content: text };
}

function buildApiMessages(session, userContent) {
  const history = session.messages.slice(-2 * config.historyTurns);
  return [
    { role: 'system', content: config.systemPrompt },
    ...history,
    { role: 'user', content: userContent },
  ];
}

async function getModelIds() {
  if (modelsCache.ids && Date.now() - modelsCache.at < MODELS_CACHE_TTL) return modelsCache.ids;
  const fetched = await listModels(config);
  const ids = fetched.length ? fetched : [config.model];
  if (!ids.includes('auto')) ids.unshift('auto');
  modelsCache = { ids, at: Date.now() };
  return ids;
}

async function openModelPicker(ctx, page = 0, { viaEdit = false } = {}) {
  try {
    const ids = await getModelIds();
    const session = sessions.ensure(ctx.from.id);
    const current = effective.model(session);
    const pages = Math.max(1, Math.ceil(ids.length / MODELS_PER_PAGE));
    page = Math.min(Math.max(0, page), pages - 1);
    const slice = ids.slice(page * MODELS_PER_PAGE, (page + 1) * MODELS_PER_PAGE);
    const payload = {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: ui.modelKeyboard(slice, current, page, pages) },
    };
    if (viaEdit) {
      const ok = await safeEdit(ctx.chat.id, ctx.callbackQuery.message.message_id, ui.modelText(current, page, pages), payload);
      if (ok) return;
    }
    await sendHtml(ctx, ui.modelText(current, page, pages), payload);
  } catch (error) {
    const message = error instanceof AIError ? error.message : 'Daftar model gagal dimuat.';
    await sendHtml(ctx, `⚠️ ${escapeHtml(message)}`, { reply_markup: { inline_keyboard: ui.closeKeyboard() } });
  }
}

function renderSettings(ctx) {
  const session = sessions.ensure(ctx.from.id);
  const temperature = effective.temperature(session);
  const stream = effective.stream(session);
  return {
    text: ui.settingsText(temperature, stream),
    extra: { parse_mode: 'HTML', reply_markup: { inline_keyboard: ui.settingsKeyboard(temperature, stream) } },
  };
}

async function generate(ctx, session, prompt, { appendUser = true } = {}) {
  session.busy = true;
  const stopTyping = startTyping(ctx);
  const chatId = ctx.chat.id;
  const startedAt = Date.now();
  const apiModel = effective.model(session);
  const apiConfig = { ...config, model: apiModel, temperature: effective.temperature(session) };
  let placeholder = null;
  let lastPreview = 0;
  let firstDelta = true;

  try {
    const apiMessages = buildApiMessages(session, prompt.content);
    placeholder = await ctx.reply(ui.thinking, { parse_mode: 'HTML' });

    const onDelta = effective.stream(session) ? (_, full) => {
      const t = Date.now();
      if (firstDelta || t - lastPreview >= config.editIntervalMs) {
        firstDelta = false;
        lastPreview = t;
        safeEdit(chatId, placeholder.message_id, previewText(full));
      }
    } : undefined;

    const { text: answer, truncated } = await chat(apiConfig, apiMessages, { onDelta });

    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1).replace('.', ',');
    const footer = `\n\n<i>⚡ ${escapeHtml(apiModel)} · ⏱ ${seconds} dtk${truncated ? ' · terpotong' : ''}</i>`;
    const chunks = packBlocks(markdownToBlocks(answer), 3800);
    const actions = { reply_markup: { inline_keyboard: ui.answerActionsKeyboard() } };

    if (chunks.length === 1) {
      const ok = await safeEdit(chatId, placeholder.message_id, chunks[0] + footer, { parse_mode: 'HTML', ...actions });
      if (!ok) await sendHtml(ctx, chunks[0] + footer, actions);
    } else {
      const okFirst = await safeEdit(chatId, placeholder.message_id, chunks[0], { parse_mode: 'HTML' });
      if (!okFirst) await sendHtml(ctx, chunks[0]);
      for (let i = 1; i < chunks.length; i++) {
        const last = i === chunks.length - 1;
        await sendHtml(ctx, chunks[i] + (last ? footer : ''), last ? actions : {});
      }
    }

    if (appendUser) sessions.push(session, 'user', prompt.content);
    sessions.push(session, 'assistant', answer);
    session.lastPrompt = prompt;
  } catch (error) {
    const reason = error instanceof AIError ? error.message : 'Pesan gagal diproses. Silakan coba lagi.';
    const card = ui.errorCard(reason);
    const extra = { parse_mode: 'HTML', reply_markup: { inline_keyboard: ui.errorActionsKeyboard() } };
    if (placeholder) {
      const ok = await safeEdit(chatId, placeholder.message_id, card, extra);
      if (!ok) await sendHtml(ctx, card, extra);
    } else {
      await sendHtml(ctx, card, extra).catch(() => {});
    }
  } finally {
    session.busy = false;
    stopTyping();
  }
}

// ===== Middleware akses =====
bot.use(async (ctx, next) => {
  if (!ctx.from || ctx.chat?.type !== 'private') return;
  if (config.allowed.size && !config.allowed.has(String(ctx.from.id))) {
    await sendHtml(ctx, '🔒 Maaf, Anda tidak memiliki akses ke bot ini.');
    return;
  }
  await next();
});

// ===== Perintah =====
bot.command(['start', 'help'], async (ctx) => {
  if (ctx.command === 'help') return sendHtml(ctx, ui.helpText, { reply_markup: { inline_keyboard: ui.closeKeyboard() } });
  const name = ctx.from.first_name || 'Sahabat';
  await sendHtml(ctx, ui.welcome(name, config.model), { reply_markup: { inline_keyboard: ui.mainMenuKeyboard() } });
});

bot.command(['new', 'reset'], async (ctx) => {
  sessions.clear(ctx.from.id);
  await sendHtml(ctx, ui.newChatNotice, { reply_markup: { inline_keyboard: ui.mainMenuKeyboard() } });
});

bot.command('model', async (ctx) => openModelPicker(ctx));
bot.command('settings', async (ctx) => {
  const { text, extra } = renderSettings(ctx);
  await sendHtml(ctx, text, extra);
});

bot.command('status', async (ctx) => {
  const session = sessions.get(ctx.from.id);
  await sendHtml(ctx, ui.statusText({
    model: effective.model(session),
    temperature: effective.temperature(session),
    stream: effective.stream(session),
    history: session?.messages.length ?? 0,
    historyMax: config.historyTurns * 2,
    remaining: limiter.peek(String(ctx.from.id)),
    limit: config.rateLimit.requests,
  }));
});

// ===== Pesan teks =====
bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (!text) return;
  if (text.startsWith('/')) {
    const command = text.slice(1).split(/\s+/)[0].split('@')[0].toLowerCase();
    if (!KNOWN_COMMANDS.has(command)) await sendHtml(ctx, ui.unknownCommand(command));
    return;
  }
  sessions.pruneExpired();
  const session = sessions.ensure(ctx.from.id);
  if (session.busy) return void sendHtml(ctx, ui.busyNotice);
  const quota = limiter.check(String(ctx.from.id));
  if (!quota.ok) return void sendHtml(ctx, ui.rateLimitNotice(quota.retryAfterSeconds));
  if (text.length > config.maxQuestion) return void sendHtml(ctx, ui.tooLong(config.maxQuestion));

  const prompt = buildPrompt(ctx, text);
  // Sengaja tidak di-await agar pemrosesan update lain tidak tertahan selama generasi berjalan.
  void generate(ctx, session, prompt, { appendUser: true });
});

bot.on('message', (ctx) => sendHtml(ctx, ui.onlyTextNotice));

// ===== Callback tombol =====
bot.callbackQuery('new', async (ctx) => {
  sessions.clear(ctx.from.id);
  await ctx.answerCallbackQuery({ text: '💬 Chat baru dimulai' });
  await sendHtml(ctx, ui.newChatNotice, { reply_markup: { inline_keyboard: ui.mainMenuKeyboard() } });
});

bot.callbackQuery('help', async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendHtml(ctx, ui.helpText, { reply_markup: { inline_keyboard: ui.closeKeyboard() } });
});

bot.callbackQuery('models', async (ctx) => {
  await ctx.answerCallbackQuery();
  await openModelPicker(ctx, 0);
});

bot.callbackQuery(/^mp:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await openModelPicker(ctx, Number(ctx.match[1]), { viaEdit: true });
});

bot.callbackQuery(/^ms:(\d+):(.+)$/, async (ctx) => {
  const [, page, model] = ctx.match;
  const session = sessions.ensure(ctx.from.id);
  if (!/^[\w.:-]{1,64}$/.test(model)) {
    return void ctx.answerCallbackQuery({ text: '🚫 ID model tidak valid' });
  }
  session.model = model;
  await ctx.answerCallbackQuery({ text: `🧠 Model diganti: ${model}` });
  await openModelPicker(ctx, Number(page), { viaEdit: true });
});

bot.callbackQuery('settings', async (ctx) => {
  await ctx.answerCallbackQuery();
  const { text, extra } = renderSettings(ctx);
  await sendHtml(ctx, text, extra);
});

bot.callbackQuery(/^st:temp:([\d.]+)$/, async (ctx) => {
  const value = Number(ctx.match[1]);
  if (!ui.TEMP_PRESETS.some(p => p.value === value)) return void ctx.answerCallbackQuery({ text: '🚫 Nilai tidak valid' });
  const session = sessions.ensure(ctx.from.id);
  session.temperature = value;
  await ctx.answerCallbackQuery({ text: `🎛️ Gaya: ${ui.tempLabel(value)}` });
  const { text, extra } = renderSettings(ctx);
  await safeEdit(ctx.chat.id, ctx.callbackQuery.message.message_id, text, extra);
});

bot.callbackQuery('st:stream', async (ctx) => {
  const session = sessions.ensure(ctx.from.id);
  session.stream = !effective.stream(session);
  await ctx.answerCallbackQuery({ text: session.stream ? '⚡ Streaming aktif' : '🔌 Streaming mati' });
  const { text, extra } = renderSettings(ctx);
  await safeEdit(ctx.chat.id, ctx.callbackQuery.message.message_id, text, extra);
});

bot.callbackQuery('retry', async (ctx) => {
  const session = sessions.get(ctx.from.id);
  if (!session?.lastPrompt) return void ctx.answerCallbackQuery({ text: 'Tidak ada pertanyaan sebelumnya' });
  if (session.busy) return void ctx.answerCallbackQuery({ text: '⏳ Masih memproses…' });
  const quota = limiter.check(String(ctx.from.id));
  if (!quota.ok) return void ctx.answerCallbackQuery({ text: `⏳ Tunggu ${quota.retryAfterSeconds} detik lagi` });
  await ctx.answerCallbackQuery({ text: '♻️ Menyusun ulang jawaban…' });
  if (session.messages.at(-1)?.role === 'assistant') session.messages.pop();
  void generate(ctx, session, session.lastPrompt, { appendUser: false });
});

bot.callbackQuery('del', async (ctx) => {
  await ctx.answerCallbackQuery({ text: '🗑️ Dihapus' }).catch(() => {});
  await ctx.deleteMessage().catch(() => {});
});

bot.callbackQuery('close', async (ctx) => {
  await ctx.answerCallbackQuery({ text: 'Ditutup' });
  await ctx.deleteMessage().catch(() => {});
});

bot.callbackQuery('noop', ctx => ctx.answerCallbackQuery());

bot.catch((error) => console.error('Gagal menangani pembaruan Telegram:', redact(error?.message || error)));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => { if (bot.isRunning()) bot.stop().catch(() => {}); });
}
try {
  await bot.api.setMyCommands([
    { command: 'start', description: 'Mulai percakapan' },
    { command: 'new', description: 'Mulai chat baru (hapus konteks)' },
    { command: 'model', description: 'Ganti model AI' },
    { command: 'settings', description: 'Gaya jawaban & streaming' },
    { command: 'status', description: 'Lihat status sesi' },
    { command: 'help', description: 'Panduan penggunaan' },
  ]);
} catch (error) {
  console.error('Gagal mendaftarkan perintah:', redact(error?.message || error));
}

try {
  // Long polling: tanpa domain/webhook. Generasi berjalan paralel, update lain tetap responsif.
  await bot.start({ onStart: me => console.log(`✅ @${me.username} aktif — ${ui.APP.name} v${ui.APP.version} (long polling)`) });
} catch {
  console.error('Bot gagal berjalan. Periksa TELEGRAM_BOT_TOKEN, koneksi jaringan, dan pastikan tidak ada instance/webhook lain.');
  process.exitCode = 1;
}

export { bot };

