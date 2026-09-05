const test = require('node:test');
const assert = require('node:assert/strict');

let effect = null;
let metadataVersion = 3;
let updateParams = null;

const client = {
  async query(sql, params = []) {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK' || sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 0 };
    if (sql.includes('SELECT request_hash, status, response FROM mcp_tool_effects')) {
      return { rows: effect ? [effect] : [], rowCount: effect ? 1 : 0 };
    }
    if (sql.includes('INSERT INTO mcp_tool_effects')) {
      effect = { request_hash: params[3], status: 'processing', response: null };
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('SELECT id, metadata_version FROM integrations')) {
      return { rows: [{ id: 8, metadata_version: metadataVersion }], rowCount: 1 };
    }
    if (sql.includes('UPDATE integrations')) {
      updateParams = params;
      return {
        rows: [{ id: 8, name: params[0], functionName: 'pincbar-carrier', region: 'sa-east-1', lifecycleStatus: params[1], documentationLinks: JSON.parse(params[2]), metadataVersion: metadataVersion + 1, updatedAt: '2026-09-05T10:00:00.000Z' }],
        rowCount: 1,
      };
    }
    if (sql.includes('INSERT INTO audit_logs')) return { rows: [], rowCount: 1 };
    if (sql.includes("UPDATE mcp_tool_effects SET status = 'committed'")) {
      effect = { ...effect, status: 'committed', response: JSON.parse(params[0]) };
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`SQL inesperado no teste: ${sql}`);
  },
  release() {},
};

const dbPath = require.resolve('../db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: { pool: { connect: async () => client }, query: async () => ({ rows: [] }) },
};
const { updateIntegrationMetadata } = require('../services/integrationDomainService');

test.beforeEach(() => { effect = null; metadataVersion = 3; updateParams = null; });

test('atualiza somente metadados seguros com versão e idempotência', async () => {
  const input = {
    idempotencyKey: 'integration-metadata-008',
    integrationId: 8,
    expectedVersion: 3,
    name: 'TikTok Logistics',
    lifecycleStatus: 'active',
    documentationLinks: ['https://example.com/tiktok'],
  };
  const result = await updateIntegrationMetadata({ companyId: 7, input });
  assert.equal(result.integration.metadataVersion, 4);
  assert.deepEqual(updateParams, ['TikTok Logistics', 'active', '["https://example.com/tiktok"]', 8, 7, 3]);
  assert.equal(result.externalReference, 'lambda-pulse:integration:8');

  const replay = await updateIntegrationMetadata({ companyId: 7, input });
  assert.equal(replay.idempotentReplay, true);
});

test('recusa sobrescrever metadados quando a versão esperada está desatualizada', async () => {
  await assert.rejects(
    updateIntegrationMetadata({
      companyId: 7,
      input: { idempotencyKey: 'integration-metadata-conflict', integrationId: 8, expectedVersion: 2, name: 'Nome antigo' },
    }),
    (error) => error.code === 'VERSION_CONFLICT' && error.status === 409,
  );
  assert.equal(updateParams, null);
});
