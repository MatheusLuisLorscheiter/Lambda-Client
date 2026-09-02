const express = require('express');
const crypto = require('crypto');
const { authenticateToken } = require('./auth');
const { query, pool } = require('../db');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso restrito a administradores' });
  next();
}

function parseCompanyId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.get('/companies', authenticateToken, requireAdmin, async (_req, res) => {
  try {
    const [companiesResult, statsResult] = await Promise.all([
      query(`
        SELECT c.id AS company_id, c.name AS company_name, c.created_at AS company_created_at,
               cfg.id AS config_id, COALESCE(cfg.is_enabled, FALSE) AS is_enabled,
               cfg.api_key_prefix,
               COALESCE(cfg.allowed_domains, '{"logs": true, "processes": true, "mappings": true, "integrations": true}'::jsonb) AS allowed_domains,
               COALESCE(cfg.allowed_scopes, ARRAY[]::TEXT[]) AS allowed_scopes,
               COALESCE(cfg.access_mode, 'company') AS access_mode,
               COALESCE(cfg.require_contact_tag_match, FALSE) AS require_contact_tag_match,
               COALESCE(cfg.max_requests_per_minute, 60) AS max_requests_per_minute,
               cfg.last_accessed_at,
               (SELECT COUNT(*)::int FROM audit_logs a WHERE a.company_id = c.id AND a.action LIKE 'mcp.%') AS mcp_calls_count,
               COALESCE((
                 SELECT json_agg(g.target_company_id ORDER BY g.target_company_id)
                 FROM company_mcp_access_grants g
                 WHERE g.principal_company_id = c.id AND g.is_active = TRUE
               ), '[]'::json) AS granted_company_ids
          FROM companies c
          LEFT JOIN company_mcp_configs cfg ON cfg.company_id = c.id
         ORDER BY c.name ASC
      `),
      query(`
        SELECT (SELECT COUNT(*)::int FROM company_mcp_configs WHERE is_enabled = TRUE) AS active_companies_count,
               (SELECT COUNT(*)::int FROM audit_logs WHERE action LIKE 'mcp.%' AND created_at >= CURRENT_DATE) AS mcp_calls_today
      `),
    ]);

    res.json({
      companies: companiesResult.rows.map((row) => ({
        companyId: row.company_id,
        companyName: row.company_name,
        companyCreatedAt: row.company_created_at,
        configId: row.config_id,
        isEnabled: row.is_enabled,
        apiKeyPrefix: row.api_key_prefix || null,
        hasToken: Boolean(row.api_key_prefix),
        allowedDomains: row.allowed_domains,
        allowedScopes: row.allowed_scopes || [],
        accessMode: row.access_mode,
        requireContactTagMatch: row.require_contact_tag_match,
        grantedCompanyIds: row.granted_company_ids || [],
        maxRequestsPerMinute: row.max_requests_per_minute,
        lastAccessedAt: row.last_accessed_at,
        mcpCallsCount: row.mcp_calls_count || 0,
      })),
      stats: {
        activeCompaniesCount: statsResult.rows[0]?.active_companies_count || 0,
        mcpCallsToday: statsResult.rows[0]?.mcp_calls_today || 0,
      },
    });
  } catch (error) {
    console.error('[Admin MCP] Falha ao listar empresas:', error);
    res.status(500).json({ error: 'Erro ao carregar configurações MCP das empresas' });
  }
});

