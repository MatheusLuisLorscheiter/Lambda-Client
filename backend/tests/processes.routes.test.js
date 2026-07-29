const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../db');
const authPath = require.resolve('../routes/auth');
const auditPath = require.resolve('../audit/logger');

let capturedInsertParams = null;
let capturedUpdateSql = null;
let capturedUpdateParams = null;
let capturedEffortAssessmentParams = null;
let capturedEffortItemsParams = null;
let currentItem = null;

const query = async (sql, params = []) => {
  if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
    return { rowCount: 0, rows: [] };
  }
  if (sql.includes('SELECT id FROM companies')) {
    return { rowCount: 1, rows: [{ id: params[0] }] };
  }
  if (sql.includes('COALESCE(MAX(position)')) {
    return { rowCount: 1, rows: [{ position: 3 }] };
  }
  if (sql.includes('INSERT INTO process_items')) {
    capturedInsertParams = params;
    currentItem = {
      id: 42,
      companyId: params[0],
      companyName: 'Empresa teste',
      requestedBy: params[1],
      requestedByEmail: null,
      title: params[2],
      description: params[3],
      category: params[4],
      status: params[5],
      priority: params[6],
      position: params[7],
      complexity: params[8],
      progress: params[9],
      estimateBusinessDays: params[10],
      plannedStart: params[11],
      dueDate: params[12],
      deliveredAt: params[13],
      latestUpdate: params[14],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      integrations: [],
      updates: []
    };
    return { rowCount: 1, rows: [{ id: 42 }] };
  }
  if (sql.includes('INSERT INTO process_effort_assessments')) {
    capturedEffortAssessmentParams = params;
    return { rowCount: 1, rows: [{ id: 81 }] };
  }
  if (sql.includes('INSERT INTO process_effort_items')) {
    capturedEffortItemsParams = params;
    return { rowCount: 1, rows: [] };
  }
  if (sql.includes('INSERT INTO process_updates')) {
    currentItem.updates = [{ id: 1, message: params[2], createdAt: new Date().toISOString() }];
    return { rowCount: 1, rows: [] };
  }
  if (sql.startsWith('UPDATE process_items')) {
    capturedUpdateSql = sql;
    capturedUpdateParams = params;
    return { rowCount: 1, rows: [] };
  }
  if (sql.includes('WHERE process_items.id = $1')) {
    return { rowCount: 1, rows: [currentItem] };
  }
  throw new Error(`SQL não previsto no teste: ${sql}`);
};

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    query,
    pool: {
      connect: async () => ({ query, release() {} })
    }
  }
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

const router = require('../routes/processes');
const postHandler = router.stack
  .find(layer => layer.route?.path === '/' && layer.route.methods.post)
  .route.stack.at(-1).handle;
const patchHandler = router.stack
  .find(layer => layer.route?.path === '/:processId' && layer.route.methods.patch)
  .route.stack.at(-1).handle;

