const express = require('express');
const crypto = require('crypto');
const { authenticateToken } = require('./auth');
const { query } = require('../db');

const router = express.Router();

// Middleware: requer perfil de admin
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores' });
  }
  next();
}

/**
 * GET /auth/admin/mcp/companies
 * Lista todas as empresas com o status e configuração MCP de cada uma
 */
router.get('/companies', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        c.id AS company_id,
        c.name AS company_name,
        c.created_at AS company_created_at,
        cfg.id AS config_id,
        COALESCE(cfg.is_enabled, FALSE) AS is_enabled,
        cfg.api_key_prefix,
        COALESCE(cfg.allowed_domains, '{"logs": true, "processes": true, "mappings": true, "integrations": true}'::jsonb) AS allowed_domains,
        COALESCE(cfg.max_requests_per_minute, 60) AS max_requests_per_minute,
        cfg.last_accessed_at,
        cfg.created_at AS config_created_at,
        (
          SELECT COUNT(*)::int 
          FROM audit_logs a 
          WHERE a.company_id = c.id AND a.action LIKE 'mcp.%'
        ) AS mcp_calls_count
      FROM companies c
      LEFT JOIN company_mcp_configs cfg ON cfg.company_id = c.id
      ORDER BY c.name ASC
    `);

    const statsResult = await query(`
      SELECT 
        (SELECT COUNT(*)::int FROM company_mcp_configs WHERE is_enabled = TRUE) AS active_companies_count,
        (SELECT COUNT(*)::int FROM audit_logs WHERE action LIKE 'mcp.%') AS total_mcp_calls
    `);

    res.json({
      companies: result.rows.map(row => ({
        companyId: row.company_id,
        companyName: row.company_name,
        companyCreatedAt: row.company_created_at,
        configId: row.config_id,
        isEnabled: row.is_enabled,
        apiKeyPrefix: row.api_key_prefix || null,
        hasToken: Boolean(row.api_key_prefix),
        allowedDomains: row.allowed_domains,
        maxRequestsPerMinute: row.max_requests_per_minute,
        lastAccessedAt: row.last_accessed_at,
        mcpCallsCount: row.mcp_calls_count || 0
      })),
      stats: {
        activeCompaniesCount: statsResult.rows[0]?.active_companies_count || 0,
        totalMcpCalls: statsResult.rows[0]?.total_mcp_calls || 0
      }
    });
  } catch (error) {
    console.error('[Admin MCP] Erro ao listar empresas:', error);
    res.status(500).json({ error: 'Erro ao carregar configurações MCP das empresas' });
  }
});

/**
 * POST /auth/admin/mcp/company/:id/toggle
 * Ativa ou desativa o acesso MCP da empresa
 */
router.post('/company/:id/toggle', authenticateToken, requireAdmin, async (req, res) => {
  const companyId = Number(req.params.id);
  const { isEnabled } = req.body;

  if (isNaN(companyId)) {
    return res.status(400).json({ error: 'ID de empresa inválido' });
  }

  try {
    const companyCheck = await query('SELECT id, name FROM companies WHERE id = $1', [companyId]);
    if (companyCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }

    const result = await query(`
      INSERT INTO company_mcp_configs (company_id, is_enabled, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (company_id) 
      DO UPDATE SET is_enabled = EXCLUDED.is_enabled, updated_at = NOW()
      RETURNING is_enabled, api_key_prefix, allowed_domains
    `, [companyId, Boolean(isEnabled)]);

    await query(`
      INSERT INTO audit_logs (company_id, user_id, action, resource_type, resource_id, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      companyId,
      req.user.id,
      isEnabled ? 'mcp.enable' : 'mcp.disable',
      'company_mcp_configs',
      String(companyId),
      JSON.stringify({ companyName: companyCheck.rows[0].name, isEnabled: Boolean(isEnabled) })
    ]);

    res.json({
      success: true,
      isEnabled: result.rows[0].is_enabled,
      message: `Acesso MCP ${isEnabled ? 'ativado' : 'desativado'} com sucesso para a empresa.`
    });
  } catch (error) {
    console.error('[Admin MCP] Erro ao alterar status MCP:', error);
    res.status(500).json({ error: 'Erro ao alterar status MCP da empresa' });
  }
});

/**
 * POST /auth/admin/mcp/company/:id/token
 * Gera ou rotaciona o token de API MCP da empresa
 */
