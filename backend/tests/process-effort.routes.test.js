const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../db');
const authPath = require.resolve('../routes/auth');
const auditPath = require.resolve('../audit/logger');
const eventsPath = require.resolve('../services/processEvents');

let processFixture;
let capturedAssessmentParams;
let capturedItemsParams;

const query = async (sql, params = []) => {
  if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rowCount: 0, rows: [] };
  if (sql.includes('FROM process_items') && sql.includes('client_can_manage_effort')) {
    return { rowCount: processFixture ? 1 : 0, rows: processFixture ? [processFixture] : [] };
  }
  if (sql.includes('INSERT INTO process_effort_assessments')) {
    capturedAssessmentParams = params;
    return { rowCount: 1, rows: [{ id: 81 }] };
  }
  if (sql.includes('INSERT INTO process_effort_items')) {
    capturedItemsParams = params;
    return { rowCount: 1, rows: [] };
  }
  if (sql.includes('INSERT INTO process_updates')) return { rowCount: 1, rows: [] };
  if (sql.includes('UPDATE process_items')) return { rowCount: 1, rows: [] };
  if (sql.includes('FROM process_effort_assessments assessments')) {
    return {
      rowCount: 1,
      rows: [{
        id: 81,
        processId: 42,
        stage: capturedAssessmentParams[2],
        label: capturedAssessmentParams[3],
        measuredAt: capturedAssessmentParams[4],
        source: capturedAssessmentParams[5],
        status: capturedAssessmentParams[6],
        version: 1,
        items: [{
          id: 91,
          activityName: capturedItemsParams[1],
          roleName: capturedItemsParams[2],
          executionTimeMinutes: capturedItemsParams[3],
          executionsPerPeriod: capturedItemsParams[4],
          periodUnit: capturedItemsParams[5],
          workingDaysPerMonth: capturedItemsParams[6],
          peopleCount: capturedItemsParams[7],
          monthlyHoursPerEmployee: capturedItemsParams[8]
        }]
      }]
    };
  }
  throw new Error(`SQL não previsto no teste: ${sql}`);
};

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: { query, pool: { connect: async () => ({ query, release() {} }) } }
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
  exports: { logAudit: async () => {} }
};
require.cache[eventsPath] = {
  id: eventsPath,
  filename: eventsPath,
  loaded: true,
  exports: { publishProcessEvent: () => {} }
};

const router = require('../routes/process-effort.routes');
const createHandler = router.stack
  .find(layer => layer.route?.path === '/:processId/effort' && layer.route.methods.post)
  .route.stack.at(-1).handle;

const invokeCreate = async (user, body) => {
  let statusCode = 200;
  let responseBody;
  const req = {
    user,
    params: { processId: '42' },
    body,
    ip: '127.0.0.1',
    get: () => 'node-test'
  };
  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { responseBody = payload; return this; }
  };
  await createHandler(req, res);
  return { statusCode, body: responseBody };
};

const validBody = {
  stage: 'baseline',
  label: 'Operação atual',
  measuredAt: '2026-07-28',
  source: 'observed',
  status: 'confirmed',
  items: [{
    activityName: 'Lançar pedidos',
    roleName: 'Assistente',
    executionTimeMinutes: 15,
    executionsPerPeriod: 20,
    periodUnit: 'day',
    peopleCount: 2,
    monthlyHoursPerEmployee: 176
  }]
};

test('client creates a confirmed baseline when effort management is enabled', async () => {
  processFixture = {
    id: 42,
    companyId: 12,
    status: 'in_progress',
    archivedAt: null,
    isClientVisible: true,
    clientCanManageEffort: true
  };
  capturedAssessmentParams = null;
  capturedItemsParams = null;

  const response = await invokeCreate(
    { id: 21, role: 'client', companyId: 12, email: 'cliente@empresa.com' },
    validBody
  );

  assert.equal(response.statusCode, 201);
  assert.equal(capturedAssessmentParams[0], 42);
  assert.equal(capturedAssessmentParams[2], 'baseline');
  assert.equal(capturedItemsParams[1], 'Lançar pedidos');
  assert.equal(response.body.comparison.baseline.workHoursPerMonth, 220);
});

test('client cannot create a measurement when the process policy disables it', async () => {
  processFixture = {
    id: 42,
    companyId: 12,
    status: 'analysis',
    archivedAt: null,
    isClientVisible: true,
    clientCanManageEffort: false
  };
  capturedAssessmentParams = null;

  const response = await invokeCreate(
    { id: 21, role: 'client', companyId: 12, email: 'cliente@empresa.com' },
    validBody
  );

  assert.equal(response.statusCode, 403);
  assert.match(response.body.error, /não está liberado/);
  assert.equal(capturedAssessmentParams, null);
});
