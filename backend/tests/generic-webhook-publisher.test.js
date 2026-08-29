const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: async () => ({ rows: [] }), pool: {} } };
const { assertSafeUrl } = require('../services/genericWebhookPublisher');

test('bloqueia destinos locais e redes privadas para evitar SSRF', async () => {
  await assert.rejects(assertSafeUrl('https://127.0.0.1/webhook'), /rede privada|reservada/i);
  await assert.rejects(assertSafeUrl('https://192.168.1.10/webhook'), /rede privada|reservada/i);
  await assert.rejects(assertSafeUrl('https://[::1]/webhook'), /rede privada|reservada/i);
});
