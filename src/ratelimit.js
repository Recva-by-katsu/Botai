/**
 * Pembatas laju jendela geser per pengguna (telegram id).
 * Menjaga bot dari spam dan menjaga kuota API tetap adil.
 */
export function createRateLimiter({ limit = 20, windowMs = 60000, now = Date.now } = {}) {
  const hits = new Map();

  function timestamps(id, t) {
    const fresh = (hits.get(id) || []).filter(ts => ts > t - windowMs);
    hits.set(id, fresh);
    return fresh;
  }

  return {
    // Konsumsi satu kuota; panggil hanya ketika permintaan benar-benar diproses.
    check(id) {
      const t = now();
      const fresh = timestamps(id, t);
      if (fresh.length >= limit) {
        return { ok: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((fresh[0] + windowMs - t) / 1000)) };
      }
      fresh.push(t);
      return { ok: true, remaining: limit - fresh.length, retryAfterSeconds: 0 };
    },
    // Lihat sisa kuota tanpa mengonsumsinya (untuk /status).
    peek(id) {
      return Math.max(0, limit - timestamps(id, now()).length);
    },
  };
}
