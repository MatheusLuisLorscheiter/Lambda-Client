const express = require('express');
const crypto = require('crypto');
const { query } = require('../db');

const router = express.Router();

/**
 * Middleware: Autenticação de Agentes de IA via MCP Token
 */
async function mcpAuthMiddleware(req, res, next) {
  let token = '';

  const authHeader = req.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.query.token) {
    token = req.query.token;
  } else if (req.query.apiKey) {
    token = req.query.apiKey;
  }

  if (!token) {
    return res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Autenticação MCP necessária. Forneça a chave Bearer no cabeçalho Authorization ou via query string (token=...)' },
      id: req.body?.id || null
    });
  }

  const keyHash = crypto.createHash('sha256').update(token).digest('hex');

  try {
    const result = await query(`
      SELECT 
        cfg.company_id,
        cfg.is_enabled,
        cfg.allowed_domains,
        c.name AS company_name
      FROM company_mcp_configs cfg
      JOIN companies c ON c.id = cfg.company_id
      WHERE cfg.api_key_hash = $1
    `, [keyHash]);

    if (result.rows.length === 0) {
      return res.status(403).json({
        jsonrpc: '2.0',
        error: { code: -32002, message: 'Token MCP não encontrado ou inválido.' },
        id: req.body?.id || null
      });
    }

    const config = result.rows[0];
    if (!config.is_enabled) {
      return res.status(403).json({
        jsonrpc: '2.0',
        error: { code: -32003, message: 'O acesso MCP está desativado para esta empresa.' },
        id: req.body?.id || null
      });
    }

    // Atualizar último acesso assincronamente (fire-and-forget)
    query('UPDATE company_mcp_configs SET last_accessed_at = NOW() WHERE company_id = $1', [config.company_id]).catch(() => {});

    req.mcpCompany = {
      id: config.company_id,
      name: config.company_name,
      allowedDomains: typeof config.allowed_domains === 'string' ? JSON.parse(config.allowed_domains) : (config.allowed_domains || {})
    };

    next();
  } catch (error) {
    console.error('[MCP Middleware Error]', error);
    return res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Erro interno ao validar credenciais MCP.' },
      id: req.body?.id || null
    });
  }
}

/**
 * Função utilitária para registrar chamadas MCP no audit_log
 */
