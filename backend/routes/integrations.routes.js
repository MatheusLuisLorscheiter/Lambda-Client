const express = require('express');
const { authenticateToken } = require('./auth');
const { pool, query } = require('../db');
const { encrypt } = require('../security/crypto');
const { logAudit } = require('../audit/logger');
const { getIntegrationForUser, normalizeDocumentationLinks } = require('../services/integrations');
const { LambdaClient, GetFunctionCommand } = require('@aws-sdk/client-lambda');
const { decrypt } = require('../security/crypto');
const { classifyIntegrationHealthError } = require('../services/integrationHealth');

const router = express.Router();
const validProcessStatuses = new Set(['requested', 'analysis', 'queued', 'in_progress', 'validation', 'delivered', 'paused']);

const processSelect = `
  COALESCE(
    (
      SELECT json_agg(
        json_build_object('id', process_items.id, 'title', process_items.title, 'status', process_items.status)
        ORDER BY process_items.updated_at DESC
      )
      FROM process_integrations
      JOIN process_items ON process_items.id = process_integrations.process_id
      WHERE process_integrations.integration_id = integrations.id
        AND process_items.company_id = integrations.company_id
    ),
    '[]'::json
  ) AS processes
`;

const normalizeProcessIds = (processIds) => {
  if (processIds === undefined) return undefined;
  if (!Array.isArray(processIds)) throw new Error('Lista de processos inválida');

  const normalized = [...new Set(processIds.map(Number))];
  if (normalized.some(id => !Number.isInteger(id) || id <= 0)) {
    throw new Error('Lista de processos inválida');
  }
  return normalized;
};

