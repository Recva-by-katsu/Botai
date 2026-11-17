export const DEFAULT_SYSTEM_PROMPT =
  'Anda adalah KATSU AI, asisten pribadi yang cerdas, ramah, dan efisien di Telegram. ' +
  'Jawab sesuai bahasa pengguna (bawaan: Indonesia). Gunakan Markdown agar jawaban mudah dibaca: ' +
  '**teks tebal** untuk poin penting, daftar untuk langkah, dan blok kode dengan nama bahasa untuk kode. ' +
  'Jawab langsung ke inti tanpa basa-basi panjang. Jika pertanyaan kurang jelas, ajukan satu klarifikasi singkat.';

const BOOL_TRUE = new Set(['1', 'true', 'yes', 'on', 'ya', 'aktif']);
const BOOL_FALSE = new Set(['0', 'false', 'no', 'off', 'tidak', 'mati']);

export function loadConfig(env = process.env) {
  for (const name of ['TELEGRAM_BOT_TOKEN', 'KATSU_API_KEY']) {
    if (!env[name]?.trim()) throw new Error(`${name} wajib diisi di .env`);
  }
  function integer(name, fallback, min, max) {
    const n = Number(env[name] ?? fallback);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} harus bilangan bulat ${min}–${max}`);
    return n;
  }
  function float(name, fallback, min, max) {
    if (env[name] === undefined || env[name] === '') return fallback;
    const n = Number(env[name]);
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${name} harus angka ${min}–${max}`);
    return n;
  }
  function bool(name, fallback) {
    if (env[name] === undefined || env[name] === '') return fallback;
    const v = String(env[name]).trim().toLowerCase();
    if (BOOL_TRUE.has(v)) return true;
    if (BOOL_FALSE.has(v)) return false;
    throw new Error(`${name} harus bernilai true atau false`);
  }
  function optionalInt(name, min, max) {
    if (!env[name]?.trim()) return null;
    const n = Number(env[name]);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} harus bilangan bulat ${min}–${max}`);
    return n;
  }

  const baseUrl = (env.KATSU_BASE_URL || 'https://ai.katsuvip.eu.cc').replace(/\/+$/, '');
  if (new URL(baseUrl).protocol !== 'https:') throw new Error('KATSU_BASE_URL harus HTTPS');

  const allowed = (env.ALLOWED_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.some(id => !/^\d+$/.test(id))) throw new Error('ALLOWED_USER_IDS harus ID angka dipisahkan koma');

  const authHeader = env.KATSU_AUTH_HEADER || 'Authorization';
  if (!['Authorization', 'X-API-Key'].includes(authHeader)) throw new Error('KATSU_AUTH_HEADER harus Authorization atau X-API-Key');

  return {
    token: env.TELEGRAM_BOT_TOKEN.trim(),
    apiKey: env.KATSU_API_KEY.trim(),
    baseUrl,
    authHeader,
    model: env.KATSU_MODEL?.trim() || 'auto',
    allowed: new Set(allowed),
    systemPrompt: env.SYSTEM_PROMPT?.trim() || DEFAULT_SYSTEM_PROMPT,
    historyTurns: integer('HISTORY_TURNS', 10, 1, 50),
    maxSessions: integer('MAX_SESSIONS', 500, 1, 10000),
    sessionTtl: integer('SESSION_TTL_MINUTES', 60, 1, 1440) * 60000,
    timeout: integer('API_TIMEOUT_SECONDS', 90, 1, 300) * 1000,
    temperature: float('TEMPERATURE', 0.7, 0, 2),
    maxTokens: optionalInt('MAX_TOKENS', 16, 1000000),
    streamEnabled: bool('STREAM_ENABLED', true),
    editIntervalMs: integer('EDIT_INTERVAL_MS', 2500, 500, 10000),
    rateLimit: {
      requests: integer('RATE_LIMIT_REQUESTS', 20, 1, 1000),
      windowMs: integer('RATE_LIMIT_WINDOW_SECONDS', 60, 5, 3600) * 1000,
    },
    maxQuestion: integer('MAX_QUESTION_LENGTH', 4000, 10, 8000),
  };
}