router.post('/company/:id/token', authenticateToken, requireAdmin, async (req, res) => {
  const companyId = Number(req.params.id);
  if (isNaN(companyId)) {
    return res.status(400).json({ error: 'ID de empresa inválido' });
  }

  try {
    const companyCheck = await query('SELECT id, name FROM companies WHERE id = $1', [companyId]);
    if (companyCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }

    const rawBytes = crypto.randomBytes(24).toString('hex');
    const plainToken = `mcp_live_${rawBytes}`;
    
    const keyHash = crypto.createHash('sha256').update(plainToken).digest('hex');
    const keyPrefix = `mcp_live_${rawBytes.slice(0, 8)}...`;

    await query(`
      INSERT INTO company_mcp_configs (company_id, is_enabled, api_key_hash, api_key_prefix, updated_at)
      VALUES ($1, TRUE, $2, $3, NOW())
      ON CONFLICT (company_id) 
      DO UPDATE SET 
        is_enabled = TRUE,
        api_key_hash = EXCLUDED.api_key_hash,
        api_key_prefix = EXCLUDED.api_key_prefix,
        updated_at = NOW()
    `, [companyId, keyHash, keyPrefix]);

    await query(`
      INSERT INTO audit_logs (company_id, user_id, action, resource_type, resource_id, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      companyId,
      req.user.id,
      'mcp.rotate_token',
      'company_mcp_configs',
      String(companyId),
      JSON.stringify({ companyName: companyCheck.rows[0].name, prefix: keyPrefix })
    ]);

    res.json({
      success: true,
      token: plainToken,
      prefix: keyPrefix,
      message: 'Token MCP gerado com sucesso. Guarde este token em local seguro, ele não será exibido novamente.'
    });
  } catch (error) {
    console.error('[Admin MCP] Erro ao gerar token MCP:', error);
    res.status(500).json({ error: 'Erro ao gerar token MCP para a empresa' });
  }
});

/**
 * PUT /auth/admin/mcp/company/:id/permissions
 * Atualiza permissões de domínios permitidos para a empresa
 */
router.put('/company/:id/permissions', authenticateToken, requireAdmin, async (req, res) => {
  const companyId = Number(req.params.id);
  const { allowedDomains } = req.body;

  if (isNaN(companyId) || typeof allowedDomains !== 'object') {
    return res.status(400).json({ error: 'Parâmetros inválidos' });
  }

  const updatedDomains = {
    logs: Boolean(allowedDomains.logs),
    processes: Boolean(allowedDomains.processes),
    mappings: Boolean(allowedDomains.mappings),
    integrations: Boolean(allowedDomains.integrations)
  };

  try {
    const result = await query(`
      INSERT INTO company_mcp_configs (company_id, allowed_domains, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (company_id) 
      DO UPDATE SET allowed_domains = EXCLUDED.allowed_domains, updated_at = NOW()
      RETURNING allowed_domains
    `, [companyId, JSON.stringify(updatedDomains)]);

    await query(`
      INSERT INTO audit_logs (company_id, user_id, action, resource_type, resource_id, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      companyId,
      req.user.id,
      'mcp.update_permissions',
      'company_mcp_configs',
      String(companyId),
      JSON.stringify({ allowedDomains: updatedDomains })
    ]);

    res.json({
      success: true,
      allowedDomains: result.rows[0].allowed_domains,
      message: 'Permissões MCP atualizadas com sucesso.'
    });
  } catch (error) {
    console.error('[Admin MCP] Erro ao atualizar permissões:', error);
    res.status(500).json({ error: 'Erro ao atualizar permissões MCP' });
  }
});

/**
 * GET /auth/admin/mcp/company/:id/audit
 * Retorna os logs de chamadas MCP efetuadas para esta empresa
 */
router.get('/company/:id/audit', authenticateToken, requireAdmin, async (req, res) => {
  const companyId = Number(req.params.id);
  if (isNaN(companyId)) {
    return res.status(400).json({ error: 'ID de empresa inválido' });
  }

  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const result = await query(`
      SELECT 
        id,
        action,
        resource_type,
        resource_id,
        metadata,
        ip_address,
        user_agent,
        created_at
      FROM audit_logs
      WHERE company_id = $1 AND action LIKE 'mcp.%'
      ORDER BY created_at DESC
      LIMIT $2
    `, [companyId, limit]);

    res.json({
      logs: result.rows
    });
  } catch (error) {
    console.error('[Admin MCP] Erro ao buscar logs de auditoria MCP:', error);
    res.status(500).json({ error: 'Erro ao carregar logs de auditoria MCP' });
  }
});

module.exports = router;
