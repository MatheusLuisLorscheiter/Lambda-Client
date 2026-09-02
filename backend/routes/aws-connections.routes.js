const express = require('express');
const { authenticateToken } = require('./auth');
const { pool, query } = require('../db');
const { encrypt } = require('../security/crypto');
const { logAudit } = require('../audit/logger');
const {
  normalizeRegion,
  encryptedConnectionCredentials,
  plainConnectionCredentials,
  validateAwsIdentity,
  listLambdaFunctions,
  sanitizeAwsConnectionError
} = require('../services/awsConnections');

const router = express.Router();

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Acesso de administrador obrigatório' });
  next();
};

const parsePositiveId = (value, label) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error(`${label} inválido.`);
    error.statusCode = 400;
    throw error;
  }
  return id;
};

const getConnection = async (id) => {
  const result = await query(
    `SELECT aws_connections.*, companies.name AS company_name,
            (SELECT COUNT(*)::int FROM integrations WHERE aws_connection_id = aws_connections.id) AS integration_count
       FROM aws_connections
       JOIN companies ON companies.id = aws_connections.company_id
      WHERE aws_connections.id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

const serializeConnection = (row) => ({
  id: row.id,
  name: row.name,
  companyId: row.company_id,
  companyName: row.company_name,
  defaultRegion: row.default_region,
  accessKeyHint: row.access_key_hint,
  accountId: row.external_account_id,
  lastCheckStatus: row.last_check_status,
  lastCheckMessage: row.last_check_message,
  lastCheckedAt: row.last_checked_at,
  integrationCount: Number(row.integration_count || 0),
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

router.get('/aws-connections', authenticateToken, requireAdmin, async (_req, res) => {
  const result = await query(
    `SELECT aws_connections.*, companies.name AS company_name,
            (SELECT COUNT(*)::int FROM integrations WHERE aws_connection_id = aws_connections.id) AS integration_count
       FROM aws_connections
       JOIN companies ON companies.id = aws_connections.company_id
      ORDER BY companies.name, aws_connections.name`
  );
  res.json({ connections: result.rows.map(serializeConnection) });
});

router.post('/aws-connections', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const companyId = parsePositiveId(req.body.companyId, 'Empresa');
    const defaultRegion = normalizeRegion(req.body.defaultRegion);
    const credentials = plainConnectionCredentials(req.body);
    if (!name || name.length > 120) return res.status(400).json({ error: 'Nome da conexão inválido.' });

    const company = await query('SELECT id FROM companies WHERE id = $1', [companyId]);
    if (!company.rowCount) return res.status(400).json({ error: 'Empresa não encontrada.' });

    const identity = await validateAwsIdentity({ credentials, region: defaultRegion });
    const created = await query(
      `INSERT INTO aws_connections
        (company_id, name, default_region, access_key_encrypted, secret_key_encrypted, access_key_hint,
         external_account_id, last_check_status, last_check_message, last_checked_at, owner_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'healthy', 'Identidade AWS validada.', NOW(), $8)
       RETURNING *`,
      [companyId, name, defaultRegion, encrypt(credentials.accessKeyId), encrypt(credentials.secretAccessKey), `…${credentials.accessKeyId.slice(-4)}`, identity.accountId, req.user.id]
    );
    const row = { ...created.rows[0], company_name: (await query('SELECT name FROM companies WHERE id = $1', [companyId])).rows[0].name, integration_count: 0 };
    await logAudit({ companyId, userId: req.user.id, action: 'aws_connection.create', resourceType: 'aws_connection', resourceId: String(row.id), metadata: { name, defaultRegion, accountId: identity.accountId }, ipAddress: req.ip, userAgent: req.get('user-agent') });
    res.status(201).json({ connection: serializeConnection(row) });
  } catch (error) {
    const failure = sanitizeAwsConnectionError(error);
    const status = error.statusCode || (failure.code === 'AWS_CREDENTIALS_REJECTED' ? 400 : 502);
    res.status(status).json({ error: error.statusCode ? error.message : failure.message, code: error.statusCode ? 'VALIDATION_ERROR' : failure.code });
  }
});

router.patch('/aws-connections/:connectionId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const id = parsePositiveId(req.params.connectionId, 'Conexão');
    const current = await getConnection(id);
    if (!current) return res.status(404).json({ error: 'Conexão AWS não encontrada.' });
    const name = req.body.name === undefined ? current.name : String(req.body.name || '').trim();
    const defaultRegion = req.body.defaultRegion === undefined ? current.default_region : normalizeRegion(req.body.defaultRegion);
    if (!name || name.length > 120) return res.status(400).json({ error: 'Nome da conexão inválido.' });

    let accessEncrypted = current.access_key_encrypted;
    let secretEncrypted = current.secret_key_encrypted;
    let accessKeyHint = current.access_key_hint;
    let accountId = current.external_account_id;
    if (req.body.accessKeyId || req.body.secretAccessKey) {
      const credentials = plainConnectionCredentials(req.body);
      const identity = await validateAwsIdentity({ credentials, region: defaultRegion });
      accessEncrypted = encrypt(credentials.accessKeyId);
      secretEncrypted = encrypt(credentials.secretAccessKey);
      accessKeyHint = `…${credentials.accessKeyId.slice(-4)}`;
      accountId = identity.accountId;
    }
    await query(
      `UPDATE aws_connections SET name = $1, default_region = $2, access_key_encrypted = $3,
              secret_key_encrypted = $4, access_key_hint = $5, external_account_id = $6,
              updated_at = NOW()
        WHERE id = $7`,
      [name, defaultRegion, accessEncrypted, secretEncrypted, accessKeyHint, accountId, id]
    );
    await logAudit({ companyId: current.company_id, userId: req.user.id, action: 'aws_connection.update', resourceType: 'aws_connection', resourceId: String(id), metadata: { name, defaultRegion, credentialsRotated: Boolean(req.body.accessKeyId || req.body.secretAccessKey) }, ipAddress: req.ip, userAgent: req.get('user-agent') });
    res.json({ connection: serializeConnection(await getConnection(id)) });
  } catch (error) {
    const failure = sanitizeAwsConnectionError(error);
    res.status(error.statusCode || 502).json({ error: error.statusCode ? error.message : failure.message, code: error.statusCode ? 'VALIDATION_ERROR' : failure.code });
  }
});

router.post('/aws-connections/:connectionId/test', authenticateToken, requireAdmin, async (req, res) => {
  const id = Number(req.params.connectionId);
  const connection = await getConnection(id);
  if (!connection) return res.status(404).json({ error: 'Conexão AWS não encontrada.' });
  try {
    const identity = await validateAwsIdentity({ credentials: encryptedConnectionCredentials(connection), region: connection.default_region });
    await query("UPDATE aws_connections SET external_account_id = $1, last_check_status = 'healthy', last_check_message = 'Identidade AWS validada.', last_checked_at = NOW(), updated_at = NOW() WHERE id = $2", [identity.accountId, id]);
    await logAudit({ companyId: connection.company_id, userId: req.user.id, action: 'aws_connection.test', resourceType: 'aws_connection', resourceId: String(id), metadata: { status: 'healthy', accountId: identity.accountId }, ipAddress: req.ip, userAgent: req.get('user-agent') });
    res.json({ status: 'healthy', message: 'Conexão AWS validada.', accountId: identity.accountId });
  } catch (error) {
    const failure = sanitizeAwsConnectionError(error);
    await query("UPDATE aws_connections SET last_check_status = 'unavailable', last_check_message = $1, last_checked_at = NOW(), updated_at = NOW() WHERE id = $2", [failure.message, id]);
    res.status(502).json({ status: 'unavailable', error: failure.message, code: failure.code });
  }
});

router.get('/aws-connections/:connectionId/functions', authenticateToken, requireAdmin, async (req, res) => {
  const connection = await getConnection(Number(req.params.connectionId));
  if (!connection) return res.status(404).json({ error: 'Conexão AWS não encontrada.' });
  try {
    const region = normalizeRegion(req.query.region, connection.default_region);
    const functions = await listLambdaFunctions({ credentials: encryptedConnectionCredentials(connection), region });
    const imported = await query(
      `SELECT function_name, id, aws_connection_id FROM integrations
        WHERE company_id = $1 AND region = $2`,
      [connection.company_id, region]
    );
    const importedByName = new Map(imported.rows.map(row => [row.function_name, { id: row.id, connectionId: row.aws_connection_id }]));
    res.json({
      region,
      functions: functions.map(fn => ({
        functionName: fn.FunctionName,
        functionArn: fn.FunctionArn,
        runtime: fn.Runtime,
        memorySize: fn.MemorySize,
        timeout: fn.Timeout,
        lastModified: fn.LastModified,
        codeSize: fn.CodeSize,
        description: fn.Description || '',
        importedIntegrationId: importedByName.get(fn.FunctionName)?.id || null,
        importedWithConnectionId: importedByName.get(fn.FunctionName)?.connectionId || null
      }))
    });
  } catch (error) {
    const failure = sanitizeAwsConnectionError(error);
    res.status(502).json({ error: failure.message, code: failure.code });
  }
});

router.post('/aws-connections/:connectionId/import', authenticateToken, requireAdmin, async (req, res) => {
  const connection = await getConnection(Number(req.params.connectionId));
  if (!connection) return res.status(404).json({ error: 'Conexão AWS não encontrada.' });
  try {
    const region = normalizeRegion(req.body.region, connection.default_region);
    const requested = [...new Set((Array.isArray(req.body.functionNames) ? req.body.functionNames : []).map(value => String(value).trim()).filter(Boolean))];
    if (!requested.length || requested.length > 100) return res.status(400).json({ error: 'Selecione entre 1 e 100 funções.' });
    const available = await listLambdaFunctions({ credentials: encryptedConnectionCredentials(connection), region });
    const byName = new Map(available.map(fn => [fn.FunctionName, fn]));
    if (requested.some(name => !byName.has(name))) return res.status(400).json({ error: 'Uma ou mais funções não foram encontradas na conexão e região selecionadas.' });

    const client = await pool.connect();
    const imported = [];
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`aws-connection-import:${connection.company_id}:${region}`]);
      for (const functionName of requested) {
        const fn = byName.get(functionName);
        const existing = await client.query(
          `SELECT id, name, function_name, region, memory_mb, aws_connection_id
             FROM integrations
            WHERE company_id = $1 AND region = $2 AND function_name = $3
            ORDER BY id ASC
            LIMIT 1
            FOR UPDATE`,
          [connection.company_id, region, functionName]
        );
        if (existing.rows[0]) {
          const current = existing.rows[0];
          if (!current.aws_connection_id) {
            const attached = await client.query(
              `UPDATE integrations
                  SET aws_connection_id = $1, access_key_encrypted = NULL, secret_key_encrypted = NULL
                WHERE id = $2
                RETURNING id, name, function_name AS "functionName", region, memory_mb AS "memoryMb"`,
              [connection.id, current.id]
            );
            imported.push({ ...attached.rows[0], attachedExisting: true });
          }
          continue;
        }
        const result = await client.query(
          `INSERT INTO integrations
            (company_id, name, function_name, region, memory_mb, show_cost_estimate, documentation_links,
             aws_connection_id, access_key_encrypted, secret_key_encrypted, owner_user_id, client_user_id)
           VALUES ($1, $2, $3, $4, $5, TRUE, '[]', $6, NULL, NULL, $7, NULL)
           ON CONFLICT (company_id, aws_connection_id, region, function_name) WHERE aws_connection_id IS NOT NULL
           DO NOTHING
           RETURNING id, name, function_name AS "functionName", region, memory_mb AS "memoryMb"`,
          [connection.company_id, functionName, functionName, region, Number(fn.MemorySize || 128), connection.id, req.user.id]
        );
        if (result.rows[0]) imported.push({ ...result.rows[0], attachedExisting: false });
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await logAudit({ companyId: connection.company_id, userId: req.user.id, action: 'aws_connection.functions_import', resourceType: 'aws_connection', resourceId: String(connection.id), metadata: { region, requested, importedIntegrationIds: imported.map(item => item.id) }, ipAddress: req.ip, userAgent: req.get('user-agent') });
    res.status(201).json({ imported, skipped: requested.length - imported.length });
  } catch (error) {
    const failure = sanitizeAwsConnectionError(error);
    res.status(error.statusCode || (error.message?.startsWith('Selecione') || error.message?.startsWith('Uma ou mais') ? 400 : 502)).json({ error: error.statusCode ? error.message : (failure.code === 'AWS_CONNECTION_FAILED' && error.message ? error.message : failure.message), code: error.statusCode ? 'VALIDATION_ERROR' : failure.code });
  }
});

router.delete('/aws-connections/:connectionId', authenticateToken, requireAdmin, async (req, res) => {
  const connection = await getConnection(Number(req.params.connectionId));
  if (!connection) return res.status(404).json({ error: 'Conexão AWS não encontrada.' });
  if (Number(connection.integration_count) > 0) return res.status(409).json({ error: 'Remova ou mova as integrações vinculadas antes de excluir a conexão.' });
  await query('DELETE FROM aws_connections WHERE id = $1', [connection.id]);
  await logAudit({ companyId: connection.company_id, userId: req.user.id, action: 'aws_connection.delete', resourceType: 'aws_connection', resourceId: String(connection.id), metadata: { name: connection.name }, ipAddress: req.ip, userAgent: req.get('user-agent') });
  res.json({ success: true });
});

module.exports = router;
