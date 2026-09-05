const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const router = express.Router();
const { pool, query } = require('../db');
const { logAudit } = require('../audit/logger');
const { sendPasswordResetEmail, sendClientInviteEmail, sendCompanyDiscoveryEmail } = require('../email/resend');
const {
  INVITATION_TTL_HOURS,
  normalizeEmail,
  validatePassword,
  hashToken,
  createInvitation,
  recordInvitationDelivery,
  invitationState,
} = require('../services/clientInvitationsService');

const accessTokenTtl = '24h';
const resetTokenTtlMinutes = 30;

const getPasswordValidationError = validatePassword;
const normalizedFrontendBaseUrl = () => (process.env.FRONTEND_BASE_URL || 'http://localhost:5173')
  .split(',')[0].trim().replace(/\/$/, '');
const invitationLinkFor = (token) => `${normalizedFrontendBaseUrl()}/invite#token=${encodeURIComponent(token)}`;
const canManageCompany = (user, companyId) => !user.companyId || Number(user.companyId) === Number(companyId);
const normalizeCompanyName = (value) => {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (!name) throw Object.assign(new Error('Nome da empresa é obrigatório'), { status: 400 });
  if (name.length > 160 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw Object.assign(new Error('Nome da empresa inválido'), { status: 400 });
  }
  return name;
};

const createAccessToken = (user) => jwt.sign(
  { id: user.id, email: user.email, role: user.role, companyId: user.company_id },
  process.env.JWT_SECRET,
  { expiresIn: accessTokenTtl }
);

// Client login
router.post('/login', async (req, res) => {
  const { email, password, company } = req.body;

  if (!email || !password || !company) {
    return res.status(400).json({ error: 'E-mail, senha e empresa são obrigatórios' });
  }

  let normalizedEmail;
  try {
    normalizedEmail = normalizeEmail(email);
  } catch {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const result = await query(
    `SELECT users.id, users.email, users.password_hash, users.role, users.company_id, companies.name AS company_name
     FROM users
     JOIN companies ON companies.id = users.company_id
     WHERE LOWER(BTRIM(users.email)) = $1 AND LOWER(BTRIM(companies.name)) = LOWER(BTRIM($2))
       AND users.role = 'client' AND users.is_active = TRUE AND users.must_set_password = FALSE`,
    [normalizedEmail, company]
  );
  const user = result.rows[0];
  if (!user) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const validPassword = await bcrypt.compare(password, user.password_hash);
  if (!validPassword) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const token = createAccessToken(user);
  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  await logAudit({
    companyId: user.company_id,
    userId: user.id,
    action: 'auth.login',
    metadata: { email: user.email },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.json({
    token,
    user: { id: user.id, email: user.email, role: user.role, companyId: user.company_id, companyName: user.company_name }
  });
});

// Admin login
router.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
  }

  const result = await query(
    `SELECT users.id, users.email, users.password_hash, users.role, users.company_id
     FROM users
     WHERE users.email = $1 AND users.role = 'admin' AND users.is_active = TRUE`,
    [email]
  );

  const user = result.rows[0];
  if (!user) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const validPassword = await bcrypt.compare(password, user.password_hash);
  if (!validPassword) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const token = createAccessToken(user);
  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  res.json({
    token,
    user: { id: user.id, email: user.email, role: user.role, companyId: user.company_id || null, companyName: null }
  });
});

// Middleware to verify token
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acesso obrigatório' });
  }

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    const userId = Number(user.id);
    if (!Number.isInteger(userId)) {
      return res.status(403).json({ error: 'Token inválido' });
    }

    const userResult = await query(
      'SELECT id, email, role, company_id, is_active, must_set_password FROM users WHERE id = $1',
      [userId]
    );
    const storedUser = userResult.rows[0];

    if (!storedUser || !storedUser.is_active || storedUser.must_set_password) {
      return res.status(403).json({ error: 'Usuário inativo' });
    }

    req.user = {
      id: storedUser.id,
      email: storedUser.email,
      role: storedUser.role,
      companyId: storedUser.company_id,
    };
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Token inválido' });
  }
};

