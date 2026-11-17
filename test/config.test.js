import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, DEFAULT_SYSTEM_PROMPT } from '../src/config.js';

const env = { TELEGRAM_BOT_TOKEN: 'test-token', KATSU_API_KEY: 'test-key' };

test('konfigurasi bawaan', () => {
  const config = loadConfig(env);
  assert.equal(config.model, 'auto');
  assert.equal(config.temperature, 0.7);
  assert.equal(config.streamEnabled, true);
  assert.equal(config.maxTokens, null);
  assert.equal(config.rateLimit.requests, 20);
  assert.equal(config.rateLimit.windowMs, 60000);
  assert.equal(config.maxQuestion, 4000);
  assert.equal(config.editIntervalMs, 2500);
  assert.equal(config.systemPrompt, DEFAULT_SYSTEM_PROMPT);
  assert.equal(config.sessionTtl, 60 * 60000);
});

test('kunci wajib dan validasi', () => {
  assert.throws(() => loadConfig({}), /wajib/);
  assert.throws(() => loadConfig({ ...env, TEMPERATURE: '3' }), /TEMPERATURE/);
  assert.throws(() => loadConfig({ ...env, STREAM_ENABLED: 'mungkin' }), /STREAM_ENABLED/);
  assert.throws(() => loadConfig({ ...env, MAX_TOKENS: '10' }), /MAX_TOKENS/);
  assert.throws(() => loadConfig({ ...env, HISTORY_TURNS: '0' }), /bilangan/);
  assert.throws(() => loadConfig({ ...env, ALLOWED_USER_IDS: 'abc' }), /ID angka/);
  assert.throws(() => loadConfig({ ...env, KATSU_BASE_URL: 'http://example.com' }), /HTTPS/);
  assert.throws(() => loadConfig({ ...env, KATSU_AUTH_HEADER: 'X-Api' }), /KATSU_AUTH_HEADER/);
});

test('kunci opsional diterima', () => {
  const config = loadConfig({
    ...env,
    TEMPERATURE: '0.3',
    MAX_TOKENS: '2048',
    STREAM_ENABLED: 'off',
    RATE_LIMIT_REQUESTS: '5',
    RATE_LIMIT_WINDOW_SECONDS: '30',
    ALLOWED_USER_IDS: '123, 456',
  });
  assert.equal(config.temperature, 0.3);
  assert.equal(config.maxTokens, 2048);
  assert.equal(config.streamEnabled, false);
  assert.equal(config.rateLimit.requests, 5);
  assert.equal(config.rateLimit.windowMs, 30000);
  assert.equal(config.allowed.size, 2);
});
