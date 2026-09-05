const crypto = require('crypto');

const INVITATION_TTL_HOURS = 72;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_BYTES = 72;

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error('Informe um e-mail válido');
    error.status = 400;
    throw error;
  }
  return email;
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`;
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    return `A senha deve ter no máximo ${MAX_PASSWORD_BYTES} bytes`;
  }
  return null;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createInvitationToken() {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  return { rawToken, tokenHash: hashToken(rawToken) };
}

function invitationExpiry(now = Date.now()) {
  return new Date(now + INVITATION_TTL_HOURS * 60 * 60 * 1000);
}

async function createInvitation(db, { userId, companyId, createdBy, now = Date.now() }) {
  const { rawToken, tokenHash } = createInvitationToken();
  const expiresAt = invitationExpiry(now);

  await db.query(
    `UPDATE client_invitations
        SET revoked_at = NOW()
      WHERE user_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL`,
    [userId]
  );
  const result = await db.query(
    `INSERT INTO client_invitations
       (user_id, company_id, token_hash, created_by, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, expires_at AS "expiresAt", delivery_status AS "deliveryStatus"`,
    [userId, companyId, tokenHash, createdBy || null, expiresAt]
  );
  return { ...result.rows[0], rawToken };
}

async function recordInvitationDelivery(db, invitationId, delivered) {
  await db.query(
    `UPDATE client_invitations
        SET delivery_status = $2,
            sent_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE sent_at END
      WHERE id = $1`,
    [invitationId, delivered ? 'sent' : 'failed']
  );
}

function invitationState(row, now = new Date()) {
  if (!row) return 'not_invited';
  if (row.accepted_at) return 'accepted';
  if (row.revoked_at) return 'revoked';
  if (new Date(row.expires_at) <= now) return 'expired';
  if (row.delivery_status === 'failed') return 'delivery_failed';
  return 'pending';
}

module.exports = {
  INVITATION_TTL_HOURS,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_BYTES,
  normalizeEmail,
  validatePassword,
  hashToken,
  createInvitationToken,
  invitationExpiry,
  createInvitation,
  recordInvitationDelivery,
  invitationState,
};
