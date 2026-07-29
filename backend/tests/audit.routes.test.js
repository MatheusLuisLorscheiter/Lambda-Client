const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../db');
const authPath = require.resolve('../routes/auth');
const queries = [];

const query = async (sql, params = []) => {
  queries.push({ sql, params });
  if (sql.includes('COUNT(*)::int AS total')) {
    return { rowCount: 1, rows: [{ total: 61 }] };
  }
  return {
    rowCount: 25,
    rows: Array.from({ length: 25 }, (_, index) => ({ id: index + 26, action: 'mapping.update' }))
  };
};

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: { query }
};
require.cache[authPath] = {
  id: authPath,
  filename: authPath,
  loaded: true,
  exports: { authenticateToken: (_req, _res, next) => next() }
};

const router = require('../routes/audit');
const handler = router.stack
  .find(layer => layer.route?.path === '/logs' && layer.route.methods.get)
  .route.stack.at(-1).handle;

const invoke = async ({ user, query: queryParams = {} }) => {
  let statusCode = 200;
  let body;
  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { body = payload; return this; }
  };
  await handler({ user, query: queryParams }, res);
  return { statusCode, body };
};

test('audit logs return a bounded page and an exact total', async () => {
  queries.length = 0;
  const response = await invoke({
    user: { id: 7, role: 'admin' },
    query: { limit: '25', offset: '25', companyId: '12', search: 'mapping' }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.logs.length, 25);
  assert.deepEqual(response.body.pagination, {
    limit: 25,
    offset: 25,
    total: 61,
    returned: 25,
    hasMore: true
  });
  assert.equal(queries.length, 2);
  assert.ok(queries.every(item => item.sql.includes('audit_logs.company_id = $1')));
  assert.ok(queries.every(item => item.params[0] === 12));
});

test('audit logs remain restricted to administrators', async () => {
  queries.length = 0;
  const response = await invoke({ user: { id: 21, role: 'client' } });
  assert.equal(response.statusCode, 403);
  assert.equal(queries.length, 0);
});
