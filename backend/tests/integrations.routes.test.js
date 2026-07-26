const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../db');
const authPath = require.resolve('../routes/auth');
const auditPath = require.resolve('../audit/logger');
const cryptoPath = require.resolve('../security/crypto');
const servicesPath = require.resolve('../services/integrations');

const linkedIds = [];
let createdProcessParams = null;
let auditPayload = null;

const client = {
  async query(sql, params = []) {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
      return { rowCount: 0, rows: [] };
    }
    if (sql.includes('INSERT INTO integrations')) {
      return {
        rowCount: 1,
        rows: [{
          id: 9,
          name: params[1],
          functionName: params[2],
          region: params[3],
          memoryMb: params[4],
          showCostEstimate: params[5],
          documentationLinks: JSON.parse(params[6]),
          companyId: params[0],
          userId: params[9],
          clientId: null
        }]
      };
    }
    if (sql.includes('SELECT id FROM process_items WHERE company_id')) {
      return { rowCount: params[1].length, rows: params[1].map(id => ({ id })) };
    }
    if (sql.includes('INSERT INTO process_items')) {
      createdProcessParams = params;
      return { rowCount: 1, rows: [{ id: 6 }] };
    }
    if (sql.includes('INSERT INTO process_updates')) {
      return { rowCount: 1, rows: [] };
    }
    if (sql.includes('DELETE FROM process_integrations')) {
      linkedIds.length = 0;
      return { rowCount: 0, rows: [] };
    }
    if (sql.includes('INSERT INTO process_integrations')) {
      linkedIds.push(params[0]);
      return { rowCount: 1, rows: [] };
    }
    if (sql.includes('FROM process_integrations') && sql.includes('ORDER BY process_items.updated_at')) {
      return {
        rowCount: linkedIds.length,
        rows: linkedIds.map(id => ({
          id,
          title: id === 6 ? 'Implantação da integração' : 'Processo existente',
          status: id === 6 ? 'delivered' : 'queued'
        }))
      };
    }
    throw new Error(`SQL transacional não previsto: ${sql}`);
  },
  release() {}
};

const query = async (sql, params = []) => {
  if (sql.includes('SELECT id FROM companies')) {
    return { rowCount: 1, rows: [{ id: params[0] }] };
  }
  if (sql.includes('SELECT name FROM companies')) {
    return { rowCount: 1, rows: [{ name: 'Empresa teste' }] };
  }
  throw new Error(`SQL não previsto: ${sql}`);
};

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: { query, pool: { connect: async () => client } }
};
require.cache[authPath] = {
  id: authPath,
  filename: authPath,
  loaded: true,
  exports: { authenticateToken: (_req, _res, next) => next() }
};
require.cache[auditPath] = {
  id: auditPath,
  filename: auditPath,
  loaded: true,
  exports: { logAudit: async payload => { auditPayload = payload; } }
};
require.cache[cryptoPath] = {
  id: cryptoPath,
  filename: cryptoPath,
  loaded: true,
  exports: { encrypt: value => `encrypted:${value}` }
};
require.cache[servicesPath] = {
  id: servicesPath,
  filename: servicesPath,
  loaded: true,
  exports: {
    getIntegrationForUser: async () => null,
    normalizeDocumentationLinks: input => input || []
  }
};

const router = require('../routes/integrations.routes');
const postHandler = router.stack
  .find(layer => layer.route?.path === '/integrations' && layer.route.methods.post)
  .route.stack.at(-1).handle;

test('integration can link an existing process and create another atomically', async () => {
  linkedIds.length = 0;
  createdProcessParams = null;
  auditPayload = null;

  let responseBody;
  let statusCode = 200;
  const req = {
    user: { id: 7, role: 'admin', companyId: null },
    body: {
      companyId: 12,
      name: 'Pedidos Omie',
      functionName: 'pedidos-omie-prod',
      region: 'sa-east-1',
      accessKeyId: 'access',
      secretAccessKey: 'secret',
      memoryMb: 256,
      showCostEstimate: true,
      documentationLinks: ['https://docs.example.com'],
      processIds: [5],
      createProcess: {
        enabled: true,
        title: 'Implantação da integração',
        description: 'Entrega da sincronização de pedidos.',
        status: 'delivered'
      }
    },
    ip: '127.0.0.1',
    get: () => 'node-test'
  };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      responseBody = payload;
      return this;
    }
  };

  await postHandler(req, res);

  assert.equal(statusCode, 200);
  assert.deepEqual(linkedIds, [5, 6]);
  assert.equal(createdProcessParams[4], 'delivered');
  assert.equal(createdProcessParams[5], 100);
  assert.ok(createdProcessParams[7] instanceof Date);
  assert.deepEqual(responseBody.integration.processes.map(process => process.id), [5, 6]);
  assert.equal(auditPayload.companyId, 12);
  assert.deepEqual(auditPayload.metadata.linkedProcessIds, [5, 6]);
  assert.equal(auditPayload.metadata.processCreatedFromIntegration, true);
});
