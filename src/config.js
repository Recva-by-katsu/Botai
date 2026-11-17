export function loadConfig(env = process.env) {
  for (const name of ['TELEGRAM_BOT_TOKEN', 'KATSU_API_KEY']) {
    if (!env[name]?.trim()) throw new Error(`${name} wajib diisi di .env`);
  }
  function integer(name, fallback, min, max) {
    const n = Number(env[name] || fallback);
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
    token: env.TELEGRAM_BOT_TOKEN.trim(), apiKey: env.KATSU_API_KEY.trim(), baseUrl, authHeader,
    model: env.KATSU_MODEL || 'auto', allowed: new Set(allowed),
    systemPrompt: env.SYSTEM_PROMPT || 'Anda adalah asisten yang membantu. Jawab dalam bahasa Indonesia.',
    historyTurns: integer('HISTORY_TURNS', 10, 1, 50),
    maxSessions: integer('MAX_SESSIONS', 500, 1, 10000),
    sessionTtl: integer('SESSION_TTL_MINUTES', 60, 1, 1440) * 60000,
    timeout: integer('API_TIMEOUT_SECONDS', 90, 1, 300) * 1000,
  };
}