const invokePost = async (user, body) => {
  let responseBody;
  let statusCode = 200;
  const req = {
    user,
    body,
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
  return { statusCode, body: responseBody };
};

const invokePatch = async (processId, body, user = { id: 7, role: 'admin', companyId: null }) => {
  let responseBody;
  let statusCode = 200;
  const req = {
    user,
    params: { processId: String(processId) },
    body,
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
  await patchHandler(req, res);
  return { statusCode, body: responseBody };
};

test('admin creation persists queue planning fields', async () => {
  capturedInsertParams = null;
  const response = await invokePost(
    { id: 7, role: 'admin', companyId: null },
    {
      companyId: 12,
      title: 'Integração Omie e CRM',
      description: 'Sincronizar pedidos aprovados.',
      category: 'integration',
      status: 'queued',
      priority: 'high',
      complexity: 'medium',
      progress: 35,
      estimateBusinessDays: 8,
      plannedStart: '2026-08-03',
      dueDate: '2026-08-13',
      latestUpdate: 'Viabilidade aprovada.'
    }
  );

  assert.equal(response.statusCode, 201);
  assert.equal(capturedInsertParams[0], 12);
  assert.equal(capturedInsertParams[5], 'queued');
  assert.equal(capturedInsertParams[6], 'high');
  assert.equal(capturedInsertParams[7], 3);
  assert.equal(capturedInsertParams[8], 'medium');
  assert.equal(capturedInsertParams[9], 35);
  assert.equal(capturedInsertParams[10], 8);
  assert.equal(capturedInsertParams[11], '2026-08-03');
  assert.equal(capturedInsertParams[12], '2026-08-13');
  assert.equal(response.body.process.updates[0].message, 'Viabilidade aprovada.');
});

test('client creation cannot override workflow status or priority', async () => {
  capturedInsertParams = null;
  const response = await invokePost(
    { id: 21, role: 'client', companyId: 12 },
    {
      title: 'Nova automação',
      description: 'Automatizar a conferência diária.',
      category: 'automation',
      status: 'delivered',
      priority: 'urgent',
      progress: 100,
      position: 1
    }
  );

  assert.equal(response.statusCode, 201);
  assert.equal(capturedInsertParams[0], 12);
  assert.equal(capturedInsertParams[1], 21);
  assert.equal(capturedInsertParams[5], 'requested');
  assert.equal(capturedInsertParams[6], 'normal');
  assert.equal(capturedInsertParams[7], null);
  assert.equal(capturedInsertParams[9], 0);
});

test('client can include an optional effort baseline in the same process transaction', async () => {
  capturedEffortAssessmentParams = null;
  capturedEffortItemsParams = null;

  const response = await invokePost(
    { id: 21, role: 'client', companyId: 12 },
    {
      title: 'Automatizar conferência',
      description: 'A equipe confere cada pedido manualmente.',
      category: 'automation',
      effort: {
        label: 'Conferência atual',
        measuredAt: '2026-07-28',
        source: 'estimated',
        items: [{
          activityName: 'Conferir pedido',
          executionTimeMinutes: 15,
          executionsPerPeriod: 20,
          periodUnit: 'day',
          peopleCount: 2,
          monthlyHoursPerEmployee: 176
        }]
      }
    }
  );

  assert.equal(response.statusCode, 201);
  assert.equal(capturedEffortAssessmentParams[0], 42);
  assert.equal(capturedEffortAssessmentParams[2], 'baseline');
  assert.equal(capturedEffortAssessmentParams[6], 'draft');
  assert.equal(capturedEffortItemsParams[1], 'Conferir pedido');
  assert.equal(capturedEffortItemsParams[3], 15);
  assert.equal(capturedEffortItemsParams[4], 20);
  assert.equal(capturedEffortItemsParams[7], 2);
});

test('invalid optional effort is rejected before the process is created', async () => {
  capturedInsertParams = null;
  capturedEffortAssessmentParams = null;

  const response = await invokePost(
    { id: 21, role: 'client', companyId: 12 },
    {
      title: 'Automatizar conferência',
      description: 'A equipe confere cada pedido manualmente.',
      effort: {
        items: [{
          activityName: 'Conferir pedido',
          executionTimeMinutes: 0,
          executionsPerPeriod: 20,
          periodUnit: 'day',
          peopleCount: 2
        }]
      }
    }
  );

  assert.equal(response.statusCode, 400);
  assert.match(response.body.error, /Tempo de execução/);
  assert.equal(capturedInsertParams, null);
  assert.equal(capturedEffortAssessmentParams, null);
});

test('creation rejects a delivery date before the planned start', async () => {
  capturedInsertParams = null;
  const response = await invokePost(
    { id: 7, role: 'admin', companyId: null },
    {
      companyId: 12,
      title: 'Janela inválida',
      description: 'A previsão não pode terminar antes do início.',
      plannedStart: '2026-08-13',
      dueDate: '2026-08-03'
    }
  );

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error, 'A previsão de entrega não pode ser anterior ao início planejado');
  assert.equal(capturedInsertParams, null);
});

test('updating planning dates persists date-only values', async () => {
  currentItem = {
    id: 42,
    companyId: 12,
    status: 'analysis',
    position: null,
    progress: 0,
    plannedStart: null,
    dueDate: null,
    deliveredAt: null,
    latestUpdate: null
  };
  capturedUpdateSql = null;
  capturedUpdateParams = null;

  const response = await invokePatch(42, {
    plannedStart: '2026-09-01',
    dueDate: '2026-09-15'
  });

  assert.equal(response.statusCode, 200);
  assert.match(capturedUpdateSql, /planned_start =/);
  assert.match(capturedUpdateSql, /due_date =/);
  assert.ok(capturedUpdateParams.includes('2026-09-01'));
  assert.ok(capturedUpdateParams.includes('2026-09-15'));
});

test('updating one planning date validates it against the saved date', async () => {
  currentItem = {
    id: 42,
    companyId: 12,
    status: 'analysis',
    position: null,
    progress: 0,
    plannedStart: '2026-09-01',
    dueDate: '2026-09-15',
    deliveredAt: null,
    latestUpdate: null
  };
  capturedUpdateSql = null;
  capturedUpdateParams = null;

  const response = await invokePatch(42, { plannedStart: '2026-09-20' });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error, 'A previsão de entrega não pode ser anterior ao início planejado');
  assert.equal(capturedUpdateSql, null);
});

