const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const router = express.Router();
const { query } = require('../db');
const { logAudit } = require('../audit/logger');
const { sendPasswordResetEmail, sendClientInviteEmail } = require('../email/resend');

const accessTokenTtl = process.env.ACCESS_TOKEN_TTL || '15m';
const resetTokenTtlMinutes = Number(process.env.RESET_TOKEN_TTL_MINUTES || 30);

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const createAccessToken = (user) => jwt.sign(
  { id: user.id, email: user.email, role: user.role, companyId: user.company_id },
  process.env.JWT_SECRET,
  { expiresIn: accessTokenTtl }
);

// Login
router.post('/login', async (req, res) => {
  const { email, password, company } = req.body;

  if (!email || !password || !company) {
    return res.status(400).json({ error: 'E-mail, senha e empresa são obrigatórios' });
  }

  const result = await query(
    `SELECT users.id, users.email, users.password_hash, users.role, users.company_id, companies.name AS company_name
     FROM users
     JOIN companies ON companies.id = users.company_id
     WHERE users.email = $1 AND companies.name = $2 AND users.is_active = TRUE`,
    [email, company]
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

// Middleware to verify token
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acesso obrigatório' });
  }

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    const userResult = await query('SELECT id, is_active FROM users WHERE id = $1', [user.id]);
    const storedUser = userResult.rows[0];

    if (!storedUser || !storedUser.is_active) {
      return res.status(403).json({ error: 'Usuário inativo' });
    }

    req.user = user;
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
  const { email } = req.body;
  const normalizedEmail = (email || '').toString().trim().toLowerCase();

  if (!normalizedEmail) {
    return res.status(400).json({ error: 'E-mail é obrigatório' });
  }

  const result = await query(
    `SELECT DISTINCT companies.name
     FROM users
     JOIN companies ON companies.id = users.company_id
     WHERE LOWER(users.email) = $1
     ORDER BY companies.name ASC`,
    [normalizedEmail]
  );

  res.json({ companies: result.rows.map(row => row.name) });
});

// List companies (admin only)
router.get('/companies', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso de administrador obrigatório' });
  }

  const result = await query(
    'SELECT id, name, created_at AS "createdAt" FROM companies ORDER BY name ASC'
  );

  res.json({ companies: result.rows });
});