router.post('/company/:id/toggle', authenticateToken, requireAdmin, async (req, res) => {
  const companyId = parseCompanyId(req.params.id);
  if (!companyId || typeof req.body?.isEnabled !== 'boolean') return res.status(400).json({ error: 'Parâmetros inválidos' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const company = await client.query('SELECT id, name FROM companies WHERE id = $1', [companyId]);
    if (!company.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }
    const result = await client.query(`
      INSERT INTO company_mcp_configs (company_id, is_enabled, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (company_id) DO UPDATE SET is_enabled = EXCLUDED.is_enabled, updated_at = NOW()
      RETURNING is_enabled
    `, [companyId, req.body.isEnabled]);
    await client.query(`
      INSERT INTO audit_logs (company_id, user_id, action, resource_type, resource_id, metadata)
      VALUES ($1, $2, $3, 'company_mcp_configs', $4, $5)
    `, [companyId, req.user.id, req.body.isEnabled ? 'mcp.enable' : 'mcp.disable', String(companyId), JSON.stringify({ companyName: company.rows[0].name })]);
    await client.query('COMMIT');
    res.json({ success: true, isEnabled: result.rows[0].is_enabled });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[Admin MCP] Falha ao alterar status:', error);
    res.status(500).json({ error: 'Erro ao alterar status MCP da empresa' });
  } finally {
    client.release();
  }
});

router.post('/company/:id/token', authenticateToken, requireAdmin, async (req, res) => {
  const companyId = parseCompanyId(req.params.id);
  if (!companyId) return res.status(400).json({ error: 'ID de empresa inválido' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const company = await client.query('SELECT id, name FROM companies WHERE id = $1', [companyId]);
    if (!company.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }
    const raw = crypto.randomBytes(32).toString('base64url');
    const token = `mcp_live_${raw}`;
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const prefix = `mcp_live_${raw.slice(0, 8)}...`;
    await client.query(`
      INSERT INTO company_mcp_configs (company_id, is_enabled, api_key_hash, api_key_prefix, updated_at)
      VALUES ($1, TRUE, $2, $3, NOW())
      ON CONFLICT (company_id) DO UPDATE SET is_enabled = TRUE, api_key_hash = EXCLUDED.api_key_hash,
        api_key_prefix = EXCLUDED.api_key_prefix, updated_at = NOW()
    `, [companyId, hash, prefix]);
    await client.query(`
      INSERT INTO audit_logs (company_id, user_id, action, resource_type, resource_id, metadata)
      VALUES ($1, $2, 'mcp.rotate_token', 'company_mcp_configs', $3, $4)
    `, [companyId, req.user.id, String(companyId), JSON.stringify({ companyName: company.rows[0].name, prefix })]);
    await client.query('COMMIT');
    res.json({ success: true, token, prefix, message: 'Token gerado. Guarde-o em local seguro; ele não será exibido novamente.' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[Admin MCP] Falha ao gerar token:', error);
    res.status(500).json({ error: 'Erro ao gerar token MCP para a empresa' });
  } finally {
    client.release();
  }
});

router.put('/company/:id/permissions', authenticateToken, requireAdmin, async (req, res) => {
  const companyId = parseCompanyId(req.params.id);
  const {
    allowedDomains,
    accessMode = 'company',
    requireContactTagMatch = false,
    grantedCompanyIds = [],
    maxRequestsPerMinute = 60,
    allowedScopes = [],
  } = req.body || {};
  if (!companyId || !allowedDomains || typeof allowedDomains !== 'object' || !['company', 'delegated'].includes(accessMode)) {
    return res.status(400).json({ error: 'Parâmetros inválidos' });
  }
  const domains = {
    logs: Boolean(allowedDomains.logs),
    processes: Boolean(allowedDomains.processes),
    mappings: Boolean(allowedDomains.mappings),
    integrations: Boolean(allowedDomains.integrations),
  };
  const validScopes = new Set([
    'processes:create',
    'processes:write',
    'processes:comment',
    'processes:checklist',
    'processes:deliveries',
    'processes:review',
    'mappings:write',
    'mappings:comment',
    'mappings:review',
    'mappings:publish',
  ]);
  const scopes = Array.from(new Set((Array.isArray(allowedScopes) ? allowedScopes : []).map(String).filter(scope => validScopes.has(scope))));
  if (Array.isArray(allowedScopes) && scopes.length !== allowedScopes.length) return res.status(400).json({ error: 'Um ou mais escopos MCP são inválidos' });
  const grantIds = Array.from(new Set((Array.isArray(grantedCompanyIds) ? grantedCompanyIds : [])
    .map(Number).filter((id) => Number.isInteger(id) && id > 0 && id !== companyId)));
  const rateLimit = Math.min(Math.max(Number(maxRequestsPerMinute) || 60, 1), 1000);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const company = await client.query('SELECT id FROM companies WHERE id = $1', [companyId]);
    if (!company.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }
    if (grantIds.length) {
      const targets = await client.query('SELECT id FROM companies WHERE id = ANY($1::int[])', [grantIds]);
      if (targets.rows.length !== grantIds.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Uma ou mais empresas concedidas não existem' });
      }
    }
    const result = await client.query(`
      INSERT INTO company_mcp_configs
        (company_id, allowed_domains, allowed_scopes, access_mode, require_contact_tag_match, max_requests_per_minute, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (company_id) DO UPDATE SET allowed_domains = EXCLUDED.allowed_domains,
        allowed_scopes = EXCLUDED.allowed_scopes,
        access_mode = EXCLUDED.access_mode, require_contact_tag_match = EXCLUDED.require_contact_tag_match,
        max_requests_per_minute = EXCLUDED.max_requests_per_minute, updated_at = NOW()
      RETURNING allowed_domains, allowed_scopes, access_mode, require_contact_tag_match, max_requests_per_minute
    `, [companyId, JSON.stringify(domains), scopes, accessMode, Boolean(requireContactTagMatch), rateLimit]);
    await client.query('DELETE FROM company_mcp_access_grants WHERE principal_company_id = $1', [companyId]);
    if (accessMode === 'delegated' && grantIds.length) {
      await client.query(`
        INSERT INTO company_mcp_access_grants (principal_company_id, target_company_id, is_active)
        SELECT $1, target_id, TRUE FROM unnest($2::int[]) AS target_id
      `, [companyId, grantIds]);
    }
    const metadata = { allowedDomains: domains, allowedScopes: scopes, accessMode, requireContactTagMatch: Boolean(requireContactTagMatch), grantedCompanyIds: accessMode === 'delegated' ? grantIds : [], maxRequestsPerMinute: rateLimit };
    await client.query(`
      INSERT INTO audit_logs (company_id, user_id, action, resource_type, resource_id, metadata)
      VALUES ($1, $2, 'mcp.update_permissions', 'company_mcp_configs', $3, $4)
    `, [companyId, req.user.id, String(companyId), JSON.stringify(metadata)]);
    await client.query('COMMIT');
    res.json({ success: true, ...metadata, ...result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[Admin MCP] Falha ao atualizar permissões:', error);
    res.status(500).json({ error: 'Erro ao atualizar permissões MCP' });
  } finally {
    client.release();
  }
});

router.get('/company/:id/audit', authenticateToken, requireAdmin, async (req, res) => {
  const companyId = parseCompanyId(req.params.id);
  if (!companyId) return res.status(400).json({ error: 'ID de empresa inválido' });
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const result = await query(`
      SELECT id, action, resource_type, resource_id, metadata, ip_address, user_agent, created_at
      FROM audit_logs WHERE company_id = $1 AND action LIKE 'mcp.%'
      ORDER BY created_at DESC LIMIT $2
    `, [companyId, limit]);
    res.json({ logs: result.rows });
  } catch (error) {
    console.error('[Admin MCP] Falha ao buscar auditoria:', error);
    res.status(500).json({ error: 'Erro ao carregar logs de auditoria MCP' });
  }
});

module.exports = router;
