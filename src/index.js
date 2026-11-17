import 'dotenv/config';
import { Bot, InputFile } from 'grammy';
import { loadConfig } from './config.js';
import { AIError, complete, splitMessage } from './ai.js';

let config;
try { config = loadConfig(); } catch (error) { console.error(error.message); process.exit(1); }
const bot = new Bot(config.token);
const sessions = new Map();
const help = 'Halo! Saya bot KATSU AI. Kirim pesan teks untuk bertanya.\n\n/start — Mulai\n/help — Bantuan\n/reset — Hapus riwayat percakapan\n/model — Lihat model aktif\n\nBot hanya melayani chat pribadi. Pesan dan konteks dikirim ke KATSU AI. Riwayat sementara hilang saat bot restart atau sesi kedaluwarsa.';

bot.use(async (ctx, next) => {
  if (!ctx.from || ctx.chat?.type !== 'private') return;
  if (config.allowed.size && !config.allowed.has(String(ctx.from.id))) {
    await ctx.reply('Maaf, Anda tidak memiliki akses ke bot ini.');
    return;
  }
  await next();
});
bot.command(['start', 'help'], ctx => ctx.reply(help));
bot.command('model', ctx => ctx.reply(`Model aktif: ${config.model}`));
bot.command('reset', async ctx => {
  sessions.delete(ctx.from.id);
  await ctx.reply('Riwayat dihapus. Silakan mulai percakapan baru.');
});
bot.on('message:text', async ctx => {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return ctx.reply('Perintah tidak dikenal. Gunakan /help.');
  if (!text) return;
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.updatedAt > config.sessionTtl) sessions.delete(id);
  }
  const id = ctx.from.id;
  let session = sessions.get(id);
  if (!session) {
    if (sessions.size >= config.maxSessions) sessions.delete(sessions.keys().next().value);
    session = { messages: [], updatedAt: now };
    sessions.set(id, session);
  }
  await ctx.replyWithChatAction('typing');
  const typing = setInterval(() => { ctx.replyWithChatAction('typing').catch(() => {}); }, 4000);
  try {
    const messages = [
      { role: 'system', content: config.systemPrompt },
      ...(config.historyTurns > 1 ? session.messages.slice(-2 * (config.historyTurns - 1)) : []),
      { role: 'user', content: text },
    ];
    const answer = await complete(config, messages);
    // Jawaban sangat panjang dikirim sebagai file agar tidak membanjiri chat.
    if (answer.length > 24000) {
      await ctx.replyWithDocument(new InputFile(Buffer.from(answer), 'jawaban.txt'));
    } else {
      for (const chunk of splitMessage(answer)) await ctx.reply(chunk);
    }
    session.messages = [...messages.slice(1), { role: 'assistant', content: answer }].slice(-2 * config.historyTurns);
    session.updatedAt = Date.now();
  } catch (error) {
    await ctx.reply(error instanceof AIError ? error.message : 'Pesan gagal diproses. Silakan coba lagi.');
  } finally { clearInterval(typing); }
});
bot.on('message', ctx => ctx.reply('Saat ini saya hanya mendukung pesan teks.'));
// Jangan mencetak objek error Telegram: URL request dapat berisi token bot.
bot.catch(() => console.error('Gagal menangani pembaruan Telegram.'));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { if (bot.isRunning()) bot.stop(); });

try {
  await bot.api.setMyCommands([
    { command: 'start', description: 'Mulai percakapan' },
    { command: 'help', description: 'Panduan penggunaan' },
    { command: 'reset', description: 'Hapus riwayat' },
    { command: 'model', description: 'Lihat model aktif' },
  ]);
  // Long polling diproses berurutan agar konteks percakapan tidak saling menimpa.
  await bot.start({ onStart: () => console.log('Bot KATSU AI aktif (long polling).') });
} catch {
  console.error('Bot gagal berjalan. Periksa token, koneksi jaringan, dan pastikan tidak ada instance/webhook lain.');
  process.exitCode = 1;
}
