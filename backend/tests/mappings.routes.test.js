const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../db');
const authPath = require.resolve('../routes/auth');
const integrationsServicePath = require.resolve('../services/integrations');
const auditPath = require.resolve('../audit/logger');

let queries = [];
let mappingSetFixture = null;
const query = async (sql, params = []) => {
  queries.push({ sql, params });
  if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rowCount: 0, rows: [] };
  if (sql.includes('INSERT INTO integration_mapping_sets')) {
    return { rowCount: 1, rows: [{ id: 91 }] };
  }
  if (sql.includes('FROM integration_mapping_sets mapping_sets') && sql.includes('ORDER BY')) {
    return {
      rowCount: 1,
      rows: [{
        id: 91,
        integrationId: 4,
        name: 'Pedidos',
        sourceSystem: 'Omie',
        targetSystem: 'CRM',
        status: 'published',
        entries: []
      }]
    };
  }
  if (sql.includes('FROM integration_mapping_sets mapping_sets')) {
    return {
      rowCount: 1,
      rows: [mappingSetFixture || {
        id: 91,
        company_id: 12,
        integration_id: 4,
        integration_company_id: 12,
        name: 'Pedidos',
        status: 'draft'
      }]
    };
  }
  if (sql.includes('SELECT id, client_editable_fields FROM integration_mapping_entries')) {
    return { rowCount: 1, rows: [{ id: 7, client_editable_fields: ['targetPath', 'notes'] }] };
  }
  if (sql.includes('MAX(sort_order)')) return { rowCount: 1, rows: [{ sortOrder: 0 }] };
  if (sql.includes('INSERT INTO integration_mapping_entries')) {
    return {
      rowCount: 1,
      rows: [{
        id: 7,
        sourcePath: 'pedido.codigo',
        targetPath: 'order.externalId',
        direction: 'source_to_target',
        isRequired: true
      }]
    };
  }
  if (sql.includes('UPDATE integration_mapping_entries')) {
    return { rowCount: 1, rows: [{ id: 7, targetPath: params[0], clientEditableFields: ['targetPath', 'notes'] }] };
  }
  if (sql.includes('INSERT INTO integration_mapping_attachments')) {
    return {
      rowCount: 1,
      rows: [{
        id: 13,
        fileName: 'de-para.md',
        mimeType: 'text/markdown',
        fileSize: 22,
        hasExtractedText: true,
        createdAt: new Date().toISOString()
      }]
    };
  }
  if (sql.includes('UPDATE integration_mapping_sets')) return { rowCount: 1, rows: [] };
  throw new Error(`SQL não previsto: ${sql}`);
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
require.cache[integrationsServicePath] = {
  id: integrationsServicePath,
  filename: integrationsServicePath,
  loaded: true,
  exports: {
    getIntegrationForUser: async () => ({
      id: 4,
      company_id: 12,
      name: 'Pedidos',
      function_name: 'sync-pedidos'
    })
  }
};
require.cache[auditPath] = {
  id: auditPath,
  filename: auditPath,
  loaded: true,
  exports: { logAudit: async () => {} }
};

const router = require('../routes/mappings.routes');
const getHandler = router.stack
  .find(layer => layer.route?.path === '/integrations/:integrationId/mappings' && layer.route.methods.get)
  .route.stack.at(-1).handle;
const createSetHandler = router.stack
  .find(layer => layer.route?.path === '/integrations/:integrationId/mappings' && layer.route.methods.post)
  .route.stack.at(-1).handle;
const createEntryHandler = router.stack
  .find(layer => layer.route?.path === '/mappings/:mappingSetId/entries' && layer.route.methods.post)
  .route.stack.at(-1).handle;
const uploadAttachmentHandler = router.stack
  .find(layer => layer.route?.path === '/mappings/:mappingSetId/attachments' && layer.route.methods.post)
  .route.stack.at(-1).handle;
const bulkEntriesHandler = router.stack
  .find(layer => layer.route?.path === '/mappings/:mappingSetId/entries/bulk' && layer.route.methods.post)
  .route.stack.at(-1).handle;
const updateEntryHandler = router.stack
  .find(layer => layer.route?.path === '/mappings/:mappingSetId/entries/:entryId' && layer.route.methods.patch)
  .route.stack.at(-1).handle;
const deleteSetHandler = router.stack
  .find(layer => layer.route?.path === '/mappings/:mappingSetId' && layer.route.methods.delete)
  .route.stack.at(-1).handle;

const invoke = async (handler, { user, params = {}, query: queryParams = {}, body = {} }) => {
  let statusCode = 200;
  let responseBody;
  const req = {
    user,
    params,
    query: queryParams,
    body,
    ip: '127.0.0.1',
    get: () => 'node-test'
  };
  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { responseBody = payload; return this; }
  };
  await handler(req, res);
  return { statusCode, body: responseBody };
};

