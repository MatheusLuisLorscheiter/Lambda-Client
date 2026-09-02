const test = require('node:test');
const assert = require('node:assert/strict');

const queries = [];
const dbPath = require.resolve('../db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: async (sql, params) => { queries.push({ sql, params }); return { rows: [] }; }, pool: {} } };
const { assertSafeUrl, enqueueGenericWebhookEvent, getWebhookDeliveryStatus, signWebhookBody, validateSigningSecret } = require('../services/genericWebhookPublisher');

test('bloqueia destinos locais e redes privadas para evitar SSRF', async () => {
  await assert.rejects(assertSafeUrl('https://127.0.0.1/webhook'), /rede privada|reservada/i);
  await assert.rejects(assertSafeUrl('https://192.168.1.10/webhook'), /rede privada|reservada/i);
  await assert.rejects(assertSafeUrl('https://[::1]/webhook'), /rede privada|reservada/i);
});

test('aceita o segredo emitido pelo CloudWhats e produz a assinatura esperada pelo Nexo', () => {
  const secret = `wcp_whsec_${'a'.repeat(42)}`;
  const timestamp = '2026-09-01T17:00:00.000Z';
  const body = JSON.stringify({ id: 'evt-1', type: 'integration.failed' });
  const expected = `v1=${require('crypto').createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;

  assert.equal(validateSigningSecret(secret), secret);
  assert.equal(signWebhookBody(secret, timestamp, body), expected);
});

test('rejeita segredo curto, com espaços ou caracteres de controle', () => {
  assert.throws(() => validateSigningSecret('curto'), /32 e 256/);
  assert.throws(() => validateSigningSecret(` ${'a'.repeat(40)}`), /sem espaços/);
  assert.throws(() => validateSigningSecret(`${'a'.repeat(40)}\n`), /sem espaços/);
});

test('o teste do endpoint ignora somente o filtro de tipos e preserva a deduplicação', async () => {
  queries.length = 0;
  await enqueueGenericWebhookEvent({
    companyId: 7,
    endpointId: 11,
    type: 'webhook.test',
    subject: { type: 'webhook-endpoint', id: '11' },
    eventId: 'evt-test-1',
    bypassEventTypeFilter: true,
  });

  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /ON CONFLICT \(endpoint_id, event_id\) DO NOTHING/);
  assert.equal(queries[0].params[4], 11);
  assert.equal(queries[0].params[5], true);
});

test('consulta o resultado da entrega pelo mesmo tenant, endpoint e evento', async () => {
  queries.length = 0;
  assert.equal(await getWebhookDeliveryStatus(7, 11, 'evt-test-1'), null);
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /endpoint\.company_id = \$1/);
  assert.deepEqual(queries[0].params, [7, 11, 'evt-test-1']);
});
