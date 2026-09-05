const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = 'test-secret-with-sufficient-length';

const dbPath = require.resolve('../db');
const emailPath = require.resolve('../email/resend');
const auditPath = require.resolve('../audit/logger');
const txCalls = [];
const globalCalls = [];
let invitationRow = null;

const tx = {
  async query(sql, values = []) {
    txCalls.push({ sql, values });
    if (sql.includes('SELECT id, name FROM companies')) return { rows: [{ id: 7, name: 'Empresa Teste' }], rowCount: 1 };
    if (sql.includes('SELECT id FROM companies WHERE LOWER')) return { rows: [], rowCount: 0 };
    if (sql.includes('SELECT id FROM users') && sql.includes('LOWER(BTRIM(email))')) return { rows: [], rowCount: 0 };
    if (sql.includes('INSERT INTO users')) return { rows: [{ id: 11, email: 'pessoa@empresa.com', role: 'client', isActive: false, mustSetPassword: true, companyId: 7, createdAt: new Date() }], rowCount: 1 };
    if (sql.includes('INSERT INTO client_invitations')) return { rows: [{ id: 21, expiresAt: new Date(Date.now() + 3600_000), deliveryStatus: 'pending' }], rowCount: 1 };
    if (sql.includes('FROM client_invitations ci') && sql.includes('FOR UPDATE')) return { rows: invitationRow ? [invitationRow] : [], rowCount: invitationRow ? 1 : 0 };
    return { rows: [], rowCount: 1 };
  },
  release() {},
};

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    pool: { async connect() { return tx; } },
    async query(sql, values = []) { globalCalls.push({ sql, values }); return { rows: [], rowCount: 1 }; },
  },
};
require.cache[emailPath] = {
  id: emailPath,
  filename: emailPath,
  loaded: true,
  exports: {
    async sendPasswordResetEmail() {},
    async sendClientInviteEmail() {},
    async sendCompanyDiscoveryEmail() {},
  },
};
require.cache[auditPath] = {
  id: auditPath,
  filename: auditPath,
  loaded: true,
  exports: { async logAudit() {} },
};

const { router } = require('../routes/auth');
const handler = (path, method = 'post') => router.stack
  .find(layer => layer.route?.path === path && layer.route.methods[method])
  .route.stack.at(-1).handle;

function response() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader(key, value) { this.headers[key] = value; },
  };
}

test('admin convida sem receber ou definir a senha do cliente', async () => {
  txCalls.length = 0;
  globalCalls.length = 0;
  const req = {
    body: { email: ' Pessoa@Empresa.COM ', companyId: 7 },
    user: { id: 1, role: 'admin', companyId: null },
    ip: '127.0.0.1', requestId: 'test', get() { return 'test-agent'; },
  };
  const res = response();
  await handler('/clients')(req, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.client.isActive, false);
  assert.equal(res.body.client.mustSetPassword, true);
  assert.equal(res.body.inviteSent, true);
  const userInsert = txCalls.find(call => call.sql.includes('INSERT INTO users'));
  assert.match(userInsert.sql, /FALSE, TRUE/);
  assert.equal(userInsert.values.includes(req.body.password), false);
});

test('aceite é transacional, ativa o usuário e invalida outros segredos', async () => {
  txCalls.length = 0;
  invitationRow = {
    id: 21, user_id: 11, company_id: 7, email: 'pessoa@empresa.com', company_name: 'Empresa Teste',
    expires_at: new Date(Date.now() + 3600_000), accepted_at: null, revoked_at: null,
    delivery_status: 'sent', must_set_password: true,
  };
  const req = { body: { token: 'a'.repeat(43), password: 'uma senha longa e exclusiva' }, ip: '127.0.0.1', get() { return 'test-agent'; } };
  const res = response();
  await handler('/invitations/accept')(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.companyId, 7);
  assert.ok(res.body.token);
  assert.ok(txCalls.some(call => /must_set_password = FALSE/.test(call.sql)));
  assert.ok(txCalls.some(call => /accepted_at = NOW/.test(call.sql)));
  assert.ok(txCalls.some(call => /id <> \$2/.test(call.sql)));
  assert.equal(txCalls.at(-1).sql, 'COMMIT');
});

test('token expirado não pode ser aceito e não altera o usuário', async () => {
  txCalls.length = 0;
  invitationRow = {
    id: 21, user_id: 11, company_id: 7, email: 'pessoa@empresa.com', company_name: 'Empresa Teste',
    expires_at: new Date(Date.now() - 1000), accepted_at: null, revoked_at: null,
    delivery_status: 'sent', must_set_password: true,
  };
  const res = response();
  await handler('/invitations/accept')({ body: { token: 'b'.repeat(43), password: 'uma senha longa e exclusiva' } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'Convite inválido ou expirado');
  assert.equal(txCalls.some(call => call.sql.includes('UPDATE users')), false);
});

test('admin vinculado não pode convidar cliente para outro tenant', async () => {
  txCalls.length = 0;
  const res = response();
  await handler('/clients')({ body: { email: 'pessoa@empresa.com', companyId: 8 }, user: { id: 1, role: 'admin', companyId: 7 } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(txCalls.length, 0);
});
