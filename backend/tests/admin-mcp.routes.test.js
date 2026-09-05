const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../db');
const authPath = require.resolve('../routes/auth');
const queries = [];

const query = async (sql) => {
  queries.push(sql);
  if (sql.includes('FROM companies c')) {
    return {
      rows: [{
        company_id: 7,
        company_name: 'PincBar',
        company_created_at: '2026-01-01T00:00:00.000Z',
        config_id: 9,
        is_enabled: true,
        api_key_prefix: 'mcp_live_test...',
        allowed_domains: { logs: true, processes: true, mappings: true, integrations: true },
        allowed_scopes: ['processes:write'],
        authorized_client_emails: ['controladoria@pincbar.com.br', 'fiscal@pincbar.com.br'],
        max_requests_per_minute: 60,
        last_accessed_at: null,
        mcp_calls_count: 3,
      }],
    };
  }
  if (sql.includes('active_companies_count')) {
    return { rows: [{ active_companies_count: 1, mcp_calls_today: 2 }] };
  }
  return { rows: [] };
};

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: { query, pool: {} },
};
require.cache[authPath] = {
  id: authPath,
  filename: authPath,
  loaded: true,
  exports: { authenticateToken: (_req, _res, next) => next() },
};

const router = require('../routes/admin-mcp.routes');
const handler = router.stack
  .find(layer => layer.route?.path === '/companies' && layer.route.methods.get)
  .route.stack.at(-1).handle;

test('admin MCP lista os emails ativos vinculados a cada empresa', async () => {
  queries.length = 0;
  let statusCode = 200;
  let body;
  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { body = payload; return this; },
  };

  await handler({}, res);

  assert.equal(statusCode, 200);
  assert.deepEqual(body.companies[0].authorizedClientEmails, [
    'controladoria@pincbar.com.br',
    'fiscal@pincbar.com.br',
  ]);
  assert.equal(body.companies[0].companyName, 'PincBar');
  assert.equal(body.companies[0].accessMode, undefined);
  const companiesSql = queries.find(sql => sql.includes('FROM companies c'));
  assert.match(companiesSql, /u\.role = 'client'/);
  assert.match(companiesSql, /u\.is_active = TRUE/);
  assert.match(companiesSql, /json_agg\(DISTINCT LOWER\(BTRIM\(u\.email\)\)/);
});