test('entering the queue without a manual position assigns the next position', async () => {
  currentItem = {
    id: 42,
    companyId: 12,
    status: 'analysis',
    position: null,
    progress: 0,
    plannedStart: null,
    dueDate: null,
    deliveredAt: null,
    latestUpdate: null
  };
  capturedUpdateSql = null;
  capturedUpdateParams = null;

  const response = await invokePatch(42, { status: 'queued', position: null });

  assert.equal(response.statusCode, 200);
  assert.match(capturedUpdateSql, /position =/);
  assert.ok(capturedUpdateParams.includes(3));
});

test('marking a process as delivered forces 100% progress and stores an update', async () => {
  currentItem = {
    id: 42,
    companyId: 12,
    companyName: 'Empresa teste',
    requestedBy: null,
    requestedByEmail: null,
    title: 'Integração Omie e CRM',
    description: 'Sincronizar pedidos aprovados.',
    category: 'integration',
    status: 'validation',
    priority: 'high',
    position: null,
    complexity: 'medium',
    progress: 80,
    estimateBusinessDays: 8,
    plannedStart: '2026-08-03',
    dueDate: '2026-08-13',
    deliveredAt: null,
    latestUpdate: 'Em validação.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    integrations: [],
    updates: []
  };
  capturedUpdateSql = null;
  capturedUpdateParams = null;

  const response = await invokePatch(42, {
    status: 'delivered',
    progress: 40,
    latestUpdate: 'Entrega validada.'
  });

  assert.equal(response.statusCode, 200);
  assert.match(capturedUpdateSql, /progress =/);
  assert.ok(capturedUpdateParams.includes(100));
  assert.ok(!capturedUpdateParams.includes(40));
  assert.equal(currentItem.updates[0].message, 'Entrega validada.');
});

test('client can update only request fields released by the administrator', async () => {
  currentItem = {
    id: 42,
    companyId: 12,
    companyName: 'Empresa teste',
    title: 'Integração Omie e CRM',
    description: 'Contexto inicial.',
    objective: null,
    status: 'analysis',
    version: 3,
    isClientVisible: true,
    archivedAt: null,
    clientEditableFields: ['description', 'objective'],
    integrations: [],
    updates: []
  };
  capturedUpdateSql = null;
  capturedUpdateParams = null;

  const response = await invokePatch(
    42,
    { description: 'Contexto detalhado pelo cliente.', expectedVersion: 3 },
    { id: 21, role: 'client', companyId: 12, email: 'cliente@empresa.com' }
  );

  assert.equal(response.statusCode, 200);
  assert.match(capturedUpdateSql, /description =/);
  assert.ok(capturedUpdateParams.includes('Contexto detalhado pelo cliente.'));
});

test('client cannot change workflow fields or unreleased request fields', async () => {
  currentItem = {
    id: 42,
    companyId: 12,
    title: 'Integração Omie e CRM',
    description: 'Contexto inicial.',
    status: 'analysis',
    version: 3,
    isClientVisible: true,
    archivedAt: null,
    clientEditableFields: ['description'],
    integrations: [],
    updates: []
  };
  capturedUpdateSql = null;

  const response = await invokePatch(
    42,
    { status: 'delivered' },
    { id: 21, role: 'client', companyId: 12, email: 'cliente@empresa.com' }
  );

  assert.equal(response.statusCode, 403);
  assert.match(response.body.error, /status/);
  assert.equal(capturedUpdateSql, null);
});
