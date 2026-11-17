import { escapeHtml } from './markdown.js';

export const APP = { name: 'KATSU AI', version: '2.0.0' };

export const TEMP_PRESETS = [
  { value: 0.3, label: '🎯 Fokus' },
  { value: 0.7, label: '⚖️ Seimbang' },
  { value: 1.0, label: '🎨 Kreatif' },
];

export function tempLabel(value) {
  return TEMP_PRESETS.find(p => p.value === value)?.label ?? `🎛️ ${value}`;
}

export function welcome(name, model) {
  return [
    `✨ <b>${APP.name}</b> — asisten pintar di Telegram`,
    '',
    `Halo <b>${escapeHtml(name)}</b>! 👋`,
    'Tanya apa saja: ide, rangkuman, coding, terjemahan, matematika, dan lainnya.',
    'Jawaban saya rapi — teks tebal, daftar, dan blok kode berwarna.',
    '',
    `🧠 Model aktif: <code>${escapeHtml(model)}</code>`,
    '',
    '<b>Perintah cepat</b>',
    '• /new — mulai percakapan baru',
    '• /model — ganti model AI',
    '• /settings — gaya jawaban &amp; streaming',
    '• /help — panduan lengkap',
    '',
    'Kirim pertanyaan pertamamu sekarang 👇',
  ].join('\n');
}

export const helpText = [
  `❓ <b>Panduan — ${APP.name}</b>`,
  '',
  '<b>🎯 Cara pakai</b>',
  'Kirim pertanyaan sebagai pesan teks. Jawaban panjang otomatis dipecah menjadi beberapa pesan tanpa memotong blok kode.',
  '',
  '<b>📋 Perintah</b>',
  '• /start — kartu sambutan',
  '• /help — panduan ini',
  '• /new — percakapan baru (hapus konteks)',
  '• /model — pilih model AI',
  '• /settings — gaya jawaban &amp; streaming',
  '• /status — status sesi Anda',
  '',
  '<b>✨ Tips</b>',
  '• Balas (reply) jawaban saya untuk menanyakan lanjutan dengan konteks.',
  '• Format didukung: **tebal**, _miring_, ~~coret~~, `kode`, ```blok kode```, dan [tautan](https://…).',
  '• ♻️ <b>Ulangi</b> menyusun ulang jawaban terakhir.',
  '• 🗑️ menghapus pesan dari chat.',
  '',
  '<b>🔒 Privasi</b>',
  'Pesan dikirim ke server KATSU AI untuk diproses. Riwayat hanya tersimpan sementara di memori bot dan hilang saat bot berhenti atau sesi kedaluwarsa.',
].join('\n');

export const newChatNotice = [
  '💬 <b>Chat baru dimulai</b>',
  '',
  'Konteks sebelumnya sudah dihapus. Silakan kirim pertanyaan pertamamu 👇',
].join('\n');

export const onlyTextNotice = '📎 Saat ini saya hanya bisa membaca pesan teks. Kirim pertanyaan sebagai teks ya! 🙏';

export const busyNotice = '⏳ Sabar ya, saya masih memproses pertanyaan sebelumnya. 🙏';

export const thinking = '🧠 <i>Sedang berpikir…</i>';

export function unknownCommand(command) {
  return `🤔 Perintah <code>${escapeHtml(command.slice(0, 30))}</code> tidak dikenal. Ketik /help untuk panduan.`;
}

export function tooLong(limit) {
  return `📏 Pertanyaan terlalu panjang (maksimal ${limit} karakter). Pecah menjadi beberapa pesan ya.`;
}

export function rateLimitNotice(seconds) {
  return `⏳ <b>Terlalu banyak permintaan</b>\n\nTunggu <b>${seconds} detik</b> lagi, lalu kirim pertanyaanmu.`;
}

export function errorCard(reason) {
  return [
    '⚠️ <b>Ups, ada kendala</b>',
    '',
    escapeHtml(reason),
    '',
    'Tekan ♻️ <b>Coba Lagi</b>, atau mulai /new.',
  ].join('\n');
}

export function statusText({ model, temperature, stream, history, historyMax, remaining, limit }) {
  return [
    '📊 <b>Status sesi</b>',
    '',
    `🧠 Model: <code>${escapeHtml(model)}</code>`,
    `🎛️ Gaya jawaban: ${tempLabel(temperature)} (<code>${temperature}</code>)`,
    `⚡ Streaming: ${stream ? 'Aktif' : 'Mati'}`,
    `💬 Konteks: ${history} pesan (maks ${historyMax})`,
    `🚦 Kuota menit ini: ${remaining}/${limit} permintaan tersisa`,
  ].join('\n');
}

const btn = (text, callback_data) => ({ text, callback_data });

export const mainMenuKeyboard = () => [[
  btn('💬 Chat Baru', 'new'), btn('🧠 Model', 'models'),
], [
  btn('⚙️ Pengaturan', 'settings'), btn('❓ Bantuan', 'help'),
]];

export const answerActionsKeyboard = () => [[
  btn('💬 Chat Baru', 'new'), btn('♻️ Ulangi', 'retry'), btn('🗑️', 'del'),
]];

export const errorActionsKeyboard = () => [[
  btn('♻️ Coba Lagi', 'retry'), btn('💬 Chat Baru', 'new'),
]];

export const closeKeyboard = () => [[btn('❌ Tutup', 'close')]];

export function modelText(current, page, pages) {
  return [
    '🧠 <b>Pilih Model AI</b>',
    '',
    `Aktif: <code>${escapeHtml(current)}</code>`,
    pages > 1 ? `Halaman ${page + 1}/${pages}` : '',
  ].filter(Boolean).join('\n');
}

export function modelKeyboard(models, current, page, pages) {
  const rows = [];
  for (let i = 0; i < models.length; i += 2) {
    rows.push(models.slice(i, i + 2).map(id => btn(
      `${id === current ? '✅ ' : ''}${id.length > 20 ? `${id.slice(0, 19)}…` : id}`,
      `ms:${page}:${id}`,
    )));
  }
  if (pages > 1) {
    const nav = [];
    if (page > 0) nav.push(btn('◀️', `mp:${page - 1}`));
    nav.push(btn(`${page + 1}/${pages}`, 'noop'));
    if (page < pages - 1) nav.push(btn('▶️', `mp:${page + 1}`));
    rows.push(nav);
  }
  rows.push([btn('❌ Tutup', 'close')]);
  return rows;
}

export function settingsText(temperature, stream) {
  return [
    '⚙️ <b>Pengaturan</b>',
    '',
    `🎛️ <b>Gaya jawaban</b> — saat ini ${tempLabel(temperature)} (<code>${temperature}</code>)`,
    `⚡ <b>Streaming</b> — ${stream ? 'Aktif: jawaban muncul bertahap, seperti ChatGPT' : 'Mati: jawaban muncul sekaligus'}`,
    '',
    'Pengaturan hanya berlaku untuk sesi ini dan hilang saat sesi kedaluwarsa.',
  ].join('\n');
}

export function settingsKeyboard(temperature, stream) {
  return [[
    ...TEMP_PRESETS.map(p => btn(`${p.value === temperature ? '✅ ' : ''}${p.label}`, `st:temp:${p.value}`)),
  ], [
    btn(stream ? '⚡ Streaming: Aktif' : '🔌 Streaming: Mati', 'st:stream'),
  ], [
    btn('❌ Tutup', 'close'),
  ]];
}