const syncIntegrationProcesses = async ({
  db,
  integrationId,
  companyId,
  processIds = [],
  createProcess,
  integrationName
}) => {
  const ids = [...processIds];

  if (ids.length) {
    const result = await db.query(
      'SELECT id FROM process_items WHERE company_id = $1 AND id = ANY($2::int[])',
      [companyId, ids]
    );
    if (result.rowCount !== ids.length) {
      throw new Error('Um ou mais processos não pertencem à empresa selecionada');
    }
  }

  if (createProcess?.enabled) {
    const title = String(createProcess.title || `Implantação: ${integrationName}`).trim();
    const description = String(
      createProcess.description || `Processo de implantação e acompanhamento da automação ${integrationName}.`
    ).trim();
    const status = validProcessStatuses.has(createProcess.status) ? createProcess.status : 'in_progress';

    if (!title || title.length > 160 || !description || description.length > 5000) {
      throw new Error('Dados do novo processo são inválidos');
    }

    const created = await db.query(
      `INSERT INTO process_items
        (company_id, requested_by, title, description, category, status, priority, progress, latest_update, delivered_at)
       VALUES ($1, $2, $3, $4, 'automation', $5, 'normal', $6, $7, $8)
       RETURNING id`,
      [
        companyId,
        null,
        title,
        description,
        status,
        status === 'delivered' ? 100 : 0,
        status === 'delivered'
          ? 'Automação vinculada e registrada como entregue.'
          : 'Automação vinculada ao processo. Acompanhe aqui as próximas atualizações.',
        status === 'delivered' ? new Date() : null
      ]
    );
    const createdProcessId = created.rows[0].id;
    const initialUpdate = status === 'delivered'
      ? 'Automação vinculada e registrada como entregue.'
      : 'Automação vinculada ao processo. Acompanhe aqui as próximas atualizações.';
    await db.query(
      'INSERT INTO process_updates (process_id, author_user_id, message) VALUES ($1, $2, $3)',
      [createdProcessId, null, initialUpdate]
    );
    ids.push(createdProcessId);
  }

  await db.query('DELETE FROM process_integrations WHERE integration_id = $1', [integrationId]);
  for (const processId of ids) {
    await db.query(
      `INSERT INTO process_integrations (process_id, integration_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [processId, integrationId]
    );
  }

  const linked = await db.query(
    `SELECT process_items.id, process_items.title, process_items.status
       FROM process_integrations
       JOIN process_items ON process_items.id = process_integrations.process_id
      WHERE process_integrations.integration_id = $1
      ORDER BY process_items.updated_at DESC`,
    [integrationId]
  );
  return linked.rows;
};

// Get integrations for user
router.get('/integrations', authenticateToken, async (req, res) => {
  if (req.user.role === 'admin') {
    const result = await query(
      `SELECT integrations.id,
              integrations.name,
              integrations.function_name AS "functionName",
              integrations.region,
              integrations.memory_mb AS "memoryMb",
              integrations.show_cost_estimate AS "showCostEstimate",
              integrations.lifecycle_status AS "lifecycleStatus",
              integrations.last_check_status AS "lastCheckStatus",
              integrations.last_check_message AS "lastCheckMessage",
              integrations.last_checked_at AS "lastCheckedAt",
              integrations.documentation_links AS "documentationLinks",
              integrations.company_id AS "companyId",
              companies.name AS "companyName",
              integrations.owner_user_id AS "userId",
              integrations.client_user_id AS "clientId",
              ${processSelect}
       FROM integrations
       JOIN companies ON companies.id = integrations.company_id
       ORDER BY integrations.id DESC`
    );
    return res.json({ integrations: result.rows });
  }
  if (req.user.role === 'client') {
    const result = await query(
      `SELECT integrations.id,
              integrations.name,
              integrations.function_name AS "functionName",
              integrations.region,
              integrations.memory_mb AS "memoryMb",
              integrations.show_cost_estimate AS "showCostEstimate",
              integrations.lifecycle_status AS "lifecycleStatus",
              integrations.last_check_status AS "lastCheckStatus",
              integrations.last_check_message AS "lastCheckMessage",
              integrations.last_checked_at AS "lastCheckedAt",
              integrations.documentation_links AS "documentationLinks",
              integrations.company_id AS "companyId",
              companies.name AS "companyName",
              integrations.owner_user_id AS "userId",
              integrations.client_user_id AS "clientId",
              ${processSelect}
       FROM integrations
       JOIN companies ON companies.id = integrations.company_id
       WHERE integrations.company_id = $1
       ORDER BY integrations.id DESC`,
      [req.user.companyId]
    );
    return res.json({ integrations: result.rows });
  }

  return res.json({ integrations: [] });
});

// Create integration
router.post('/integrations', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso de administrador obrigatório' });
  }

  const { name, functionName, region, accessKeyId, secretAccessKey, memoryMb, companyId, showCostEstimate, documentationLinks, processIds, createProcess } = req.body;

  if (!name || !functionName || !region || !accessKeyId || !secretAccessKey) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
  }

  let resolvedMemoryMb = 128;
  if (memoryMb !== undefined && memoryMb !== null && memoryMb !== '') {
    const parsedMemory = Number(memoryMb);
    if (!Number.isFinite(parsedMemory) || parsedMemory <= 0) {
      return res.status(400).json({ error: 'Memória inválida' });
    }
    resolvedMemoryMb = Math.round(parsedMemory);
  }

  let resolvedShowCostEstimate = true;
  if (showCostEstimate !== undefined && showCostEstimate !== null && showCostEstimate !== '') {
    if (typeof showCostEstimate === 'string') {
      resolvedShowCostEstimate = !['false', '0', 'no'].includes(showCostEstimate.toLowerCase());
    } else {
      resolvedShowCostEstimate = Boolean(showCostEstimate);
    }
  }

  let resolvedDocumentationLinks = [];
  try {
    resolvedDocumentationLinks = normalizeDocumentationLinks(documentationLinks);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Links de documentação inválidos' });
  }

  const resolvedClientId = null;

  let resolvedCompanyId = req.user.companyId;
  if (companyId) {
    const companyResult = await query('SELECT id FROM companies WHERE id = $1', [Number(companyId)]);
    if (companyResult.rowCount === 0) {
      return res.status(400).json({ error: 'Empresa não encontrada' });
    }
    resolvedCompanyId = Number(companyId);
  }

  if (!resolvedCompanyId) {
    return res.status(400).json({ error: 'companyId é obrigatório' });
  }

  const encryptedAccessKey = encrypt(accessKeyId);
  const encryptedSecretKey = encrypt(secretAccessKey);
  let resolvedProcessIds;
  try {
    resolvedProcessIds = normalizeProcessIds(processIds) || [];
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const client = await pool.connect();
  let result;
  let linkedProcesses;
  try {
    await client.query('BEGIN');
    result = await client.query(
      `INSERT INTO integrations
        (company_id, name, function_name, region, memory_mb, show_cost_estimate, documentation_links, access_key_encrypted, secret_key_encrypted, owner_user_id, client_user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, name, function_name AS "functionName", region, memory_mb AS "memoryMb", show_cost_estimate AS "showCostEstimate", documentation_links AS "documentationLinks", company_id AS "companyId", owner_user_id AS "userId", client_user_id AS "clientId"`,
      [resolvedCompanyId, name, functionName, region, resolvedMemoryMb, resolvedShowCostEstimate, JSON.stringify(resolvedDocumentationLinks), encryptedAccessKey, encryptedSecretKey, req.user.id, resolvedClientId]
    );
    linkedProcesses = await syncIntegrationProcesses({
      db: client,
      integrationId: result.rows[0].id,
      companyId: resolvedCompanyId,
      processIds: resolvedProcessIds,
      createProcess,
      integrationName: name
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(400).json({ error: error.message || 'Falha ao vincular processo' });
  } finally {
    client.release();
  }

  const companyNameResult = await query('SELECT name FROM companies WHERE id = $1', [resolvedCompanyId]);
  const companyName = companyNameResult.rows[0]?.name || null;

  await logAudit({
    companyId: resolvedCompanyId,
    userId: req.user.id,
    action: 'integration.create',
    resourceType: 'integration',
    resourceId: String(result.rows[0].id),
    metadata: {
      name,
      functionName,
      region,
      memoryMb: resolvedMemoryMb,
      companyId: resolvedCompanyId,
      showCostEstimate: resolvedShowCostEstimate,
      documentationLinks: resolvedDocumentationLinks,
      linkedProcessIds: linkedProcesses.map(process => process.id),
      processCreatedFromIntegration: Boolean(createProcess?.enabled)
    },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.json({ integration: { ...result.rows[0], companyName, processes: linkedProcesses } });
});

router.post('/integrations/:integrationId/health-check', authenticateToken, async (req, res) => {
  const integrationId = Number(req.params.integrationId);
  if (!Number.isInteger(integrationId) || integrationId <= 0) {
    return res.status(400).json({ error: 'Integração inválida' });
  }
  const integration = await getIntegrationForUser(integrationId, req.user);
  if (!integration) return res.status(404).json({ error: 'Integração não encontrada' });

  let status = 'healthy';
  let message = 'Credenciais válidas e função acessível.';
  let details = null;
  let failureCode = null;
  try {
    const lambdaClient = new LambdaClient({
      region: integration.region,
      credentials: {
        accessKeyId: decrypt(integration.access_key_encrypted),
        secretAccessKey: decrypt(integration.secret_key_encrypted)
      }
    });
    const result = await lambdaClient.send(new GetFunctionCommand({
      FunctionName: integration.function_name
    }));
    const configuration = result.Configuration || {};
    details = {
      functionName: configuration.FunctionName || integration.function_name,
      state: configuration.State || null,
      lastUpdateStatus: configuration.LastUpdateStatus || null,
      runtime: configuration.Runtime || null,
      memorySize: configuration.MemorySize || null,
      timeout: configuration.Timeout || null,
      lastModified: configuration.LastModified || null,
      codeSize: configuration.CodeSize || null
    };
    if (configuration.State && configuration.State !== 'Active') {
      status = 'degraded';
      message = `A função está no estado ${configuration.State}.`;
    } else if (configuration.LastUpdateStatus === 'Failed') {
      status = 'degraded';
      message = 'A última atualização da função falhou.';
    }
  } catch (error) {
    status = 'unavailable';
    const failure = classifyIntegrationHealthError(error);
    failureCode = failure.code;
    message = failure.message;
    console.warn('[Integration health check failed]', {
      integrationId,
      failureCode,
      errorName: String(error?.name || 'UnknownError')
    });
  }

  await query(
    `UPDATE integrations
        SET last_check_status = $1, last_check_message = $2, last_checked_at = NOW()
      WHERE id = $3`,
    [status, message, integrationId]
  );
  await logAudit({
    companyId: integration.company_id,
    userId: req.user.id,
    action: 'integration.health_check',
    resourceType: 'integration',
    resourceId: String(integrationId),
    metadata: { status, details, failureCode },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  const payload = { status, message, checkedAt: new Date().toISOString(), details, failureCode };
  res.json(payload);
});

// Delete integration
router.delete('/integrations/:integrationId', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso de administrador obrigatório' });
  }

  const integrationId = parseInt(req.params.integrationId);
  const integration = await getIntegrationForUser(integrationId, req.user);

  if (!integration) {
    return res.status(404).json({ error: 'Integração não encontrada' });
  }

  if (req.user.role === 'admin') {
    await query('DELETE FROM integrations WHERE id = $1', [integrationId]);
  } else {
    await query('DELETE FROM integrations WHERE id = $1 AND company_id = $2', [integrationId, req.user.companyId]);
  }

  await logAudit({
    companyId: integration.company_id,
    userId: req.user.id,
    action: 'integration.delete',
    resourceType: 'integration',
    resourceId: String(integrationId),
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
  res.json({ success: true });
});

// Update integration
router.patch('/integrations/:integrationId', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso de administrador obrigatório' });
  }

  const integrationId = parseInt(req.params.integrationId);
  const integration = await getIntegrationForUser(integrationId, req.user);

  if (!integration) {
    return res.status(404).json({ error: 'Integração não encontrada' });
  }

  const { name, memoryMb, showCostEstimate, companyId, documentationLinks, processIds, createProcess } = req.body;

  const updates = {
    name: name !== undefined ? String(name).trim() : integration.name,
    memory_mb: integration.memory_mb,
    show_cost_estimate: integration.show_cost_estimate,
    company_id: integration.company_id,
    documentation_links: integration.documentation_links || []
  };

  if (!updates.name) {
    return res.status(400).json({ error: 'Nome inválido' });
  }

  if (memoryMb !== undefined && memoryMb !== null && memoryMb !== '') {
    const parsedMemory = Number(memoryMb);
    if (!Number.isFinite(parsedMemory) || parsedMemory <= 0) {
      return res.status(400).json({ error: 'Memória inválida' });
    }
    updates.memory_mb = Math.round(parsedMemory);
  }

  if (showCostEstimate !== undefined && showCostEstimate !== null && showCostEstimate !== '') {
    if (typeof showCostEstimate === 'string') {
      updates.show_cost_estimate = !['false', '0', 'no'].includes(showCostEstimate.toLowerCase());
    } else {
      updates.show_cost_estimate = Boolean(showCostEstimate);
    }
  }

  if (companyId !== undefined && companyId !== null && companyId !== '') {
    const parsedCompanyId = Number(companyId);
    if (!Number.isFinite(parsedCompanyId)) {
      return res.status(400).json({ error: 'Empresa inválida' });
    }

    const companyResult = await query('SELECT id, name FROM companies WHERE id = $1', [parsedCompanyId]);
    if (companyResult.rowCount === 0) {
      return res.status(400).json({ error: 'Empresa não encontrada' });
    }

    updates.company_id = parsedCompanyId;
  }

  if (documentationLinks !== undefined && documentationLinks !== null) {
    try {
      updates.documentation_links = normalizeDocumentationLinks(documentationLinks);
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Links de documentação inválidos' });
    }
  }

  let resolvedProcessIds;
  try {
    resolvedProcessIds = normalizeProcessIds(processIds);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  if (updates.company_id !== integration.company_id && resolvedProcessIds === undefined) {
    resolvedProcessIds = [];
  }

  const client = await pool.connect();
  let result;
  let linkedProcesses;
  try {
    await client.query('BEGIN');
    result = await client.query(
      `UPDATE integrations
        SET name = $1,
            memory_mb = $2,
            show_cost_estimate = $3,
            company_id = $4,
            documentation_links = $5
          WHERE id = $6
      RETURNING id,
                name,
                function_name AS "functionName",
                region,
                memory_mb AS "memoryMb",
                show_cost_estimate AS "showCostEstimate",
                documentation_links AS "documentationLinks",
                company_id AS "companyId",
                owner_user_id AS "userId",
                client_user_id AS "clientId"`,
      [updates.name, updates.memory_mb, updates.show_cost_estimate, updates.company_id, JSON.stringify(updates.documentation_links || []), integrationId]
    );

    if (resolvedProcessIds !== undefined || createProcess?.enabled) {
      linkedProcesses = await syncIntegrationProcesses({
        db: client,
        integrationId,
        companyId: updates.company_id,
        processIds: resolvedProcessIds || [],
        createProcess,
        integrationName: updates.name
      });
    } else {
      const currentLinks = await client.query(
        `SELECT process_items.id, process_items.title, process_items.status
           FROM process_integrations
           JOIN process_items ON process_items.id = process_integrations.process_id
          WHERE process_integrations.integration_id = $1
          ORDER BY process_items.updated_at DESC`,
        [integrationId]
      );
      linkedProcesses = currentLinks.rows;
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(400).json({ error: error.message || 'Falha ao vincular processo' });
  } finally {
    client.release();
  }

  const companyNameResult = await query('SELECT name FROM companies WHERE id = $1', [updates.company_id]);
  const companyName = companyNameResult.rows[0]?.name || null;

  await logAudit({
    companyId: updates.company_id,
    userId: req.user.id,
    action: 'integration.update',
    resourceType: 'integration',
    resourceId: String(integrationId),
    metadata: {
      name: updates.name,
      memoryMb: updates.memory_mb,
      showCostEstimate: updates.show_cost_estimate,
      companyId: updates.company_id,
      documentationLinks: updates.documentation_links,
      linkedProcessIds: linkedProcesses.map(process => process.id),
      processCreatedFromIntegration: Boolean(createProcess?.enabled)
    },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.json({ integration: { ...result.rows[0], companyName, processes: linkedProcesses } });
});

module.exports = router;
