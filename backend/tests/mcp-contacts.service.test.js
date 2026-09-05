const test = require('node:test');
const assert = require('node:assert/strict');
const contacts = require('../services/mcpContactsService');

test('normaliza emails para correspondência exata e rejeita formatos inválidos', () => {
  assert.equal(contacts.normalizeEmail('  CONTROLADORIA@PINCBAR.COM.BR '), 'controladoria@pincbar.com.br');
  assert.throws(() => contacts.normalizeEmail('sem-email'), /email válido/i);
  assert.throws(() => contacts.normalizeEmail('a @pincbar.com.br'), /email válido/i);
});

test('combina clientes ativos e allowlist adicional numa lista deduplicada', async () => {
  let capturedSql = '';
  const db = {
    async query(sql, params) {
      capturedSql = sql;
      assert.deepEqual(params, [7]);
      return { rows: [{ email: 'controladoria@pincbar.com.br' }, { email: 'fiscal@pincbar.com.br' }] };
    },
  };
  const result = await contacts.getAuthorizedEmails(db, 7);
  assert.deepEqual(result, ['controladoria@pincbar.com.br', 'fiscal@pincbar.com.br']);
  assert.match(capturedSql, /FROM users/);
  assert.match(capturedSql, /FROM company_mcp_contact_emails/);
  assert.match(capturedSql, /UNION/);
});

test('reativa autorização existente por upsert e sempre persiste email normalizado', async () => {
  const calls = [];
  const db = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [{ id: 4, company_id: 7, email: params[1], label: params[2], is_active: true }] };
    },
  };
  const result = await contacts.authorizeContact(db, {
    companyId: 7,
    email: ' Controladoria@PincBar.com.br ',
    label: ' Controladoria ',
    actorUserId: 2,
  });
  assert.equal(result.email, 'controladoria@pincbar.com.br');
  assert.deepEqual(calls[0].params, [7, 'controladoria@pincbar.com.br', 'Controladoria', 2]);
  assert.match(calls[0].sql, /ON CONFLICT \(company_id, email\) DO UPDATE/);
});