test('admin creates a versioned mapping set for an integration company', async () => {
  queries = [];
  mappingSetFixture = null;
  const response = await invoke(createSetHandler, {
    user: { id: 7, role: 'admin', companyId: null },
    params: { integrationId: '4' },
    body: {
      name: 'Pedidos',
      sourceSystem: 'Omie',
      targetSystem: 'CRM',
      description: 'Mapa oficial de pedidos'
    }
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.mappingSetId, 91);
  const insert = queries.find(item => item.sql.includes('INSERT INTO integration_mapping_sets'));
  assert.equal(insert.params[0], 12);
  assert.equal(insert.params[1], 4);
  assert.equal(insert.params[4], 'Pedidos');
});

test('client listing is restricted to published mapping sets', async () => {
  queries = [];
  const response = await invoke(getHandler, {
    user: { id: 21, role: 'client', companyId: 12 },
    params: { integrationId: '4' }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.mappingSets.length, 1);
  const select = queries.find(item => item.sql.includes('ORDER BY'));
  assert.match(select.sql, /mapping_sets\.status = 'published'/);
});

test('entry creation persists transformation contract and marks required fields', async () => {
  queries = [];
  mappingSetFixture = null;
  const response = await invoke(createEntryHandler, {
    user: { id: 7, role: 'admin', companyId: null },
    params: { mappingSetId: '91' },
    body: {
      sourcePath: 'pedido.codigo',
      sourceType: 'string',
      targetPath: 'order.externalId',
      targetType: 'string',
      transformation: 'trim',
      isRequired: true
    }
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.entry.isRequired, true);
  const insert = queries.find(item => item.sql.includes('INSERT INTO integration_mapping_entries'));
  assert.equal(insert.params[1], 'pedido.codigo');
  assert.equal(insert.params[3], 'order.externalId');
  assert.equal(insert.params[8], true);
});

test('admin can attach a prepared Markdown mapping to a draft version', async () => {
  queries = [];
  mappingSetFixture = null;
  const markdown = '# DE-PARA · Pedidos';
  const response = await invoke(uploadAttachmentHandler, {
    user: { id: 7, role: 'admin', companyId: null },
    params: { mappingSetId: '91' },
    body: {
      fileName: 'de-para.md',
      mimeType: 'text/markdown',
      contentBase64: Buffer.from(markdown, 'utf8').toString('base64'),
      appendToDocument: true
    }
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.attachment.id, 13);
  assert.equal(response.body.appendedToDocument, true);
  const insert = queries.find(item => item.sql.includes('INSERT INTO integration_mapping_attachments'));
  assert.equal(insert.params[2], 'de-para.md');
  assert.equal(insert.params[6], markdown);
  assert.ok(queries.some(item => item.sql.includes('content_markdown = CONCAT_WS')));
});

test('Markdown table import can create structured mapping entries in bulk', async () => {
  queries = [];
  mappingSetFixture = null;
  const response = await invoke(bulkEntriesHandler, {
    user: { id: 7, role: 'admin', companyId: null },
    params: { mappingSetId: '91' },
    body: {
      entries: [
        {
          section: 'Condições de pagamento',
          sourcePath: '28 dias',
          targetPath: 'A28',
          mappingStatus: 'mapped'
        },
        {
          section: 'Condições de pagamento',
          sourcePath: '35 dias',
          targetPath: 'Criar',
          mappingStatus: 'pending',
          notes: 'Criar a parcela na Omie'
        }
      ]
    }
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.imported, 2);
  const insert = queries.find(item => item.sql.includes('INSERT INTO integration_mapping_entries'));
  assert.equal(insert.params.length, 28);
  assert.equal(insert.params[1], '28 dias');
  assert.equal(insert.params[13], 'mapped');
  assert.equal(insert.params[15], '35 dias');
  assert.equal(insert.params[27], 'pending');
});

test('client can edit only an explicitly released field in selected mode', async () => {
  queries = [];
  mappingSetFixture = {
    id: 91,
    company_id: 12,
    integration_id: 4,
    integration_company_id: 12,
    name: 'Pedidos',
    status: 'published',
    client_edit_mode: 'selected'
  };
  const response = await invoke(updateEntryHandler, {
    user: { id: 21, role: 'client', companyId: 12 },
    params: { mappingSetId: '91', entryId: '7' },
    body: { targetPath: 'order.customer.externalId' }
  });

  assert.equal(response.statusCode, 200);
  const update = queries.find(item => item.sql.includes('UPDATE integration_mapping_entries'));
  assert.match(update.sql, /target_path =/);
  assert.match(update.sql, /last_client_edited_at =/);
  assert.equal(update.params[0], 'order.customer.externalId');
});

test('client cannot edit a field that was not released', async () => {
  queries = [];
  mappingSetFixture = {
    id: 91,
    company_id: 12,
    integration_id: 4,
    integration_company_id: 12,
    name: 'Pedidos',
    status: 'published',
    client_edit_mode: 'selected'
  };
  const response = await invoke(updateEntryHandler, {
    user: { id: 21, role: 'client', companyId: 12 },
    params: { mappingSetId: '91', entryId: '7' },
    body: { sourcePath: 'pedido.novo_codigo' }
  });

  assert.equal(response.statusCode, 403);
  assert.match(response.body.error, /sourcePath/);
  assert.equal(queries.some(item => item.sql.includes('UPDATE integration_mapping_entries')), false);
});

test('published mapping must be archived before permanent deletion', async () => {
  queries = [];
  mappingSetFixture = {
    id: 91,
    company_id: 12,
    integration_id: 4,
    integration_company_id: 12,
    name: 'Pedidos',
    status: 'published'
  };
  const response = await invoke(deleteSetHandler, {
    user: { id: 7, role: 'admin', companyId: null },
    params: { mappingSetId: '91' }
  });

  assert.equal(response.statusCode, 409);
  assert.match(response.body.error, /Arquive/);
});