async function auditMcpCall(companyId, toolName, params, resultStatus = 'success', ip = null, userAgent = null) {
  try {
    await query(`
      INSERT INTO audit_logs (company_id, action, resource_type, resource_id, metadata, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      companyId,
      `mcp.tool_call.${toolName}`,
      'mcp_tool',
      toolName,
      JSON.stringify({ params, status: resultStatus }),
      ip,
      userAgent
    ]);
  } catch (e) {
    console.error('[MCP Audit Log Error]', e);
  }
}

/**
 * Definições das ferramentas (Tools) MCP expostas para Agentes de IA
 */
const MCP_TOOLS = [
  {
    name: 'get_company_summary',
    description: 'Retorna um resumo estatístico da empresa: total de integrações, processos, entregas e mapeamentos configurados.',
    inputSchema: {
      type: 'object',
      properties: {
        client_email: { type: 'string', description: 'Email do cliente para filtrar os resultados pela sua respectiva empresa. Apenas chaves Master podem utilizar.' }
      },
      required: []
    }
  },
  {
    name: 'list_integration_logs',
    description: 'Lista as integrações da empresa com seus status de saúde (healthy/degraded/unavailable) e o histórico recente de logs de auditoria e automação.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Quantidade máxima de registros (padrão: 20, máximo: 50)' },
        client_email: { type: 'string', description: 'Email do cliente para filtrar os resultados pela sua respectiva empresa. Apenas chaves Master podem utilizar.' }
      }
    }
  },
  {
    name: 'list_processes_and_docs',
    description: 'Lista os processos, demandas, checklists e documentos/entregáveis (release notes, entregas) cadastrados para a empresa.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filtrar por status do processo (ex: requested, analysis, in_progress, delivered)' },
        limit: { type: 'number', description: 'Quantidade máxima de processos (padrão: 20)' },
        client_email: { type: 'string', description: 'Email do cliente para filtrar os resultados pela sua respectiva empresa. Apenas chaves Master podem utilizar.' }
      }
    }
  },
  {
    name: 'get_process_details',
    description: 'Retorna os detalhes completos de um processo específico incluindo histórico de atualizações, comentários, itens de checklist, avaliações de esforço e documentos entregues.',
    inputSchema: {
      type: 'object',
      properties: {
        processId: { type: 'number', description: 'ID numérico do processo' },
        client_email: { type: 'string', description: 'Email do cliente para validação de acesso. Apenas chaves Master podem utilizar.' }
      },
      required: ['processId']
    }
  },
  {
    name: 'list_mappings_and_entries',
    description: 'Lista todos os conjuntos de mapeamento de integração (de/para), com suas regras, status de mapeamento e textos extraídos de documentos/anexos.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filtrar por status do mapeamento (draft, published, archived)' },
        limit: { type: 'number', description: 'Quantidade máxima de mapeamentos (padrão: 20)' },
        client_email: { type: 'string', description: 'Email do cliente para filtrar os resultados pela sua respectiva empresa. Apenas chaves Master podem utilizar.' }
      }
    }
  },
  {
    name: 'get_mapping_details',
    description: 'Obtém o detalhamento de um conjunto de mapeamento específico: lista de campos (de/para), transformações, instruções, texto extraído de documentos anexos e histórico de revisões.',
    inputSchema: {
      type: 'object',
      properties: {
        mappingSetId: { type: 'number', description: 'ID numérico do conjunto de mapeamento' },
        client_email: { type: 'string', description: 'Email do cliente para validação de acesso. Apenas chaves Master podem utilizar.' }
      },
      required: ['mappingSetId']
    }
  }
];

/**
 * Executores das Ferramentas MCP
 */
async function executeMcpTool(toolName, args, company) {
  let targetCompanyId = company.id;
  const { allowedDomains } = company;

  if (args.client_email) {
    if (company.id !== 1) {
      throw new Error('Acesso negado. Apenas a conta Master pode realizar consultas filtradas por client_email de terceiros.');
    }
    const userRes = await query('SELECT company_id FROM users WHERE email = $1', [args.client_email]);
    if (userRes.rows.length === 0) {
      throw new Error(`O email ${args.client_email} não está vinculado a nenhuma empresa nesta plataforma.`);
    }
    targetCompanyId = userRes.rows[0].company_id;
  }

  switch (toolName) {
    case 'get_company_summary': {
      const integrationsCount = await query('SELECT COUNT(*)::int FROM integrations WHERE company_id = $1', [targetCompanyId]);
      const processesCount = await query('SELECT COUNT(*)::int FROM process_items WHERE company_id = $1', [targetCompanyId]);
      const mappingsCount = await query('SELECT COUNT(*)::int FROM integration_mapping_sets WHERE company_id = $1', [targetCompanyId]);
      const recentAuditCount = await query('SELECT COUNT(*)::int FROM audit_logs WHERE company_id = $1', [targetCompanyId]);

      return {
        companyId: targetCompanyId,
        companyName: company.id === targetCompanyId ? company.name : `Empresa de ${args.client_email}`,
        totalIntegrations: integrationsCount.rows[0].count,
        totalProcesses: processesCount.rows[0].count,
        totalMappingSets: mappingsCount.rows[0].count,
        totalAuditLogs: recentAuditCount.rows[0].count,
        allowedDomains
      };
    }

    case 'list_integration_logs': {
      if (allowedDomains.logs === false && allowedDomains.integrations === false) {
        throw new Error('Acesso a logs e integrações não está liberado para esta empresa.');
      }
      const limit = Math.min(Math.max(Number(args?.limit) || 20, 1), 50);

      const integrations = await query(`
        SELECT id, name, function_name, region, memory_mb, lifecycle_status, last_check_status, last_check_message, last_checked_at, created_at
        FROM integrations
        WHERE company_id = $1
        ORDER BY name ASC
      `, [targetCompanyId]);

      const logs = await query(`
        SELECT id, action, resource_type, resource_id, metadata, created_at
        FROM audit_logs
        WHERE company_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [targetCompanyId, limit]);

      return {
        integrations: integrations.rows,
        recentLogs: logs.rows
      };
    }

    case 'list_processes_and_docs': {
      if (allowedDomains.processes === false) {
        throw new Error('Acesso a processos e documentos não está liberado para esta empresa.');
      }
      const limit = Math.min(Math.max(Number(args?.limit) || 20, 1), 50);
      const statusFilter = args?.status ? String(args.status) : null;

      const params = [targetCompanyId];
      let sql = `
        SELECT 
          p.id, p.reference_code, p.title, p.description, p.category, p.status, p.priority, p.impact, p.health, p.progress, p.due_date, p.target_sla_at, p.delivered_at, p.created_at, p.updated_at,
          (SELECT COUNT(*)::int FROM process_updates u WHERE u.process_id = p.id) AS updates_count,
          (SELECT COUNT(*)::int FROM process_deliveries d WHERE d.process_id = p.id) AS deliveries_count
        FROM process_items p
        WHERE p.company_id = $1
      `;

      if (statusFilter) {
        params.push(statusFilter);
        sql += ` AND p.status = $${params.length}`;
      }

      sql += ` ORDER BY p.updated_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await query(sql, params);

      // Buscar entregas/documentos anexos aos processos
      const deliveries = await query(`
        SELECT d.id, d.process_id, d.title, d.summary, d.version, d.environment, d.status, d.artifact_links, d.release_notes, d.delivered_at, d.created_at
        FROM process_deliveries d
        JOIN process_items p ON p.id = d.process_id
        WHERE p.company_id = $1
        ORDER BY d.created_at DESC
        LIMIT 30
      `, [targetCompanyId]);

      return {
        processes: result.rows,
        processDeliveriesAndDocs: deliveries.rows
      };
    }

    case 'get_process_details': {
      if (allowedDomains.processes === false) {
        throw new Error('Acesso a processos e documentos não está liberado para esta empresa.');
      }
      const processId = Number(args?.processId);
      if (!processId) {
        throw new Error('Parâmetro processId é obrigatório.');
      }

      const processCheck = await query(`
        SELECT * FROM process_items WHERE id = $1 AND company_id = $2
      `, [processId, targetCompanyId]);

      if (processCheck.rows.length === 0) {
        throw new Error(`Processo ID ${processId} não foi encontrado para esta empresa.`);
      }

      const processItem = processCheck.rows[0];

      const updates = await query(`
        SELECT id, kind, visibility, message, metadata, created_at
        FROM process_updates
        WHERE process_id = $1 AND visibility = 'client'
        ORDER BY created_at ASC
      `, [processId]);

      const checklist = await query(`
        SELECT id, title, description, status, due_date, sort_order, completed_at
        FROM process_checklist_items
        WHERE process_id = $1
        ORDER BY sort_order ASC, id ASC
      `, [processId]);

      const deliveries = await query(`
        SELECT id, title, summary, version, environment, status, artifact_links, release_notes, delivered_at
        FROM process_deliveries
        WHERE process_id = $1
        ORDER BY created_at DESC
      `, [processId]);

      const effortAssessments = await query(`
        SELECT a.id, a.stage, a.label, a.measured_at, a.source, a.status, a.notes,
               JSON_AGG(i.*) AS items
        FROM process_effort_assessments a
        LEFT JOIN process_effort_items i ON i.assessment_id = a.id
        WHERE a.process_id = $1
        GROUP BY a.id
        ORDER BY a.created_at DESC
      `, [processId]);

      return {
        process: processItem,
        updates: updates.rows,
        checklist: checklist.rows,
        deliveriesAndDocs: deliveries.rows,
        effortAssessments: effortAssessments.rows
      };
    }

    case 'list_mappings_and_entries': {
      if (allowedDomains.mappings === false) {
        throw new Error('Acesso a mapeamentos não está liberado para esta empresa.');
      }
      const limit = Math.min(Math.max(Number(args?.limit) || 20, 1), 50);
      const statusFilter = args?.status ? String(args.status) : null;

      const params = [targetCompanyId];
      let sql = `
        SELECT 
          s.id, s.name, s.description, s.source_system, s.target_system, s.version, s.revision, s.status, s.content_markdown, s.created_at, s.updated_at,
          (SELECT COUNT(*)::int FROM integration_mapping_entries e WHERE e.mapping_set_id = s.id) AS entries_count,
          (SELECT COUNT(*)::int FROM integration_mapping_attachments a WHERE a.mapping_set_id = s.id) AS attachments_count
        FROM integration_mapping_sets s
        WHERE s.company_id = $1
      `;

      if (statusFilter) {
        params.push(statusFilter);
        sql += ` AND s.status = $${params.length}`;
      }

      sql += ` ORDER BY s.updated_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const mappingSets = await query(sql, params);

      // Anexos e textos extraídos de documentos
      const attachments = await query(`
        SELECT a.id, a.mapping_set_id, a.file_name, a.mime_type, a.file_size, a.extracted_text, a.created_at
        FROM integration_mapping_attachments a
        JOIN integration_mapping_sets s ON s.id = a.mapping_set_id
        WHERE s.company_id = $1
        ORDER BY a.created_at DESC
      `, [targetCompanyId]);

      return {
        mappingSets: mappingSets.rows,
        attachmentsAndExtractedDocs: attachments.rows.map(att => ({
          ...att,
          extractedTextPreview: att.extracted_text ? att.extracted_text.slice(0, 1000) : null
        }))
      };
    }

    case 'get_mapping_details': {
      if (allowedDomains.mappings === false) {
        throw new Error('Acesso a mapeamentos não está liberado para esta empresa.');
      }
      const mappingSetId = Number(args?.mappingSetId);
      if (!mappingSetId) {
        throw new Error('Parâmetro mappingSetId é obrigatório.');
      }

      const setCheck = await query(`
        SELECT * FROM integration_mapping_sets WHERE id = $1 AND company_id = $2
      `, [mappingSetId, targetCompanyId]);

      if (setCheck.rows.length === 0) {
        throw new Error(`Conjunto de Mapeamento ID ${mappingSetId} não foi encontrado para esta empresa.`);
      }

      const mappingSet = setCheck.rows[0];

      const entries = await query(`
        SELECT id, source_path, source_type, target_path, target_type, direction, transformation, fallback_value, is_required, notes, examples, section, mapping_status, sort_order
        FROM integration_mapping_entries
        WHERE mapping_set_id = $1
        ORDER BY sort_order ASC, id ASC
      `, [mappingSetId]);

      const attachments = await query(`
        SELECT id, file_name, mime_type, file_size, extracted_text, created_at
        FROM integration_mapping_attachments
        WHERE mapping_set_id = $1
        ORDER BY created_at DESC
      `, [mappingSetId]);

      const revisionHistory = await query(`
        SELECT id, action, entity_type, summary, mapping_revision, created_at
        FROM integration_mapping_changes
        WHERE mapping_set_id = $1 AND client_visible = TRUE
        ORDER BY created_at DESC
        LIMIT 20
      `, [mappingSetId]);

      return {
        mappingSet,
        entries: entries.rows,
        attachmentsDocs: attachments.rows,
        revisionHistory: revisionHistory.rows
      };
    }

    default:
      throw new Error(`Ferramenta MCP desconhecida: '${toolName}'`);
  }
}

