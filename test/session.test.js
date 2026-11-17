import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStore } from '../src/session.js';
import { createRateLimiter } from '../src/ratelimit.js';

test('sesi: push dibatasi riwayat dan ttl', () => {
  let time = 0;
  const store = createSessionStore({ maxSessions: 10, ttlMs: 1000, historyTurns: 2, now: () => time });
  const session = store.ensure('u1');
  store.push(session, 'user', 'a');
  time = 100;
  store.push(session, 'assistant', 'b');
  store.push(session, 'user', 'c');
  store.push(session, 'assistant', 'd');
  assert.equal(session.messages.length, 4);
  store.push(session, 'user', 'e');
  assert.deepEqual(session.messages.map(m => m.content), ['b', 'c', 'd', 'e']);
  assert.equal(store.get('u1'), session);
  time = 2000;
  assert.equal(store.get('u1'), undefined);
});

test('sesi: eviksi sesi tertua saat penuh', () => {
  let time = 0;
  const store = createSessionStore({ maxSessions: 2, ttlMs: 60000, historyTurns: 2, now: () => time });
  store.ensure('a').updatedAt = 1;
  time = 2;
  store.ensure('b');
  time = 3;
  store.ensure('c');
  assert.ok(!store.get('a'));
  assert.ok(store.get('b'));
  assert.ok(store.get('c'));
  assert.equal(store.size(), 2);
});

test('sesi: clear dan pruneExpired', () => {
  let time = 0;
  const store = createSessionStore({ maxSessions: 5, ttlMs: 100, historyTurns: 2, now: () => time });
  store.ensure('a'); // updatedAt = 0
  time = 50;
  store.ensure('b'); // updatedAt = 50
  time = 149; // a: 149 > 100 kedaluwarsa; b: 99 < 100 masih hidup
  store.pruneExpired();
  assert.ok(!store.get('a'));
  assert.ok(store.get('b'));
  store.clear('b');
  assert.equal(store.size(), 0);
});

test('pembatas laju: jendela geser dan sisa kuota', () => {
  let time = 0;
  const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now: () => time });
  assert.ok(limiter.check('u').ok);
  assert.ok(limiter.check('u').ok);
  assert.ok(limiter.check('u').ok);
  const blocked = limiter.check('u');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryAfterSeconds, 1);
  assert.equal(limiter.peek('u'), 0);
  time = 500;
  assert.equal(limiter.peek('u'), 0);
  time = 1001;
  assert.equal(limiter.peek('u'), 3);
  assert.ok(limiter.check('u').ok);
});

test('pembatas laju: pengguna berbeda tidak saling memengaruhi', () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
  assert.ok(limiter.check('a').ok);
  assert.ok(!limiter.check('a').ok);
  assert.ok(limiter.check('b').ok);
});