// Create company (admin only)
router.post('/companies', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso de administrador obrigatório' });
  }

  const { name } = req.body;
  const normalizedName = (name || '').toString().trim();

  if (!normalizedName) {
    return res.status(400).json({ error: 'Nome da empresa é obrigatório' });
  }

  try {
    const result = await query(
      'INSERT INTO companies (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id, name, created_at AS "createdAt"',
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

  if (scope !== 'all') {
    const targetCompanyId = companyIdParam || req.user.companyId;
    conditions.push(`users.company_id = $${idx++}`);
    values.push(targetCompanyId);
  } else if (companyIdParam) {
    conditions.push(`users.company_id = $${idx++}`);
    values.push(companyIdParam);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT users.id, users.email, users.role, users.is_active AS "isActive",
            users.company_id AS "companyId", companies.name AS "companyName"
     FROM users
     JOIN companies ON companies.id = users.company_id
     ${whereClause}
     ORDER BY users.email ASC`,
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

  const { email, password, companyId, companyName } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
  }

  let resolvedCompanyId = companyId ? Number(companyId) : null;

  if (!resolvedCompanyId && companyName) {
    const normalizedCompanyName = companyName.toString().trim();
    if (!normalizedCompanyName) {
      return res.status(400).json({ error: 'Nome da empresa é obrigatório' });
    }

    const companyResult = await query(
      'INSERT INTO companies (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id, name',
      [normalizedCompanyName]
    );

    resolvedCompanyId = companyResult.rows[0].id;
  }

  if (!resolvedCompanyId) {
    resolvedCompanyId = req.user.companyId;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const result = await query(
      'INSERT INTO users (company_id, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, email, role, is_active AS "isActive", company_id AS "companyId"',
      [resolvedCompanyId, email, passwordHash, 'client']
    );
    await logAudit({
      companyId: resolvedCompanyId,
      userId: req.user.id,
      action: 'client.create',
      resourceType: 'user',
      resourceId: String(result.rows[0].id),
      metadata: { email, companyId: resolvedCompanyId },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    const companyResult = await query('SELECT name FROM companies WHERE id = $1', [resolvedCompanyId]);
    const companyName = companyResult.rows[0]?.name || 'your company';
    const frontendBaseUrl = process.env.FRONTEND_BASE_URL || 'http://localhost:5173';
    const loginLink = `${frontendBaseUrl}/login`;

    let inviteSent = false;
    try {
      await sendClientInviteEmail({ to: email, companyName, loginLink });
      inviteSent = true;

      await logAudit({
        companyId: resolvedCompanyId,
        userId: req.user.id,
        action: 'client.invite.send',
        resourceType: 'user',
        resourceId: String(result.rows[0].id),
        metadata: { email },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    } catch (inviteError) {
      inviteSent = false;
    }

    res.json({ client: result.rows[0], inviteSent });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'E-mail já existe' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Update client status (admin only)
router.patch('/clients/:clientId/status', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso de administrador obrigatório' });
  }

  const clientId = Number(req.params.clientId);
  const { isActive } = req.body;

  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ error: 'isActive deve ser booleano' });
  }

  const userResult = await query(
    'SELECT id, company_id FROM users WHERE id = $1 AND role = $2',
    [clientId, 'client']
  );

  const client = userResult.rows[0];
  if (!client) {
    return res.status(404).json({ error: 'Cliente não encontrado' });
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

  const clientResult = await query(
    `SELECT users.id, users.email, users.company_id, companies.name AS company_name
     FROM users
     JOIN companies ON companies.id = users.company_id
     WHERE users.id = $1 AND users.role = $2`,
    [clientId, 'client']
  );

  const client = clientResult.rows[0];
  if (!client) {
    return res.status(404).json({ error: 'Cliente não encontrado' });
  }

  const frontendBaseUrl = process.env.FRONTEND_BASE_URL || 'http://localhost:5173';
  const loginLink = `${frontendBaseUrl}/login`;

  try {
    await sendClientInviteEmail({
      to: client.email,
      companyName: client.company_name,
      loginLink
    });

    await logAudit({
      companyId: client.company_id,
      userId: req.user.id,
      action: 'client.invite.resend',
      resourceType: 'user',
      resourceId: String(clientId),
      metadata: { email: client.email },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Falha ao enviar e-mail de convite' });
  }
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

  const clientResult = await query(
    'SELECT id, email, company_id FROM users WHERE id = $1 AND role = $2',
    [clientId, 'client']
  );

  const client = clientResult.rows[0];
  if (!client) {
    return res.status(404).json({ error: 'Cliente não encontrado' });
  }

  if (client.company_id === targetCompanyId) {
    return res.status(400).json({ error: 'Cliente já pertence a esta empresa' });
  }

  const companyResult = await query('SELECT id FROM companies WHERE id = $1', [targetCompanyId]);
  if (companyResult.rowCount === 0) {
    return res.status(404).json({ error: 'Empresa de destino não encontrada' });
  }

  const existingEmail = await query(
    'SELECT id FROM users WHERE company_id = $1 AND email = $2',
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

  const userResult = await query(
    'SELECT id, company_id, email FROM users WHERE id = $1 AND role = $2',
    [clientId, 'client']
  );

  const client = userResult.rows[0];
  if (!client) {
    return res.status(404).json({ error: 'Cliente não encontrado' });
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

// Request password reset
router.post('/password/forgot', async (req, res) => {
  const { email, company } = req.body;
  if (!email || !company) {
    return res.status(400).json({ error: 'E-mail e empresa são obrigatórios' });
  }

  const userResult = await query(
    `SELECT users.id, users.company_id
     FROM users
     JOIN companies ON companies.id = users.company_id
     WHERE users.email = $1 AND companies.name = $2`,
    [email, company]
  );

  const user = userResult.rows[0];
  if (!user) {
    return res.json({ success: true });
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + resetTokenTtlMinutes * 60 * 1000);

  await query(
    'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [user.id, tokenHash, expiresAt]
  );

  const frontendBaseUrl = process.env.FRONTEND_BASE_URL || 'http://localhost:5173';
  const resetLink = `${frontendBaseUrl}/reset/${rawToken}`;

  try {
    await sendPasswordResetEmail({ to: email, resetLink });
  } catch (error) {
    return res.status(500).json({ error: 'Falha ao enviar e-mail de redefinição' });
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

  const tokenHash = hashToken(token);
  const result = await query(
    `SELECT password_resets.id, password_resets.user_id, password_resets.expires_at, password_resets.used_at,
            users.company_id
     FROM password_resets
     JOIN users ON users.id = password_resets.user_id
     WHERE password_resets.token_hash = $1`,
    [tokenHash]
  );

  const resetRow = result.rows[0];
  if (!resetRow || resetRow.used_at || new Date(resetRow.expires_at) < new Date()) {
    return res.status(403).json({ error: 'Token inválido ou expirado' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, resetRow.user_id]);
  await query('UPDATE password_resets SET used_at = NOW() WHERE id = $1', [resetRow.id]);

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
router.get('/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

module.exports = { router, authenticateToken };