// Map to store active SSE connections (session state)
const sseClients = new Map();

/**
 * Handle JSON-RPC method execution
 */
async function handleRpcMethod(method, params, id, req, clientIp, userAgent) {
  try {
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
              resources: {}
            },
            serverInfo: {
              name: 'Lambda Pulse MCP Server',
              version: '1.0.0',
              company: req.mcpCompany.name
            }
          },
          id
        };

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          result: {
            tools: MCP_TOOLS
          },
          id
        };

      case 'tools/call': {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};

        if (!toolName) {
          return {
            jsonrpc: '2.0',
            error: { code: -32602, message: 'Nome da ferramenta não especificado em params.name' },
            id
          };
        }

        const data = await executeMcpTool(toolName, toolArgs, req.mcpCompany);
        await auditMcpCall(req.mcpCompany.id, toolName, toolArgs, 'success', clientIp, userAgent);

        return {
          jsonrpc: '2.0',
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(data, null, 2)
              }
            ]
          },
          id
        };
      }

      case 'resources/list': {
        return {
          jsonrpc: '2.0',
          result: {
            resources: [
              {
                uri: `company://${req.mcpCompany.id}/summary`,
                name: `Resumo da Empresa (${req.mcpCompany.name})`,
                mimeType: 'application/json'
              },
              {
                uri: `company://${req.mcpCompany.id}/integrations`,
                name: 'Lista de Integrações e Logs',
                mimeType: 'application/json'
              },
              {
                uri: `company://${req.mcpCompany.id}/processes`,
                name: 'Processos, Checklists e Documentos',
                mimeType: 'application/json'
              },
              {
                uri: `company://${req.mcpCompany.id}/mappings`,
                name: 'Mapeamentos e Anexos',
                mimeType: 'application/json'
              }
            ]
          },
          id
        };
      }

      case 'resources/read': {
        const uri = params?.uri || '';
        let toolName = 'get_company_summary';
        if (uri.endsWith('/integrations')) toolName = 'list_integration_logs';
        if (uri.endsWith('/processes')) toolName = 'list_processes_and_docs';
        if (uri.endsWith('/mappings')) toolName = 'list_mappings_and_entries';

        const data = await executeMcpTool(toolName, {}, req.mcpCompany);
        await auditMcpCall(req.mcpCompany.id, `resource_read:${toolName}`, { uri }, 'success', clientIp, userAgent);

        return {
          jsonrpc: '2.0',
          result: {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(data, null, 2)
              }
            ]
          },
          id
        };
      }

      default:
        return {
          jsonrpc: '2.0',
          error: { code: -32601, message: `Método MCP não encontrado: '${method}'` },
          id
        };
    }
  } catch (err) {
    console.error(`[MCP Error execution method=${method}]`, err);
    await auditMcpCall(req.mcpCompany.id, method || 'unknown', params || {}, `error: ${err.message}`, clientIp, userAgent);
    return {
      jsonrpc: '2.0',
      error: { code: -32603, message: err.message || 'Erro interno ao processar requisição MCP' },
      id: id || null
    };
  }
}