// Logout (stateless)
router.post('/logout', (req, res) => {
  res.json({ success: true });
});

// List companies by email (public)
router.post('/companies/by-email', async (req, res) => {
  let normalizedEmail;
  try { normalizedEmail = normalizeEmail(req.body.email); } catch { return res.json({ success: true }); }

  const result = await query(
    `SELECT DISTINCT companies.name
     FROM users
     JOIN companies ON companies.id = users.company_id
     WHERE LOWER(BTRIM(users.email)) = $1 AND users.role = 'client'
       AND users.is_active = TRUE AND users.must_set_password = FALSE
     ORDER BY companies.name ASC`,
    [normalizedEmail]
  );
  res.json({ success: true });
  if (result.rowCount > 0) {
    const companyNames = result.rows.map(row => row.name);
    setImmediate(() => {
      sendCompanyDiscoveryEmail({
        to: normalizedEmail,
        companyNames,
        loginLink: `${normalizedFrontendBaseUrl()}/login`,
      }).catch(error => {
        console.error('[company discovery delivery]', { requestId: req.requestId, code: error.code || 'EMAIL_DELIVERY_FAILED' });
      });
    });
  }
});

// List companies (admin only)
router.get('/companies', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso de administrador obrigatório' });
  }

  const result = req.user.companyId
    ? await query('SELECT id, name, created_at AS "createdAt" FROM companies WHERE id = $1', [req.user.companyId])
    : await query('SELECT id, name, created_at AS "createdAt" FROM companies ORDER BY name ASC');

  res.json({ companies: result.rows });
});

