/**
 * Penyimpanan sesi percakapan per pengguna, di memori.
 * Setiap sesi menyimpan riwayat (dibatasi), preferensi model/gaya, dan status proses.
 */
export function createSessionStore({ maxSessions = 500, ttlMs = 3600000, historyTurns = 10, now = Date.now } = {}) {
  const sessions = new Map();
  const cap = Math.max(2, historyTurns * 2);

  function get(id) {
    const session = sessions.get(id);
    if (!session) return undefined;
    if (now() - session.updatedAt > ttlMs) {
      sessions.delete(id);
      return undefined;
    }
    return session;
  }

  function ensure(id) {
    let session = get(id);
    if (session) return session;
    if (sessions.size >= maxSessions) {
      let oldest;
      for (const entry of sessions) {
        if (!oldest || entry[1].updatedAt < oldest[1].updatedAt) oldest = entry;
      }
      if (oldest) sessions.delete(oldest[0]);
    }
    session = { messages: [], updatedAt: now(), model: null, temperature: null, stream: null, busy: false, lastPrompt: null };
    sessions.set(id, session);
    return session;
  }

  function push(session, role, content) {
    session.messages.push({ role, content });
    session.messages = session.messages.slice(-cap);
    session.updatedAt = now();
  }

  function clear(id) {
    sessions.delete(id);
  }

  function pruneExpired() {
    const t = now();
    for (const [id, session] of sessions) {
      if (t - session.updatedAt > ttlMs) sessions.delete(id);
    }
  }

  return { get, ensure, push, clear, pruneExpired, size: () => sessions.size };
}