/**
 * Main HTTP JSON-RPC 2.0 Handler para /mcp (Direct HTTP fallback, non-SSE)
 */
router.post('/', mcpAuthMiddleware, async (req, res) => {
  const { jsonrpc, method, params, id } = req.body || {};

  if (jsonrpc !== '2.0') {
    return res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Requisição JSON-RPC inválida. Versão deve ser "2.0".' },
      id: id || null
    });
  }

  const clientIp = req.ip || req.get('x-forwarded-for') || null;
  const userAgent = req.get('user-agent') || null;

  const responseData = await handleRpcMethod(method, params, id, req, clientIp, userAgent);
  return res.json(responseData);
});

/**
 * Handler POST para Mensagens de Sessões SSE (/mcp/message)
 * O SDK envia requisições POST para o endpoint informado em "event: endpoint".
 * Devemos responder rapidamente com 202 Accepted, e enviar a resposta pela conexão SSE ativa.
 */
router.post('/message', mcpAuthMiddleware, async (req, res) => {
  const sessionId = req.query.sessionId;
  const sseRes = sseClients.get(sessionId);

  if (!sseRes) {
    return res.status(404).send('Session not found or expired');
  }

  // De acordo com a especificação, devemos retornar "202 Accepted"
  res.status(202).end();

  const { jsonrpc, method, params, id } = req.body || {};

  if (jsonrpc !== '2.0') {
    sseRes.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', error: { code: -32600, message: 'Requisição JSON-RPC inválida.' }, id: id || null })}\n\n`);
    return;
  }

  const clientIp = req.ip || req.get('x-forwarded-for') || null;
  const userAgent = req.get('user-agent') || null;

  const responseData = await handleRpcMethod(method, params, id, req, clientIp, userAgent);
  sseRes.write(`event: message\ndata: ${JSON.stringify(responseData)}\n\n`);
});

/**
 * Suporte a SSE (Server-Sent Events) para MCP Clients como Claude Desktop
 */
router.get('/sse', mcpAuthMiddleware, (req, res) => {
  const sessionId = crypto.randomUUID();
  sseClients.set(sessionId, res);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const protocol = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('x-forwarded-host') || req.get('host');
  const endpointUrl = `${protocol}://${host}/mcp/message?sessionId=${sessionId}`;
  
  // Como fallback de segurança adicional para clientes MCP, enviar URL absoluta compatível com o proxy
  res.write(`event: endpoint\ndata: ${endpointUrl}\n\n`);

  req.on('close', () => {
    sseClients.delete(sessionId);
    res.end();
  });
});

module.exports = router;