// Create company (admin only)
router.post('/companies', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso de administrador obrigatório' });
  }
  if (req.user.companyId) {
    return res.status(403).json({ error: 'Somente administradores globais podem criar empresas' });
  }

  let normalizedName;
  try { normalizedName = normalizeCompanyName(req.body.name); }
  catch (error) { return res.status(error.status || 400).json({ error: error.message }); }

  try {
    const existing = await query('SELECT id FROM companies WHERE LOWER(BTRIM(name)) = LOWER($1) LIMIT 1', [normalizedName]);
    if (existing.rowCount > 0) return res.status(409).json({ error: 'Já existe uma empresa com este nome' });
    const result = await query(
      'INSERT INTO companies (name) VALUES ($1) RETURNING id, name, created_at AS "createdAt"',
      [normalizedName]
    );

    await logAudit({
      companyId: result.rows[0].id,
      userId: req.user.id,
      action: 'company.create',
      resourceType: 'company',
      resourceId: String(result.rows[0].id),
      metadata: { name: normalizedName },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ company: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List client users (admin only)
router.get('/clients', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso de administrador obrigatório' });
  }

  const scope = (req.query.scope || '').toString().toLowerCase();
  const companyIdParam = req.query.companyId ? Number(req.query.companyId) : null;

  const conditions = ['users.role = $1'];
  const values = ['client'];
  let idx = 2;

  if (req.user.companyId) {
    if (companyIdParam && !canManageCompany(req.user, companyIdParam)) {
      return res.status(403).json({ error: 'Você não pode acessar clientes de outra empresa' });
    }
    conditions.push(`users.company_id = $${idx++}`);
    values.push(req.user.companyId);
  } else if (scope !== 'all') {
    const targetCompanyId = companyIdParam || req.user.companyId;
    if (!targetCompanyId) {
      return res.status(400).json({ error: 'companyId é obrigatório' });
    }
    conditions.push(`users.company_id = $${idx++}`);
    values.push(targetCompanyId);
  } else if (companyIdParam) {
    conditions.push(`users.company_id = $${idx++}`);
    values.push(companyIdParam);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT users.id, users.email, users.role, users.is_active AS "isActive",
            users.must_set_password AS "mustSetPassword",
            users.email_verified_at AS "emailVerifiedAt",
            users.last_login_at AS "lastLoginAt",
            users.created_at AS "createdAt",
            users.company_id AS "companyId", companies.name AS "companyName",
            invitation.expires_at AS "invitationExpiresAt",
            invitation.sent_at AS "invitationSentAt",
            invitation.delivery_status AS "invitationDeliveryStatus",
            CASE
              WHEN users.must_set_password = FALSE THEN CASE WHEN users.is_active THEN 'active' ELSE 'inactive' END
              WHEN invitation.id IS NULL THEN 'not_invited'
              WHEN invitation.accepted_at IS NOT NULL THEN 'accepted'
              WHEN invitation.revoked_at IS NOT NULL THEN 'revoked'
              WHEN invitation.expires_at <= NOW() THEN 'expired'
              WHEN invitation.delivery_status = 'failed' THEN 'delivery_failed'
              ELSE 'pending'
            END AS "invitationStatus"
     FROM users
     JOIN companies ON companies.id = users.company_id
     LEFT JOIN LATERAL (
       SELECT ci.id, ci.expires_at, ci.sent_at, ci.accepted_at, ci.revoked_at, ci.delivery_status
         FROM client_invitations ci
        WHERE ci.user_id = users.id
        ORDER BY ci.created_at DESC
        LIMIT 1
     ) invitation ON TRUE
     ${whereClause}
     ORDER BY companies.name ASC, users.email ASC`,
    values
  );

  const clients = result.rows;

  res.json({ clients });
});

// Create client user (admin only)
router.post('/clients', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso de administrador obrigatório' });
  }

  let email;
  try {
    email = normalizeEmail(req.body.email);
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }

  const requestedCompanyId = req.body.companyId ? Number(req.body.companyId) : null;
  let requestedCompanyName = '';
  if (req.body.companyName) {
    try { requestedCompanyName = normalizeCompanyName(req.body.companyName); }
    catch (error) { return res.status(error.status || 400).json({ error: error.message }); }
  }
  if (requestedCompanyId && !Number.isInteger(requestedCompanyId)) {
    return res.status(400).json({ error: 'companyId inválido' });
  }
  if (requestedCompanyName.length > 160) {
    return res.status(400).json({ error: 'Nome da empresa muito longo' });
  }
  if (req.user.companyId && (requestedCompanyName || !canManageCompany(req.user, requestedCompanyId || req.user.companyId))) {
    return res.status(403).json({ error: 'Você só pode convidar clientes para sua própria empresa' });
  }

  const db = await pool.connect();
  let createdClient;
  let invitation;
  let resolvedCompany;
  try {
    await db.query('BEGIN');
    if (requestedCompanyName) {
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`company-name:${requestedCompanyName.toLowerCase()}`]);
      const existingCompany = await db.query(
        'SELECT id FROM companies WHERE LOWER(BTRIM(name)) = LOWER($1) LIMIT 1',
        [requestedCompanyName]
      );
      if (existingCompany.rowCount > 0) {
        await db.query('ROLLBACK');
        return res.status(409).json({ error: 'Já existe uma empresa com este nome. Selecione-a na lista.' });
      }
      const companyResult = await db.query(
        'INSERT INTO companies (name) VALUES ($1) RETURNING id, name',
        [requestedCompanyName]
      );
      resolvedCompany = companyResult.rows[0];
      if (!resolvedCompany) {
        await db.query('ROLLBACK');
        return res.status(409).json({ error: 'Já existe uma empresa com este nome. Selecione-a na lista.' });
      }
    } else {
      const companyId = requestedCompanyId || req.user.companyId;
      if (!companyId) {
        await db.query('ROLLBACK');
        return res.status(400).json({ error: 'Selecione ou crie uma empresa' });
      }
      const companyResult = await db.query('SELECT id, name FROM companies WHERE id = $1', [companyId]);
      resolvedCompany = companyResult.rows[0];
      if (!resolvedCompany) {
        await db.query('ROLLBACK');
        return res.status(404).json({ error: 'Empresa não encontrada' });
      }
    }

    if (!canManageCompany(req.user, resolvedCompany.id)) {
      await db.query('ROLLBACK');
      return res.status(403).json({ error: 'Você não pode gerenciar esta empresa' });
    }

    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`client-invite:${resolvedCompany.id}:${email}`]);
    const duplicate = await db.query(
      `SELECT id FROM users
        WHERE company_id = $1 AND LOWER(BTRIM(email)) = $2
        LIMIT 1`,
      [resolvedCompany.id, email]
    );
    if (duplicate.rowCount > 0) {
      await db.query('ROLLBACK');
      return res.status(409).json({ error: 'Já existe um cliente com este e-mail nessa empresa' });
    }

    const unusablePassword = crypto.randomBytes(48).toString('base64url');
    const passwordHash = await bcrypt.hash(unusablePassword, 12);
    const inserted = await db.query(
      `INSERT INTO users
         (company_id, email, password_hash, role, is_active, must_set_password)
       VALUES ($1, $2, $3, 'client', FALSE, TRUE)
       RETURNING id, email, role, is_active AS "isActive", must_set_password AS "mustSetPassword",
                 company_id AS "companyId", created_at AS "createdAt"`,
      [resolvedCompany.id, email, passwordHash]
    );
    createdClient = { ...inserted.rows[0], companyName: resolvedCompany.name, invitationStatus: 'pending' };
    invitation = await createInvitation(db, {
      userId: createdClient.id,
      companyId: resolvedCompany.id,
      createdBy: req.user.id,
    });
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    if (error.code === '23505') return res.status(409).json({ error: 'Cliente ou empresa já cadastrado' });
    throw error;
  } finally {
    db.release();
  }

  let inviteSent = false;
  try {
    await sendClientInviteEmail({
      to: email,
      companyName: resolvedCompany.name,
      invitationLink: invitationLinkFor(invitation.rawToken),
      expiresInHours: INVITATION_TTL_HOURS,
    });
    inviteSent = true;
  } catch (error) {
    console.error('[client invitation delivery]', { requestId: req.requestId, code: error.code || 'EMAIL_DELIVERY_FAILED' });
  }
  await recordInvitationDelivery({ query }, invitation.id, inviteSent);
  await logAudit({
    companyId: resolvedCompany.id,
    userId: req.user.id,
    action: inviteSent ? 'client.invite.created' : 'client.invite.delivery_failed',
    resourceType: 'user',
    resourceId: String(createdClient.id),
    metadata: { email, expiresAt: invitation.expiresAt },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
  if (requestedCompanyName) {
    await logAudit({
      companyId: resolvedCompany.id,
      userId: req.user.id,
      action: 'company.create',
      resourceType: 'company',
      resourceId: String(resolvedCompany.id),
      metadata: { name: resolvedCompany.name, source: 'client_invitation' },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
  }

  res.status(201).json({
    client: {
      ...createdClient,
      invitationStatus: inviteSent ? 'pending' : 'delivery_failed',
      invitationExpiresAt: invitation.expiresAt,
    },
    inviteSent,
  });
});

// Update client status (admin only)
router.patch('/clients/:clientId/status', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso de administrador obrigatório' });
  }

  const clientId = Number(req.params.clientId);
  if (!Number.isInteger(clientId)) return res.status(400).json({ error: 'clientId inválido' });
  const { isActive } = req.body;

  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ error: 'isActive deve ser booleano' });
  }

  const userResult = await query(
    'SELECT id, company_id, must_set_password FROM users WHERE id = $1 AND role = $2',
    [clientId, 'client']
  );

  const client = userResult.rows[0];
  if (!client) {
    return res.status(404).json({ error: 'Cliente não encontrado' });
  }
  if (!canManageCompany(req.user, client.company_id)) {
    return res.status(403).json({ error: 'Você não pode gerenciar este cliente' });
  }
  if (isActive && client.must_set_password) {
    return res.status(409).json({ error: 'O cliente precisa aceitar o convite e definir sua senha antes de ser ativado' });
  }

  const result = await query(
    'UPDATE users SET is_active = $1 WHERE id = $2 RETURNING id, email, role, is_active AS "isActive", company_id AS "companyId"',
    [isActive, clientId]
  );

  await logAudit({
    companyId: client.company_id,
    userId: req.user.id,
    action: isActive ? 'client.activate' : 'client.deactivate',
    resourceType: 'user',
    resourceId: String(clientId),
    metadata: { isActive },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.json({ client: result.rows[0] });
});

// Resend client invite (admin only)
router.post('/clients/:clientId/invite', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso de administrador obrigatório' });
  }

  const clientId = Number(req.params.clientId);
  if (!Number.isInteger(clientId)) return res.status(400).json({ error: 'clientId inválido' });

  const clientResult = await query(
    `SELECT users.id, users.email, users.company_id, users.must_set_password, companies.name AS company_name
     FROM users
     JOIN companies ON companies.id = users.company_id
     WHERE users.id = $1 AND users.role = $2`,
    [clientId, 'client']
  );

  const client = clientResult.rows[0];
  if (!client) {
    return res.status(404).json({ error: 'Cliente não encontrado' });
  }
  if (!canManageCompany(req.user, client.company_id)) {
    return res.status(403).json({ error: 'Você não pode gerenciar este cliente' });
  }
  if (!client.must_set_password) {
    return res.status(409).json({ error: 'Este cliente já aceitou o convite' });
  }

  const db = await pool.connect();
  let invitation;
  try {
    await db.query('BEGIN');
    await db.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [client.id]);
    invitation = await createInvitation(db, {
      userId: client.id,
      companyId: client.company_id,
      createdBy: req.user.id,
    });
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }

  let inviteSent = false;
  try {
    await sendClientInviteEmail({
      to: client.email,
      companyName: client.company_name,
      invitationLink: invitationLinkFor(invitation.rawToken),
      expiresInHours: INVITATION_TTL_HOURS,
    });
    inviteSent = true;
  } catch (error) {
    console.error('[client invitation delivery]', { requestId: req.requestId, code: error.code || 'EMAIL_DELIVERY_FAILED' });
  }
  await recordInvitationDelivery({ query }, invitation.id, inviteSent);
  await logAudit({
    companyId: client.company_id,
    userId: req.user.id,
    action: inviteSent ? 'client.invite.resent' : 'client.invite.delivery_failed',
    resourceType: 'user',
    resourceId: String(clientId),
    metadata: { email: client.email, expiresAt: invitation.expiresAt },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.status(inviteSent ? 200 : 502).json({
    success: inviteSent,
    inviteSent,
    invitationStatus: inviteSent ? 'pending' : 'delivery_failed',
    invitationExpiresAt: invitation.expiresAt,
    ...(inviteSent ? {} : { error: 'Não foi possível entregar o convite. Tente novamente.' }),
  });
});

// Transfer client to another company (admin only)
router.patch('/clients/:clientId/company', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso de administrador obrigatório' });
  }

  const clientId = Number(req.params.clientId);
  const { companyId } = req.body;

  if (!companyId) {
    return res.status(400).json({ error: 'companyId é obrigatório' });
  }

  const targetCompanyId = Number(companyId);
  if (!Number.isInteger(clientId) || !Number.isInteger(targetCompanyId)) {
    return res.status(400).json({ error: 'Cliente ou empresa inválido' });
  }

  const clientResult = await query(
    'SELECT id, email, company_id, must_set_password FROM users WHERE id = $1 AND role = $2',
    [clientId, 'client']
  );

  const client = clientResult.rows[0];
  if (!client) {
    return res.status(404).json({ error: 'Cliente não encontrado' });
  }
  if (!canManageCompany(req.user, client.company_id) || !canManageCompany(req.user, targetCompanyId)) {
    return res.status(403).json({ error: 'Você não pode transferir este cliente entre essas empresas' });
  }
  if (client.must_set_password) {
    return res.status(409).json({ error: 'Cancele o cliente pendente e crie um novo convite na empresa correta' });
  }

  if (client.company_id === targetCompanyId) {
    return res.status(400).json({ error: 'Cliente já pertence a esta empresa' });
  }

  const companyResult = await query('SELECT id FROM companies WHERE id = $1', [targetCompanyId]);
  if (companyResult.rowCount === 0) {
    return res.status(404).json({ error: 'Empresa de destino não encontrada' });
  }

  const existingEmail = await query(
    'SELECT id FROM users WHERE company_id = $1 AND LOWER(BTRIM(email)) = LOWER(BTRIM($2))',
    [targetCompanyId, client.email]
  );

  if (existingEmail.rowCount > 0) {
    return res.status(409).json({ error: 'E-mail já existe na empresa de destino' });
  }

  const updated = await query(
    `UPDATE users
     SET company_id = $1
     WHERE id = $2
     RETURNING id, email, role, is_active AS "isActive", company_id AS "companyId"`,
    [targetCompanyId, clientId]
  );

  const companyNameResult = await query('SELECT name FROM companies WHERE id = $1', [targetCompanyId]);
  const companyName = companyNameResult.rows[0]?.name || null;

  await logAudit({
    companyId: targetCompanyId,
    userId: req.user.id,
    action: 'client.transfer_company',
    resourceType: 'user',
    resourceId: String(clientId),
    metadata: { fromCompanyId: client.company_id, toCompanyId: targetCompanyId },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.json({ client: { ...updated.rows[0], companyName } });
});

// Delete client (admin only)
router.delete('/clients/:clientId', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso de administrador obrigatório' });
  }

  const clientId = Number(req.params.clientId);
  if (!Number.isInteger(clientId)) return res.status(400).json({ error: 'clientId inválido' });

  const userResult = await query(
    'SELECT id, company_id, email FROM users WHERE id = $1 AND role = $2',
    [clientId, 'client']
  );

  const client = userResult.rows[0];
  if (!client) {
    return res.status(404).json({ error: 'Cliente não encontrado' });
  }
  if (!canManageCompany(req.user, client.company_id)) {
    return res.status(403).json({ error: 'Você não pode gerenciar este cliente' });
  }

  await query('DELETE FROM users WHERE id = $1', [clientId]);

  await logAudit({
    companyId: client.company_id,
    userId: req.user.id,
    action: 'client.delete',
    resourceType: 'user',
    resourceId: String(clientId),
    metadata: { email: client.email },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.json({ success: true });
});

// Inspect a one-time client invitation. The raw token is never stored.
router.post('/invitations/inspect', async (req, res) => {
  const token = String(req.body.token || '');
  if (token.length < 32 || token.length > 256) {
    return res.status(403).json({ error: 'Convite inválido ou expirado' });
  }

  const result = await query(
    `SELECT ci.expires_at, ci.accepted_at, ci.revoked_at, ci.delivery_status,
            u.email, u.must_set_password, c.name AS company_name
       FROM client_invitations ci
       JOIN users u ON u.id = ci.user_id AND u.role = 'client'
       JOIN companies c ON c.id = ci.company_id
      WHERE ci.token_hash = $1`,
    [hashToken(token)]
  );
  const invitation = result.rows[0];
  const state = invitationState(invitation);
  if (state !== 'pending' || !invitation.must_set_password) {
    return res.status(403).json({ error: 'Convite inválido ou expirado' });
  }

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    invitation: {
      email: invitation.email,
      companyName: invitation.company_name,
      expiresAt: invitation.expires_at,
    }
  });
});

// Accept a one-time invitation and choose a password unknown to the administrator.
router.post('/invitations/accept', async (req, res) => {
  const token = String(req.body.token || '');
  const passwordError = getPasswordValidationError(req.body.password);
  if (token.length < 32 || token.length > 256 || passwordError) {
    return res.status(400).json({ error: passwordError || 'Convite inválido' });
  }

  const passwordHash = await bcrypt.hash(req.body.password, 12);
  const db = await pool.connect();
  let accepted;
  try {
    await db.query('BEGIN');
    const result = await db.query(
      `SELECT ci.id, ci.user_id, ci.company_id, ci.expires_at, ci.accepted_at,
              ci.revoked_at, ci.delivery_status, u.email, u.must_set_password,
              c.name AS company_name
         FROM client_invitations ci
         JOIN users u ON u.id = ci.user_id AND u.role = 'client'
         JOIN companies c ON c.id = ci.company_id
        WHERE ci.token_hash = $1
        FOR UPDATE OF ci, u`,
      [hashToken(token)]
    );
    const invitation = result.rows[0];
    if (invitationState(invitation) !== 'pending' || !invitation.must_set_password) {
      await db.query('ROLLBACK');
      return res.status(403).json({ error: 'Convite inválido ou expirado' });
    }

    await db.query(
      `UPDATE users
          SET password_hash = $1, is_active = TRUE, must_set_password = FALSE,
              email_verified_at = COALESCE(email_verified_at, NOW()), password_changed_at = NOW(),
              last_login_at = NOW()
        WHERE id = $2`,
      [passwordHash, invitation.user_id]
    );
    await db.query('UPDATE client_invitations SET accepted_at = NOW() WHERE id = $1', [invitation.id]);
    await db.query(
      `UPDATE client_invitations SET revoked_at = NOW()
        WHERE user_id = $1 AND id <> $2 AND accepted_at IS NULL AND revoked_at IS NULL`,
      [invitation.user_id, invitation.id]
    );
    await db.query('UPDATE password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [invitation.user_id]);
    await db.query('COMMIT');
    accepted = invitation;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }

  await logAudit({
    companyId: accepted.company_id,
    userId: accepted.user_id,
    action: 'client.invite.accepted',
    resourceType: 'user',
    resourceId: String(accepted.user_id),
    metadata: { email: accepted.email },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
  const user = {
    id: accepted.user_id,
    email: accepted.email,
    role: 'client',
    company_id: accepted.company_id,
    company_name: accepted.company_name,
  };
  const accessToken = createAccessToken(user);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    success: true,
    token: accessToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      companyId: user.company_id,
      companyName: user.company_name,
    },
  });
});

// Request password reset
router.post('/password/forgot', async (req, res) => {
  const { email, company } = req.body;
  if (!email || !company) {
    return res.status(400).json({ error: 'E-mail e empresa são obrigatórios' });
  }

  let normalizedEmail;
  try {
    normalizedEmail = normalizeEmail(email);
  } catch {
    return res.json({ success: true });
  }
  const userResult = await query(
    `SELECT users.id, users.company_id
     FROM users
     JOIN companies ON companies.id = users.company_id
     WHERE LOWER(BTRIM(users.email)) = $1
       AND LOWER(BTRIM(companies.name)) = LOWER(BTRIM($2))
       AND users.is_active = TRUE AND users.must_set_password = FALSE`,
    [normalizedEmail, company]
  );

  const user = userResult.rows[0];
  if (!user) {
    return res.json({ success: true });
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + resetTokenTtlMinutes * 60 * 1000);

  await query('UPDATE password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [user.id]);
  await query('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [user.id, tokenHash, expiresAt]);

  const resetLink = `${normalizedFrontendBaseUrl()}/reset#token=${encodeURIComponent(rawToken)}`;

  try {
    await sendPasswordResetEmail({ to: normalizedEmail, resetLink });
  } catch (error) {
    console.error('[password reset delivery]', { requestId: req.requestId, code: error.code || 'EMAIL_DELIVERY_FAILED' });
    return res.json({ success: true });
  }

  await logAudit({
    companyId: user.company_id,
    userId: user.id,
    action: 'auth.password_forgot',
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.json({ success: true });
});

// Reset password
router.post('/password/reset', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: 'Token e nova senha são obrigatórios' });
  }

  const passwordError = getPasswordValidationError(password);
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const db = await pool.connect();
  let resetRow;
  try {
    await db.query('BEGIN');
    const result = await db.query(
      `SELECT password_resets.id, password_resets.user_id, password_resets.expires_at,
              password_resets.used_at, users.company_id
         FROM password_resets
         JOIN users ON users.id = password_resets.user_id
        WHERE password_resets.token_hash = $1
        FOR UPDATE OF password_resets`,
      [hashToken(token)]
    );
    resetRow = result.rows[0];
    if (!resetRow || resetRow.used_at || new Date(resetRow.expires_at) <= new Date()) {
      await db.query('ROLLBACK');
      return res.status(403).json({ error: 'Token inválido ou expirado' });
    }
    await db.query(
      'UPDATE users SET password_hash = $1, password_changed_at = NOW() WHERE id = $2',
      [passwordHash, resetRow.user_id]
    );
    await db.query('UPDATE password_resets SET used_at = NOW() WHERE id = $1', [resetRow.id]);
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }

  await logAudit({
    companyId: resetRow.company_id,
    userId: resetRow.user_id,
    action: 'auth.password_reset',
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.json({ success: true });
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  const result = await query(
    `SELECT users.id, users.email, users.role, users.company_id AS "companyId", companies.name AS "companyName"
     FROM users
     LEFT JOIN companies ON companies.id = users.company_id
     WHERE users.id = $1`,
    [req.user.id]
  );

  const user = result.rows[0];
  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }

  res.json({ user });
});

// SSO login via Chave Mestra
router.post('/sso/chave-mestra', async (req, res) => {
  const { code, redirectUri } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'Código de autorização é obrigatório' });
  }

  try {
    // 1. Exchange code for token
    const tokenResponse = await fetch(`https://chavemestragestao.com.br/api/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.CHAVEMESTRA_CLIENT_ID,
        client_secret: process.env.CHAVEMESTRA_CLIENT_SECRET,
        redirect_uri: redirectUri || `${process.env.FRONTEND_BASE_URL}/sso/callback`
      })
    });

    if (!tokenResponse.ok) {
      return res.status(401).json({ error: 'Falha na autenticação SSO' });
    }

    const { access_token } = await tokenResponse.json();

    // 2. Get user info
    const userInfoResponse = await fetch(`https://chavemestragestao.com.br/api/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    if (!userInfoResponse.ok) {
      return res.status(401).json({ error: 'Falha ao obter dados do usuário' });
    }

    const profile = await userInfoResponse.json();
    const email = profile.email.toLowerCase();

    // 3. Find user
    const userResult = await query(
      `SELECT users.id, users.email, users.role, users.company_id, users.is_active,
              users.must_set_password, companies.name AS company_name
       FROM users
       LEFT JOIN companies ON companies.id = users.company_id
       WHERE LOWER(users.email) = $1`,
      [email]
    );

    const user = userResult.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Conta não encontrada para este e-mail. Crie uma conta primeiro.' });
    }

    if (!user.is_active || user.must_set_password) {
      return res.status(403).json({ error: 'Usuário inativo' });
    }

    const token = createAccessToken(user);
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    await logAudit({
      companyId: user.company_id,
      userId: user.id,
      action: 'auth.login_sso',
      metadata: { email: user.email, provider: 'chave-mestra' },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role, companyId: user.company_id, companyName: user.company_name }
    });
  } catch (error) {
    console.error('SSO Error:', error);
    res.status(500).json({ error: 'Erro interno no SSO' });
  }
});

module.exports = { router, authenticateToken };
