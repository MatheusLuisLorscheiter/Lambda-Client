const express = require('express');
const { authenticateToken } = require('./auth');
const { query } = require('../db');
const { encrypt } = require('../security/crypto');
const { logAudit } = require('../audit/logger');
const { getIntegrationForUser, normalizeDocumentationLinks } = require('../services/integrations');

const router = express.Router();

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
              integrations.documentation_links AS "documentationLinks",
              integrations.company_id AS "companyId",
              companies.name AS "companyName",
              integrations.owner_user_id AS "userId",
              integrations.client_user_id AS "clientId"
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
              integrations.documentation_links AS "documentationLinks",
              integrations.company_id AS "companyId",
              companies.name AS "companyName",
              integrations.owner_user_id AS "userId",
              integrations.client_user_id AS "clientId"
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

  const { name, functionName, region, accessKeyId, secretAccessKey, memoryMb, companyId, showCostEstimate, documentationLinks } = req.body;

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

  const result = await query(
    `INSERT INTO integrations
      (company_id, name, function_name, region, memory_mb, show_cost_estimate, documentation_links, access_key_encrypted, secret_key_encrypted, owner_user_id, client_user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, name, function_name AS "functionName", region, memory_mb AS "memoryMb", show_cost_estimate AS "showCostEstimate", documentation_links AS "documentationLinks", company_id AS "companyId", owner_user_id AS "userId", client_user_id AS "clientId"`,
    [resolvedCompanyId, name, functionName, region, resolvedMemoryMb, resolvedShowCostEstimate, JSON.stringify(resolvedDocumentationLinks), encryptedAccessKey, encryptedSecretKey, req.user.id, resolvedClientId]
  );

  const companyNameResult = await query('SELECT name FROM companies WHERE id = $1', [resolvedCompanyId]);
  const companyName = companyNameResult.rows[0]?.name || null;

  await logAudit({
    companyId: req.user.companyId,
    userId: req.user.id,
    action: 'integration.create',
    resourceType: 'integration',
    resourceId: String(result.rows[0].id),
    metadata: { name, functionName, region, memoryMb: resolvedMemoryMb, companyId: resolvedCompanyId, showCostEstimate: resolvedShowCostEstimate, documentationLinks: resolvedDocumentationLinks },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.json({ integration: { ...result.rows[0], companyName } });
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

  const { name, memoryMb, showCostEstimate, companyId, documentationLinks } = req.body;

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

  const result = await query(
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

  const companyNameResult = await query('SELECT name FROM companies WHERE id = $1', [updates.company_id]);
  const companyName = companyNameResult.rows[0]?.name || null;

  await logAudit({
    companyId: req.user.companyId,
    userId: req.user.id,
    action: 'integration.update',
    resourceType: 'integration',
    resourceId: String(integrationId),
    metadata: {
      name: updates.name,
      memoryMb: updates.memory_mb,
      showCostEstimate: updates.show_cost_estimate,
      companyId: updates.company_id,
      documentationLinks: updates.documentation_links
    },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.json({ integration: { ...result.rows[0], companyName } });
});

module.exports = router;
