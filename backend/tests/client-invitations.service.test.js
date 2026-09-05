const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeEmail,
  validatePassword,
  hashToken,
  createInvitationToken,
  createInvitation,
  invitationState,
} = require('../services/clientInvitationsService');
const { escapeHtml } = require('../email/resend');

test('normaliza e valida o endereço convidado', () => {
  assert.equal(normalizeEmail('  Pessoa@Empresa.COM '), 'pessoa@empresa.com');
  assert.throws(() => normalizeEmail('sem-arroba'), /e-mail válido/);
  assert.throws(() => normalizeEmail(`a@${'x'.repeat(318)}.com`), /e-mail válido/);
});

test('senha exige frase longa e respeita o limite efetivo do bcrypt', () => {
  assert.match(validatePassword('curta'), /12 caracteres/);
  assert.match(validatePassword('á'.repeat(40)), /72 bytes/);
  assert.equal(validatePassword('uma frase segura e longa'), null);
});

test('token de convite tem entropia, formato seguro para URL e hash irreversível armazenável', () => {
  const first = createInvitationToken();
  const second = createInvitationToken();
  assert.match(first.rawToken, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first.rawToken, second.rawToken);
  assert.equal(first.tokenHash, hashToken(first.rawToken));
  assert.notEqual(first.tokenHash, first.rawToken);
});

test('novo convite revoga os anteriores antes de persistir somente o hash', async () => {
  const calls = [];
  const db = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('INSERT INTO client_invitations')) {
        return { rows: [{ id: 9, expiresAt: new Date(Date.now() + 1000), deliveryStatus: 'pending' }] };
      }
      return { rows: [], rowCount: 1 };
    }
  };
  const invitation = await createInvitation(db, { userId: 2, companyId: 3, createdBy: 4 });
  assert.match(calls[0].sql, /revoked_at = NOW/);
  assert.match(calls[1].sql, /INSERT INTO client_invitations/);
  assert.equal(calls[1].values.includes(invitation.rawToken), false);
  assert.equal(calls[1].values[2], hashToken(invitation.rawToken));
});

test('estado diferencia convite pendente, expirado, revogado, aceito e falha de entrega', () => {
  const future = new Date(Date.now() + 60_000);
  const past = new Date(Date.now() - 60_000);
  assert.equal(invitationState({ expires_at: future, delivery_status: 'sent' }), 'pending');
  assert.equal(invitationState({ expires_at: past, delivery_status: 'sent' }), 'expired');
  assert.equal(invitationState({ expires_at: future, revoked_at: new Date(), delivery_status: 'sent' }), 'revoked');
  assert.equal(invitationState({ expires_at: future, accepted_at: new Date(), delivery_status: 'sent' }), 'accepted');
  assert.equal(invitationState({ expires_at: future, delivery_status: 'failed' }), 'delivery_failed');
});

test('template escapa dados controlados por empresa e destinatário', () => {
  assert.equal(escapeHtml('<script>"x" & y</script>'), '&lt;script&gt;&quot;x&quot; &amp; y&lt;/script&gt;');
});
