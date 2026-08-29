const test = require('node:test');
const assert = require('node:assert/strict');

let effect = null;
let processCreated = false;

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
    if (sql.includes('INSERT INTO process_items')) {
      processCreated = true;
      return { rows: [{ id: 41, version: 1 }], rowCount: 1 };
    }
    if (sql.includes("UPDATE process_items SET reference_code")) return { rows: [], rowCount: 1 };
    if (sql.includes('SELECT id, reference_code AS "referenceCode"')) {
      return { rows: [{ id: 41, referenceCode: 'LP-000041', title: 'Nova automação', description: 'Integrar o atendimento', status: 'requested', version: 1, createdAt: new Date('2026-08-29T12:00:00Z'), updatedAt: new Date('2026-08-29T12:00:00Z') }], rowCount: 1 };
    }
    if (sql.includes("UPDATE mcp_tool_effects SET status = 'committed'")) {
      effect = { ...effect, status: 'committed', response: JSON.parse(params[0]) };
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`SQL inesperado no teste: ${sql}`);
  },
  release() {},
};

const dbPath = require.resolve('../db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { pool: { connect: async () => client } } };
const { createProcessRequest } = require('../services/processDomainService');

test.beforeEach(() => { effect = null; processCreated = false; });

test('repete a mesma escrita por idempotencyKey sem criar um segundo efeito', async () => {
  const input = { idempotencyKey: 'nexo-effect-123', title: 'Nova automação', description: 'Integrar o atendimento' };
  const first = await createProcessRequest({ companyId: 7, input });
  const replay = await createProcessRequest({ companyId: 7, input });
  assert.equal(first.process.id, 41);
  assert.equal(replay.process.id, 41);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(processCreated, true);
});

test('recusa reutilizar a chave com argumentos diferentes', async () => {
  const base = { idempotencyKey: 'nexo-effect-456', title: 'Nova automação', description: 'Integrar o atendimento' };
  await createProcessRequest({ companyId: 7, input: base });
  await assert.rejects(
    createProcessRequest({ companyId: 7, input: { ...base, title: 'Outro efeito' } }),
    (error) => error.code === 'IDEMPOTENCY_CONFLICT' && error.status === 409,
  );
});
