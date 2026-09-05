const express = require('express');
const crypto = require('crypto');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { query } = require('../db');
const { client: redisClient, connectRedis } = require('../cache/redis');
const processDomain = require('../services/processDomainService');
const mappingDomain = require('../services/mappingDomainService');
const integrationObservability = require('../services/integrationObservabilityService');
const lambdaSourceDomain = require('../services/lambdaSourceDomainService');
const integrationDomain = require('../services/integrationDomainService');
const mcpContacts = require('../services/mcpContactsService');
const { fetchLambdaArchive, extractEditableFiles } = require('../services/lambdaSource');
const { publishDurableProcessEvent } = require('../services/processEvents');

const router = express.Router();
const legacySseSessions = new Map();
const localRateWindows = new Map();
const DOMAIN_NAMES = ['logs', 'processes', 'mappings', 'integrations'];

function rpcError(res, status, code, message, id = null) {
  return res.status(status).json({ jsonrpc: '2.0', error: { code, message }, id });
}

function parseDomains(value) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  return DOMAIN_NAMES.reduce((result, domain) => {
    result[domain] = parsed?.[domain] !== false;
    return result;
  }, {});
}

function readBearerToken(req) {
  const authHeader = req.get('authorization') || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
}

function isOriginAllowed(req) {
  const origin = req.get('origin');
  if (!origin) return true;
  const configured = (process.env.MCP_ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const protocol = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const host = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
  const sameOrigin = host ? `${protocol}://${host}` : '';
  return configured.includes(origin) || origin === sameOrigin;
}

function originGuard(req, res, next) {
  if (!isOriginAllowed(req)) {
    return rpcError(res, 403, -32004, 'Origem não autorizada para o endpoint MCP.', req.body?.id ?? null);
  }
  next();
}

function consumeLocalRateLimit(key, limit) {
  const now = Date.now();
  const minute = Math.floor(now / 60_000);
  const current = localRateWindows.get(key);
  const next = !current || current.minute !== minute ? { minute, count: 1 } : { minute, count: current.count + 1 };
  localRateWindows.set(key, next);
  if (localRateWindows.size > 5000) {
    for (const [storedKey, value] of localRateWindows) {
      if (value.minute < minute) localRateWindows.delete(storedKey);
    }
  }
  return { allowed: next.count <= limit, remaining: Math.max(0, limit - next.count) };
}

async function consumeRateLimit(key, limit) {
  const safeLimit = Math.min(Math.max(Number(limit) || 60, 1), 1000);
  if (!process.env.REDIS_URL) return consumeLocalRateLimit(key, safeLimit);
  try {
    await connectRedis();
    const minute = Math.floor(Date.now() / 60_000);
    const redisKey = `mcp:rate:${key}:${minute}`;
    const count = await redisClient.incr(redisKey);
    if (count === 1) await redisClient.expire(redisKey, 70);
    return { allowed: count <= safeLimit, remaining: Math.max(0, safeLimit - count) };
  } catch (error) {
    console.warn('[MCP] Redis rate limit unavailable; using local fallback:', error.message);
    return consumeLocalRateLimit(key, safeLimit);
  }
}

function isMeteredMcpRequest(body) {
  const requests = Array.isArray(body) ? body : [body];
  return requests.some((request) => {
    const method = String(request?.method || '');
    // initialize, ping and protocol notifications are transport overhead. The
    // per-company budget protects discovery and business operations instead of
    // charging several times before a single tool can run.
    return method === 'tools/list'
      || method === 'tools/call'
      || method === 'resources/list'
      || method === 'resources/read'
      || (!method && request?.id != null);
  });
}

async function mcpAuthMiddleware(req, res, next) {
  const token = readBearerToken(req);
  if (!token) {
    return rpcError(res, 401, -32001, 'Autenticação MCP necessária via cabeçalho Authorization: Bearer <token>.', req.body?.id ?? null);
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  try {
    const result = await query(`
      SELECT cfg.company_id, cfg.is_enabled, cfg.allowed_domains, cfg.allowed_scopes,
             cfg.max_requests_per_minute, c.name AS company_name
        FROM company_mcp_configs cfg
        JOIN companies c ON c.id = cfg.company_id
       WHERE cfg.api_key_hash = $1
       LIMIT 1
    `, [tokenHash]);

    const config = result.rows[0];
    if (!config) return rpcError(res, 403, -32002, 'Token MCP inválido.', req.body?.id ?? null);
    if (!config.is_enabled) return rpcError(res, 403, -32003, 'O acesso MCP está desativado para esta empresa.', req.body?.id ?? null);

    const configuredLimit = Number(config.max_requests_per_minute) || 60;
    const rate = isMeteredMcpRequest(req.body)
      ? await consumeRateLimit(tokenHash.slice(0, 24), configuredLimit)
      : { allowed: true, remaining: configuredLimit };
    res.setHeader('RateLimit-Limit', String(configuredLimit));
    res.setHeader('RateLimit-Remaining', String(rate.remaining));
    if (!rate.allowed) return rpcError(res, 429, -32005, 'Limite de requisições MCP excedido. Tente novamente no próximo minuto.', req.body?.id ?? null);

    req.mcpPrincipal = {
      id: Number(config.company_id),
      name: config.company_name,
      tokenHash,
      allowedDomains: parseDomains(config.allowed_domains),
      allowedScopes: new Set(Array.isArray(config.allowed_scopes) ? config.allowed_scopes : []),
    };
    query('UPDATE company_mcp_configs SET last_accessed_at = NOW() WHERE company_id = $1', [config.company_id]).catch(() => {});
    next();
  } catch (error) {
    console.error('[MCP Auth]', error);
    return rpcError(res, 500, -32603, 'Erro interno ao validar as credenciais MCP.', req.body?.id ?? null);
  }
}

function contextSchema() {
  return {
    type: 'object',
    description: 'Contexto opcional do contato. O email é usado somente para informar se existe correspondência exata; nunca escolhe a empresa nem concede acesso.',
    properties: {
      source: { type: 'string', maxLength: 80 },
      contact_id: { type: 'string', maxLength: 160 },
      email: { type: 'string', format: 'email', maxLength: 320 },
      labels: { type: 'array', maxItems: 100, items: { type: 'string', maxLength: 160 } },
    },
    additionalProperties: false,
  };
}

function withContext(properties, required = []) {
  return {
    type: 'object',
    properties: {
      ...properties,
      client_context: contextSchema(),
      client_email: { type: 'string', format: 'email', maxLength: 320, description: 'Compatibilidade opcional. Usado somente para calcular a correspondência exata exibida em mcpAccess.' },
    },
    required,
    additionalProperties: false,
  };
}

const MCP_TOOL_DEFINITIONS = [
  {
    name: 'get_company_summary',
    domain: null,
    description: 'Retorna um resumo da empresa proprietária da chave e os emails de clientes autorizados.',
    inputSchema: withContext({}),
  },
  {
    name: 'list_integration_logs',
    domain: 'integrations',
    description: 'Lista integrações e eventos recentes visíveis da empresa proprietária da chave.',
    inputSchema: withContext({
      limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
      offset: { type: 'integer', minimum: 0, maximum: 100000, default: 0 },
    }),
  },
  {
    name: 'get_integration_observability',
    domain: 'integrations',
    description: 'Retorna saúde, métricas AWS e logs sanitizados de uma integração da empresa proprietária da chave. Não executa nem altera a Lambda.',
    inputSchema: withContext({
      integrationId: { type: 'integer', minimum: 1 },
      hours: { type: 'integer', minimum: 1, maximum: 168, default: 24 },
      limit: { type: 'integer', minimum: 1, maximum: 20, default: 20 },
      logType: { type: 'string', enum: ['relevant', 'errors', 'all'], default: 'relevant' },
      search: { type: 'string', maxLength: 200 },
    }, ['integrationId']),
  },
  {
    name: 'get_lambda_source',
    domain: 'integrations',
    scope: 'integrations:source:read',
    description: 'Lista os arquivos editáveis do pacote atual de uma Lambda e, opcionalmente, retorna o conteúdo dos caminhos solicitados. Somente leitura.',
    inputSchema: withContext({
      integrationId: { type: 'integer', minimum: 1 },
      filePaths: { type: 'array', maxItems: 30, items: { type: 'string', minLength: 1, maxLength: 500 } },
    }, ['integrationId']),
  },
  {
    name: 'get_integration_details',
    domain: 'integrations',
    description: 'Retorna metadados seguros, documentação, processos e De-Paras vinculados a uma integração. Nunca expõe credenciais AWS.',
    inputSchema: withContext({ integrationId: { type: 'integer', minimum: 1 } }, ['integrationId']),
  },
  {
    name: 'list_lambda_source_revisions',
    domain: 'integrations',
    scope: 'integrations:source:read',
    description: 'Lista o histórico de revisões de código das Lambdas da empresa no período, incluindo resumo, arquivos alterados, aprovação e publicação. Retorna cobertura explícita para auditorias e conciliação; não expõe o conteúdo nem altera a AWS.',
    inputSchema: withContext({
      integrationId: { type: 'integer', minimum: 1 },
      since: { type: 'string', format: 'date-time' },
      until: { type: 'string', format: 'date-time' },
      status: { type: 'string', enum: ['draft', 'pending_review', 'approved', 'publishing', 'published', 'rejected', 'failed'] },
      limit: { type: 'integer', minimum: 1, maximum: 500, default: 500 },
    }),
  },
  {
    name: 'list_processes_and_docs',
    domain: 'processes',
    description: 'Lista processos visíveis ao cliente e seus entregáveis.',
    inputSchema: withContext({
      status: { type: 'string', enum: ['requested', 'analysis', 'queued', 'in_progress', 'validation', 'delivered', 'paused', 'cancelled'] },
      limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
      offset: { type: 'integer', minimum: 0, maximum: 100000, default: 0 },
    }),
  },
  {
    name: 'get_process_details',
    domain: 'processes',
    description: 'Retorna detalhes de um processo visível ao cliente, incluindo atualizações públicas e entregáveis.',
    inputSchema: withContext({ processId: { type: 'integer', minimum: 1 } }, ['processId']),
  },
  {
    name: 'list_mappings_and_entries',
    domain: 'mappings',
    description: 'Lista conjuntos de mapeamento da empresa proprietária da chave e metadados dos anexos.',
    inputSchema: withContext({
      status: { type: 'string', enum: ['draft', 'published', 'archived'] },
      limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
      offset: { type: 'integer', minimum: 0, maximum: 100000, default: 0 },
    }),
  },
  {
    name: 'get_mapping_details',
    domain: 'mappings',
    description: 'Retorna o detalhamento de um conjunto de mapeamento da empresa proprietária da chave.',
    inputSchema: withContext({
      mappingSetId: { type: 'integer', minimum: 1 },
      entryLimit: { type: 'integer', minimum: 1, maximum: 250, default: 250 },
      entryOffset: { type: 'integer', minimum: 0, maximum: 100000, default: 0 },
    }, ['mappingSetId']),
  },
].map((tool) => ({ ...tool, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }));

const IDEMPOTENCY = { idempotencyKey: { type: 'string', minLength: 8, maxLength: 240 } };
const EXPECTED_VERSION = { expectedVersion: { type: 'integer', minimum: 1 } };
const EXPECTED_REVISION = { expectedRevision: { type: 'integer', minimum: 1 } };
const MCP_WRITE_TOOL_DEFINITIONS = [
  {
    name: 'create_process_request', scope: 'processes:create', domain: 'processes',
    description: 'Cria uma solicitação de processo. Requer idempotencyKey e nunca exclui dados.',
    inputSchema: withContext({ ...IDEMPOTENCY, title: { type: 'string', minLength: 1, maxLength: 160 }, description: { type: 'string', minLength: 1, maxLength: 5000 }, objective: { type: 'string', maxLength: 3000 }, scope: { type: 'string', maxLength: 5000 }, acceptanceCriteria: { type: 'string', maxLength: 5000 }, category: { type: 'string', enum: ['automation', 'integration', 'maintenance', 'improvement', 'support'] }, tags: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 40 } } }, ['idempotencyKey', 'title', 'description']),
  },
  {
    name: 'update_process', scope: 'processes:write', domain: 'processes',
    description: 'Atualiza campos operacionais de um processo com controle otimista de versão.',
    inputSchema: withContext({ ...IDEMPOTENCY, ...EXPECTED_VERSION, processId: { type: 'integer', minimum: 1 }, title: { type: 'string', maxLength: 160 }, description: { type: 'string', maxLength: 5000 }, status: { type: 'string', enum: ['requested', 'analysis', 'queued', 'in_progress', 'validation', 'delivered', 'paused', 'cancelled'] }, priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] }, health: { type: 'string', enum: ['on_track', 'at_risk', 'off_track', 'blocked'] }, progress: { type: 'integer', minimum: 0, maximum: 100 }, latestUpdate: { type: 'string', maxLength: 5000 } }, ['idempotencyKey', 'expectedVersion', 'processId']),
  },
  {
    name: 'add_process_comment', scope: 'processes:comment', domain: 'processes',
    description: 'Adiciona um comentário público ao processo com idempotência e versão esperada.',
    inputSchema: withContext({ ...IDEMPOTENCY, ...EXPECTED_VERSION, processId: { type: 'integer', minimum: 1 }, message: { type: 'string', minLength: 1, maxLength: 5000 } }, ['idempotencyKey', 'expectedVersion', 'processId', 'message']),
  },
  {
    name: 'create_checklist_item', scope: 'processes:checklist', domain: 'processes',
    description: 'Cria um item não destrutivo na checklist de um processo.',
    inputSchema: withContext({ ...IDEMPOTENCY, ...EXPECTED_VERSION, processId: { type: 'integer', minimum: 1 }, title: { type: 'string', minLength: 1, maxLength: 240 }, description: { type: 'string', maxLength: 3000 } }, ['idempotencyKey', 'expectedVersion', 'processId', 'title']),
  },
  {
    name: 'update_checklist_item', scope: 'processes:checklist', domain: 'processes',
    description: 'Atualiza um item da checklist com controle otimista; não oferece exclusão.',
    inputSchema: withContext({ ...IDEMPOTENCY, ...EXPECTED_VERSION, processId: { type: 'integer', minimum: 1 }, itemId: { type: 'integer', minimum: 1 }, title: { type: 'string', maxLength: 240 }, description: { type: 'string', maxLength: 3000 }, status: { type: 'string', enum: ['todo', 'in_progress', 'done', 'blocked'] } }, ['idempotencyKey', 'expectedVersion', 'processId', 'itemId']),
  },
  {
    name: 'create_delivery', scope: 'processes:deliveries', domain: 'processes',
    description: 'Cria uma entrega para validação com evidência reconciliável.',
    inputSchema: withContext({ ...IDEMPOTENCY, ...EXPECTED_VERSION, processId: { type: 'integer', minimum: 1 }, title: { type: 'string', minLength: 1, maxLength: 240 }, summary: { type: 'string', minLength: 1, maxLength: 5000 }, version: { type: 'string', maxLength: 120 }, environment: { type: 'string', enum: ['development', 'staging', 'production'] }, status: { type: 'string', enum: ['draft', 'ready'] }, artifactLinks: { type: 'array', maxItems: 20, items: { type: 'string', format: 'uri' } }, releaseNotes: { type: 'string', maxLength: 5000 }, rollbackPlan: { type: 'string', maxLength: 5000 } }, ['idempotencyKey', 'expectedVersion', 'processId', 'title', 'summary']),
  },
  {
    name: 'review_delivery', scope: 'processes:review', domain: 'processes',
    description: 'Aceita ou rejeita uma entrega em validação usando a versão esperada da entrega.',
    inputSchema: withContext({ ...IDEMPOTENCY, ...EXPECTED_VERSION, processId: { type: 'integer', minimum: 1 }, deliveryId: { type: 'integer', minimum: 1 }, status: { type: 'string', enum: ['accepted', 'rejected'] }, acceptanceNote: { type: 'string', maxLength: 5000 } }, ['idempotencyKey', 'expectedVersion', 'processId', 'deliveryId', 'status']),
  },
  {
    name: 'create_mapping_draft', scope: 'mappings:write', domain: 'mappings',
    description: 'Cria uma nova revisão de De-Para em rascunho. Não publica e exige idempotência.',
    inputSchema: withContext({
      ...IDEMPOTENCY,
      integrationId: { type: 'integer', minimum: 1 },
      processId: { type: ['integer', 'null'], minimum: 1 },
      name: { type: 'string', minLength: 1, maxLength: 160 },
      description: { type: 'string', maxLength: 3000 },
      contentMarkdown: { type: 'string', maxLength: 250000 },
      sourceSystem: { type: 'string', minLength: 1, maxLength: 160 },
      targetSystem: { type: 'string', minLength: 1, maxLength: 160 },
      validationRules: { type: 'object', additionalProperties: { type: 'boolean' } },
    }, ['idempotencyKey', 'integrationId', 'name', 'sourceSystem', 'targetSystem']),
  },
  {
    name: 'update_mapping_draft', scope: 'mappings:write', domain: 'mappings',
    description: 'Atualiza um De-Para em rascunho usando a revisão esperada e invalida aprovações anteriores.',
    inputSchema: withContext({
      ...IDEMPOTENCY, ...EXPECTED_REVISION,
      mappingSetId: { type: 'integer', minimum: 1 },
      processId: { type: ['integer', 'null'], minimum: 1 },
      name: { type: 'string', maxLength: 160 },
      description: { type: ['string', 'null'], maxLength: 3000 },
      contentMarkdown: { type: ['string', 'null'], maxLength: 250000 },
      sourceSystem: { type: 'string', maxLength: 160 },
      targetSystem: { type: 'string', maxLength: 160 },
      validationRules: { type: 'object', additionalProperties: { type: 'boolean' } },
    }, ['idempotencyKey', 'expectedRevision', 'mappingSetId']),
  },
  {
    name: 'propose_mapping_entry', scope: 'mappings:write', domain: 'mappings',
    description: 'Propõe uma entrada estruturada no De-Para em rascunho e avança sua revisão.',
    inputSchema: withContext({
      ...IDEMPOTENCY, ...EXPECTED_REVISION,
      mappingSetId: { type: 'integer', minimum: 1 },
      sourcePath: { type: 'string', minLength: 1, maxLength: 500 },
      sourceType: { type: ['string', 'null'], maxLength: 80 },
      targetPath: { type: 'string', minLength: 1, maxLength: 500 },
      targetType: { type: ['string', 'null'], maxLength: 80 },
      direction: { type: 'string', enum: ['source_to_target', 'target_to_source', 'bidirectional'] },
      transformation: { type: ['string', 'null'], maxLength: 5000 },
      fallbackValue: { type: ['string', 'null'], maxLength: 2000 },
      isRequired: { type: 'boolean' },
      notes: { type: ['string', 'null'], maxLength: 3000 },
      examples: { type: 'object' },
      section: { type: ['string', 'null'], maxLength: 240 },
      mappingStatus: { type: 'string', enum: ['mapped', 'pending', 'attention', 'ignored'] },
    }, ['idempotencyKey', 'expectedRevision', 'mappingSetId', 'sourcePath', 'targetPath']),
  },
  {
    name: 'update_mapping_entry', scope: 'mappings:write', domain: 'mappings',
    description: 'Atualiza uma entrada de De-Para com controle otimista de revisão.',
    inputSchema: withContext({
      ...IDEMPOTENCY, ...EXPECTED_REVISION,
      mappingSetId: { type: 'integer', minimum: 1 },
      entryId: { type: 'integer', minimum: 1 },
      sourcePath: { type: 'string', maxLength: 500 },
      sourceType: { type: ['string', 'null'], maxLength: 80 },
      targetPath: { type: 'string', maxLength: 500 },
      targetType: { type: ['string', 'null'], maxLength: 80 },
      direction: { type: 'string', enum: ['source_to_target', 'target_to_source', 'bidirectional'] },
      transformation: { type: ['string', 'null'], maxLength: 5000 },
      fallbackValue: { type: ['string', 'null'], maxLength: 2000 },
      isRequired: { type: 'boolean' },
      notes: { type: ['string', 'null'], maxLength: 3000 },
      examples: { type: 'object' },
      section: { type: ['string', 'null'], maxLength: 240 },
      mappingStatus: { type: 'string', enum: ['mapped', 'pending', 'attention', 'ignored'] },
    }, ['idempotencyKey', 'expectedRevision', 'mappingSetId', 'entryId']),
  },
  {
    name: 'add_mapping_comment', scope: 'mappings:comment', domain: 'mappings',
    description: 'Registra comentário rastreável no De-Para sem alterar seu conteúdo.',
    inputSchema: withContext({
      ...IDEMPOTENCY, ...EXPECTED_REVISION,
      mappingSetId: { type: 'integer', minimum: 1 },
      message: { type: 'string', minLength: 1, maxLength: 2000 },
    }, ['idempotencyKey', 'expectedRevision', 'mappingSetId', 'message']),
  },
  {
    name: 'request_mapping_review', scope: 'mappings:review', domain: 'mappings',
    description: 'Submete a revisão exata de um De-Para para aprovação humana. Não publica.',
    inputSchema: withContext({
      ...IDEMPOTENCY, ...EXPECTED_REVISION,
      mappingSetId: { type: 'integer', minimum: 1 },
      note: { type: ['string', 'null'], maxLength: 2000 },
    }, ['idempotencyKey', 'expectedRevision', 'mappingSetId']),
  },
  {
    name: 'publish_mapping', scope: 'mappings:publish', domain: 'mappings',
    description: 'Publica somente a revisão exata previamente aprovada por uma pessoa no Lambda Pulse.',
    inputSchema: withContext({
      ...IDEMPOTENCY, ...EXPECTED_REVISION,
      mappingSetId: { type: 'integer', minimum: 1 },
    }, ['idempotencyKey', 'expectedRevision', 'mappingSetId']),
  },
  {
    name: 'propose_lambda_source_revision', scope: 'integrations:source:write', domain: 'integrations',
    description: 'Cria uma revisão de código em rascunho. Não publica na AWS e exige aprovação humana posterior.',
    inputSchema: withContext({
      ...IDEMPOTENCY,
      integrationId: { type: 'integer', minimum: 1 },
      baseCodeSha256: { type: 'string', minLength: 1, maxLength: 200 },
      summary: { type: 'string', minLength: 1, maxLength: 1000 },
      files: { type: 'object', minProperties: 1, maxProperties: 150, additionalProperties: { type: 'string', maxLength: 524288 } },
      deletedFiles: { type: 'array', maxItems: 150, items: { type: 'string', minLength: 1, maxLength: 500 } },
    }, ['idempotencyKey', 'integrationId', 'baseCodeSha256', 'summary', 'files']),
  },
  {
    name: 'request_lambda_source_review', scope: 'integrations:source:review', domain: 'integrations',
    description: 'Envia um rascunho de código para aprovação humana no Lambda Pulse. Não publica na AWS.',
    inputSchema: withContext({
      ...IDEMPOTENCY,
      integrationId: { type: 'integer', minimum: 1 },
      revisionId: { type: 'integer', minimum: 1 },
    }, ['idempotencyKey', 'integrationId', 'revisionId']),
  },
  {
    name: 'update_integration_metadata', scope: 'integrations:write', domain: 'integrations',
    description: 'Atualiza nome, estado operacional e links de documentação de uma integração com idempotência e controle otimista. Não altera função, região ou credenciais AWS.',
    inputSchema: withContext({
      ...IDEMPOTENCY, ...EXPECTED_VERSION,
      integrationId: { type: 'integer', minimum: 1 },
      name: { type: 'string', minLength: 1, maxLength: 160 },
      lifecycleStatus: { type: 'string', enum: ['active', 'paused', 'maintenance'] },
      documentationLinks: { type: 'array', maxItems: 20, items: { type: 'string', format: 'uri', maxLength: 2000 } },
    }, ['idempotencyKey', 'expectedVersion', 'integrationId']),
  },
].map(tool => ({ ...tool, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } }));

function publicToolsFor(principal) {
  return [...MCP_TOOL_DEFINITIONS, ...MCP_WRITE_TOOL_DEFINITIONS]
    .filter((tool) => !tool.domain || principal.allowedDomains[tool.domain] !== false || (tool.name === 'list_integration_logs' && principal.allowedDomains.logs !== false))
    .filter(tool => !tool.scope || principal.allowedScopes.has(tool.scope))
    .map(({ domain, scope, ...tool }) => tool);
}

function readClientContext(args) {
  const raw = args?.client_context && typeof args.client_context === 'object' ? args.client_context : {};
  const email = String(raw.email || args?.client_email || '').trim().toLocaleLowerCase('pt-BR');
  const labels = Array.isArray(raw.labels) ? raw.labels.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 100) : [];
  return { email, labels };
}

async function resolveTargetCompany(principal, _args) {
  return {
    id: principal.id,
    name: principal.name,
    allowedDomains: principal.allowedDomains,
    allowedScopes: principal.allowedScopes,
  };
}

async function getAuthorizedClientEmails(companyId) {
  return mcpContacts.getAuthorizedEmails({ query }, companyId);
}

async function buildMcpAccessContext(target, args) {
  const authorizedClientEmails = await getAuthorizedClientEmails(target.id);
  const contact = readClientContext(args);
  const contactContextProvided = Boolean(args && (
    Object.prototype.hasOwnProperty.call(args, 'client_context')
    || Object.prototype.hasOwnProperty.call(args, 'client_email')
  ));
  const contactEmailMatched = contact.email ? authorizedClientEmails.includes(contact.email) : null;
  const accessGranted = !contactContextProvided || contactEmailMatched === true;
  return {
    companyId: target.id,
    companyName: target.name,
    authorizedClientEmails,
    accessGranted,
    accessMode: contactContextProvided ? 'delegated_contact' : 'company_api_key',
    emailMatchPolicy: 'exact_after_trim_and_lowercase',
    contactContextProvided,
    providedContactEmail: contact.email || null,
    contactEmailMatched,
    guidance: 'Compartilhe dados ou execute mudanças somente quando o contato possuir um email explícito que corresponda exatamente a authorizedClientEmails.',
  };
}

function requireDomain(target, domain, message) {
  if (target.allowedDomains[domain] === false) throw new Error(message);
}

function safeLimit(value, fallback = 20) {
  return Math.min(Math.max(Math.trunc(Number(value)) || fallback, 1), 50);
}

function safeOffset(value) {
  return Math.min(Math.max(Math.trunc(Number(value)) || 0, 0), 100000);
}

function pagination(total, offset, returned, limit) {
  return {
    total,
    offset,
    limit,
    returned,
    hasMore: offset + returned < total,
    nextOffset: offset + returned < total ? offset + returned : null,
    coverageComplete: offset === 0 && returned >= total,
  };
}

async function executeMcpTool(toolName, args, principal, resolvedTarget = null) {
  const target = resolvedTarget || await resolveTargetCompany(principal, args || {});
  const writeTool = MCP_WRITE_TOOL_DEFINITIONS.find(tool => tool.name === toolName);
  if (writeTool) {
    requireDomain(target, writeTool.domain, `Acesso a ${writeTool.domain} não está liberado.`);
    if (!principal.allowedScopes.has(writeTool.scope) || !target.allowedScopes.has(writeTool.scope)) throw new Error('A credencial MCP não possui o escopo desta escrita para a empresa alvo.');
    const handlerByName = {
      create_process_request: processDomain.createProcessRequest,
      update_process: processDomain.updateProcess,
      add_process_comment: processDomain.addProcessComment,
      create_checklist_item: processDomain.createChecklistItem,
      update_checklist_item: processDomain.updateChecklistItem,
      create_delivery: processDomain.createDelivery,
      review_delivery: processDomain.reviewDelivery,
      create_mapping_draft: mappingDomain.createMappingDraft,
      update_mapping_draft: mappingDomain.updateMappingDraft,
      propose_mapping_entry: mappingDomain.proposeMappingEntry,
      update_mapping_entry: mappingDomain.updateMappingEntry,
      add_mapping_comment: mappingDomain.addMappingComment,
      request_mapping_review: mappingDomain.requestMappingReview,
      publish_mapping: mappingDomain.publishMapping,
      propose_lambda_source_revision: lambdaSourceDomain.proposeLambdaSourceRevision,
      request_lambda_source_review: lambdaSourceDomain.requestLambdaSourceReview,
      update_integration_metadata: integrationDomain.updateIntegrationMetadata,
    };
    if (!handlerByName[toolName]) throw new Error('Ferramenta MCP de escrita desconhecida.');
    const result = await handlerByName[toolName]({ companyId: target.id, input: args || {} });
    if (writeTool.domain === 'processes') {
      const processId = Number(result.evidence?.processId || result.process?.id || args?.processId) || null;
      await publishDurableProcessEvent({
        companyId: target.id,
        processId,
        type: `process.mcp.${toolName}`,
        eventId: `mcp:${target.id}:${toolName}:${args?.idempotencyKey}`,
        data: { tool: toolName, reference: result.externalReference, evidence: result.evidence, idempotentReplay: Boolean(result.idempotentReplay) },
      });
    }
    return result;
  }
  switch (toolName) {
    case 'get_company_summary': {
      const [integrations, processes, mappings] = await Promise.all([
        target.allowedDomains.integrations ? query('SELECT COUNT(*)::int AS count FROM integrations WHERE company_id = $1', [target.id]) : Promise.resolve({ rows: [{ count: null }] }),
        target.allowedDomains.processes ? query('SELECT COUNT(*)::int AS count FROM process_items WHERE company_id = $1 AND is_client_visible = TRUE', [target.id]) : Promise.resolve({ rows: [{ count: null }] }),
        target.allowedDomains.mappings ? query('SELECT COUNT(*)::int AS count FROM integration_mapping_sets WHERE company_id = $1', [target.id]) : Promise.resolve({ rows: [{ count: null }] }),
      ]);
      return { companyName: target.name, totalIntegrations: integrations.rows[0].count, totalVisibleProcesses: processes.rows[0].count, totalMappingSets: mappings.rows[0].count, allowedDomains: target.allowedDomains, allowedScopes: [...target.allowedScopes].sort() };
    }
    case 'list_integration_logs': {
      if (!target.allowedDomains.logs && !target.allowedDomains.integrations) throw new Error('Acesso a logs e integrações não está liberado.');
      const limit = safeLimit(args.limit);
      const offset = safeOffset(args.offset);
      const integrations = target.allowedDomains.integrations
        ? await query(`SELECT id, name, function_name, region, lifecycle_status, metadata_version, last_check_status, last_check_message, last_checked_at, created_at, updated_at FROM integrations WHERE company_id = $1 ORDER BY name ASC`, [target.id])
        : { rows: [] };
      const [logs, logsCount] = target.allowedDomains.logs
        ? await Promise.all([
          query(`SELECT id, action, resource_type, resource_id, created_at FROM audit_logs WHERE company_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [target.id, limit, offset]),
          query('SELECT COUNT(*)::int AS count FROM audit_logs WHERE company_id = $1', [target.id]),
        ])
        : [{ rows: [] }, { rows: [{ count: 0 }] }];
      return { integrations: integrations.rows, recentEvents: logs.rows, eventsPagination: pagination(Number(logsCount.rows[0]?.count || 0), offset, logs.rows.length, limit) };
    }
    case 'get_integration_details': {
      requireDomain(target, 'integrations', 'Acesso a integrações não está liberado.');
      const integrationId = Number(args.integrationId);
      if (!Number.isInteger(integrationId) || integrationId < 1) throw new Error('integrationId inválido.');
      const integrationResult = await query(`
        SELECT i.id, i.name, i.function_name, i.region, i.memory_mb, i.show_cost_estimate, i.metadata_version,
               i.lifecycle_status, i.last_check_status, i.last_check_message, i.last_checked_at,
               i.documentation_links, i.created_at, ac.name AS aws_connection_name
          FROM integrations i
          LEFT JOIN aws_connections ac ON ac.id = i.aws_connection_id
         WHERE i.id = $1 AND i.company_id = $2
      `, [integrationId, target.id]);
      const integration = integrationResult.rows[0];
      if (!integration) throw new Error('Integração não encontrada nesta empresa.');
      const [processes, mappings, sourceRevision] = await Promise.all([
        query(`
          SELECT p.id, p.reference_code, p.title, p.status, p.health, p.progress, p.version, p.updated_at
            FROM process_integrations pi
            JOIN process_items p ON p.id = pi.process_id
           WHERE pi.integration_id = $1 AND p.company_id = $2 AND p.is_client_visible = TRUE
           ORDER BY p.updated_at DESC
        `, [integrationId, target.id]),
        query(`
          SELECT id, name, source_system, target_system, version, revision, status,
                 approval_status, approval_revision, updated_at
            FROM integration_mapping_sets
           WHERE integration_id = $1 AND company_id = $2
           ORDER BY updated_at DESC
        `, [integrationId, target.id]),
        query(`
          SELECT id, revision, status, summary, base_code_sha256, aws_code_sha256,
                 review_requested_at, approved_at, published_at, created_at, updated_at
            FROM lambda_source_revisions
           WHERE integration_id = $1
           ORDER BY revision DESC LIMIT 1
        `, [integrationId]),
      ]);
      return {
        integration: {
          id: integration.id,
          externalReference: `lambda-pulse:integration:${integration.id}`,
          name: integration.name,
          functionName: integration.function_name,
          region: integration.region,
          memoryMb: integration.memory_mb,
          showCostEstimate: integration.show_cost_estimate,
          lifecycleStatus: integration.lifecycle_status,
          lastCheckStatus: integration.last_check_status,
          lastCheckMessage: integration.last_check_message,
          lastCheckedAt: integration.last_checked_at,
          documentationLinks: integration.documentation_links || [],
          metadataVersion: integration.metadata_version,
          awsConnectionName: integration.aws_connection_name || null,
          createdAt: integration.created_at,
        },
        linkedProcesses: processes.rows,
        mappingSets: mappings.rows,
        latestSourceRevision: sourceRevision.rows[0] || null,
      };
    }
    case 'get_integration_observability': {
      if (!target.allowedDomains.logs || !target.allowedDomains.integrations) {
        throw new Error('Acesso simultâneo a logs e integrações é necessário para esta consulta.');
      }
      const integrationId = Number(args.integrationId);
      if (!Number.isInteger(integrationId) || integrationId < 1) throw new Error('integrationId inválido.');
      const integrationResult = await query(
        `SELECT integrations.id, integrations.name, integrations.function_name, integrations.region,
                integrations.lifecycle_status, integrations.metadata_version, integrations.last_check_status,
                integrations.last_check_message, integrations.last_checked_at,
                COALESCE(integrations.access_key_encrypted, aws_connections.access_key_encrypted) AS access_key_encrypted,
                COALESCE(integrations.secret_key_encrypted, aws_connections.secret_key_encrypted) AS secret_key_encrypted
           FROM integrations
           LEFT JOIN aws_connections ON aws_connections.id = integrations.aws_connection_id
          WHERE integrations.id = $1 AND integrations.company_id = $2`,
        [integrationId, target.id],
      );
      const integration = integrationResult.rows[0];
      if (!integration) throw new Error('Integração não encontrada nesta empresa.');
      const hours = Math.min(Math.max(Number(args.hours) || 24, 1), 168);
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 20);
      const logType = ['relevant', 'errors', 'all'].includes(args.logType) ? args.logType : 'relevant';
      const [metrics, logs] = await Promise.all([
        integrationObservability.getMetricsSnapshot({ integration, hours }),
        integrationObservability.getLogsSnapshot({
          integration,
          hours,
          limit,
          type: logType,
          search: String(args.search || '').slice(0, 200),
          includeRaw: false,
        }),
      ]);
      const health = metrics.summary.errors > 0 || metrics.summary.throttles > 0
        ? 'attention'
        : integration.last_check_status === 'error' ? 'attention' : 'healthy';
      return {
        integration: {
          id: integration.id,
          externalReference: `lambda-pulse:integration:${integration.id}`,
          name: integration.name,
          functionName: integration.function_name,
          region: integration.region,
          lifecycleStatus: integration.lifecycle_status,
          metadataVersion: integration.metadata_version,
          lastCheckStatus: integration.last_check_status,
          lastCheckMessage: integration.last_check_message,
          lastCheckedAt: integration.last_checked_at,
        },
        health,
        metrics,
        executionsAndErrors: logs,
      };
    }
    case 'get_lambda_source': {
      requireDomain(target, 'integrations', 'Acesso a integrações não está liberado.');
      const integrationId = Number(args.integrationId);
      if (!Number.isInteger(integrationId) || integrationId < 1) throw new Error('integrationId inválido.');
      const result = await query(
        `SELECT integrations.id, integrations.name, integrations.function_name, integrations.region, integrations.company_id,
                COALESCE(integrations.access_key_encrypted, aws_connections.access_key_encrypted) AS access_key_encrypted,
                COALESCE(integrations.secret_key_encrypted, aws_connections.secret_key_encrypted) AS secret_key_encrypted
           FROM integrations
           LEFT JOIN aws_connections ON aws_connections.id = integrations.aws_connection_id
          WHERE integrations.id = $1 AND integrations.company_id = $2`,
        [integrationId, target.id]
      );
      const integration = result.rows[0];
      if (!integration) throw new Error('Integração não encontrada nesta empresa.');
      const snapshot = await fetchLambdaArchive(integration);
      const source = extractEditableFiles(snapshot.archive);
      const requested = Array.isArray(args.filePaths) ? [...new Set(args.filePaths.map(String))].slice(0, 30) : [];
      const contents = Object.fromEntries(requested.filter(name => Object.hasOwn(source.files, name)).map(name => [name, source.files[name]]));
      return {
        integrationId,
        functionName: integration.function_name,
        region: integration.region,
        runtime: snapshot.configuration.Runtime || null,
        handler: snapshot.configuration.Handler || null,
        codeSha256: snapshot.configuration.CodeSha256 || null,
        lastModified: snapshot.configuration.LastModified || null,
        editableFiles: Object.keys(source.files),
        excludedFileCount: source.excluded.length,
        files: contents,
        nextStep: requested.length ? 'Use propose_lambda_source_revision para criar um rascunho; a publicação continuará bloqueada até aprovação humana.' : 'Solicite novamente com filePaths para ler o conteúdo necessário.'
      };
    }
    case 'list_lambda_source_revisions': {
      requireDomain(target, 'integrations', 'Acesso a integrações não está liberado.');
      const values = [target.id];
      const conditions = ['integrations.company_id = $1'];
      const integrationId = args.integrationId === undefined ? null : Number(args.integrationId);
      if (integrationId !== null) {
        if (!Number.isInteger(integrationId) || integrationId < 1) throw new Error('integrationId inválido.');
        values.push(integrationId);
        conditions.push(`revisions.integration_id = $${values.length}`);
      }
      const parseBoundary = (value, label) => {
        if (!value) return null;
        const parsed = new Date(String(value));
        if (Number.isNaN(parsed.getTime())) throw new Error(`${label} inválido.`);
        return parsed.toISOString();
      };
      const since = parseBoundary(args.since, 'since');
      const until = parseBoundary(args.until, 'until');
      if (since && until && since > until) throw new Error('since não pode ser posterior a until.');
      if (since) {
        values.push(since);
        conditions.push(`revisions.created_at >= $${values.length}`);
      }
      if (until) {
        values.push(until);
        conditions.push(`revisions.created_at <= $${values.length}`);
      }
      if (args.status) {
        values.push(String(args.status));
        conditions.push(`revisions.status = $${values.length}`);
      }
      const where = conditions.join(' AND ');
      const limit = Math.min(Math.max(Number(args.limit) || 500, 1), 500);
      const count = await query(
        `SELECT COUNT(*)::int AS count
           FROM lambda_source_revisions revisions
           JOIN integrations ON integrations.id = revisions.integration_id
          WHERE ${where}`,
        values,
      );
      const rowValues = [...values, limit];
      const result = await query(
        `SELECT revisions.id, revisions.integration_id AS "integrationId", integrations.name AS "integrationName",
                integrations.function_name AS "functionName", revisions.revision, revisions.status,
                revisions.summary, revisions.files, revisions.deleted_files AS "deletedFiles",
                revisions.review_requested_at AS "reviewRequestedAt", revisions.approved_at AS "approvedAt",
                revisions.published_at AS "publishedAt", revisions.created_at AS "createdAt",
                revisions.updated_at AS "updatedAt", revisions.base_code_sha256 AS "baseCodeSha256",
                revisions.aws_code_sha256 AS "awsCodeSha256"
           FROM lambda_source_revisions revisions
           JOIN integrations ON integrations.id = revisions.integration_id
          WHERE ${where}
          ORDER BY revisions.created_at ASC, revisions.id ASC
          LIMIT $${rowValues.length}`,
        rowValues,
      );
      const total = Number(count.rows[0]?.count || 0);
      const revisions = result.rows.map(({ files, ...revision }) => ({
        ...revision,
        changedFiles: files && typeof files === 'object' && !Array.isArray(files) ? Object.keys(files) : [],
        deletedFiles: Array.isArray(revision.deletedFiles) ? revision.deletedFiles : [],
      }));
      return {
        total,
        returned: revisions.length,
        revisions,
        coverage: {
          complete: revisions.length === total,
          omitted: Math.max(0, total - revisions.length),
          since,
          until,
          integrationId,
          status: args.status || null,
        },
      };
    }
    case 'list_processes_and_docs': {
      requireDomain(target, 'processes', 'Acesso a processos e documentos não está liberado.');
      const params = [target.id];
      let statusSql = '';
      if (args.status) { params.push(String(args.status)); statusSql = ` AND p.status = $${params.length}`; }
      const countParams = [...params];
      const totalResult = await query(`SELECT COUNT(*)::int AS count FROM process_items WHERE company_id = $1 AND is_client_visible = TRUE${statusSql}`, countParams);
      const limit = safeLimit(args.limit);
      const offset = safeOffset(args.offset);
      params.push(limit, offset);
      const processes = await query(`
        SELECT p.id, p.reference_code, p.title, LEFT(p.description, 2000) AS description, p.category, p.status, p.priority, p.impact,
               p.health, p.progress, p.due_date, p.target_sla_at, p.delivered_at, p.latest_update, p.version, p.created_at, p.updated_at,
               (SELECT COUNT(*)::int FROM process_updates u WHERE u.process_id = p.id AND u.visibility = 'client') AS updates_count,
               (SELECT COUNT(*)::int FROM process_deliveries d WHERE d.process_id = p.id) AS deliveries_count
          FROM process_items p
         WHERE p.company_id = $1 AND p.is_client_visible = TRUE${statusSql}
         ORDER BY p.updated_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}
      `, params);
      const processIds = processes.rows.map((process) => Number(process.id)).filter(Number.isInteger);
      const deliveries = processIds.length ? await query(`
        SELECT d.id, d.process_id, d.title, LEFT(d.summary, 2000) AS summary, d.version, d.row_version, d.environment, d.status, d.artifact_links,
               LEFT(d.release_notes, 4000) AS release_notes, d.delivered_at, d.created_at
          FROM process_deliveries d JOIN process_items p ON p.id = d.process_id
         WHERE p.company_id = $1 AND p.is_client_visible = TRUE AND d.process_id = ANY($2::int[])
         ORDER BY d.created_at DESC
      `, [target.id, processIds]) : { rows: [] };
      return {
        processes: processes.rows,
        deliveriesAndDocs: deliveries.rows,
        pagination: pagination(Number(totalResult.rows[0]?.count || 0), offset, processes.rows.length, limit),
      };
    }
    case 'get_process_details': {
      requireDomain(target, 'processes', 'Acesso a processos e documentos não está liberado.');
      const processId = Number(args.processId);
      if (!Number.isInteger(processId) || processId < 1) throw new Error('processId inválido.');
      const processResult = await query(`
        SELECT id, reference_code, title, LEFT(description, 4000) AS description, LEFT(objective, 2000) AS objective,
               LEFT(scope, 4000) AS scope, LEFT(acceptance_criteria, 4000) AS acceptance_criteria, category, status,
               priority, impact, health, complexity, progress, estimate_business_days, planned_start, due_date,
               target_sla_at, delivered_at, blocked_reason, next_action, tags, latest_update, version, created_at, updated_at
          FROM process_items WHERE id = $1 AND company_id = $2 AND is_client_visible = TRUE
      `, [processId, target.id]);
      if (!processResult.rows[0]) throw new Error('Processo não encontrado ou não visível para esta empresa.');
      const [updates, checklist, deliveries] = await Promise.all([
        query(`SELECT id, kind, LEFT(message, 4000) AS message, created_at FROM process_updates WHERE process_id = $1 AND visibility = 'client' ORDER BY created_at DESC LIMIT 50`, [processId]),
        query(`SELECT id, title, description, status, due_date, sort_order, version, completed_at, updated_at FROM process_checklist_items WHERE process_id = $1 ORDER BY sort_order ASC, id ASC`, [processId]),
        query(`SELECT id, title, LEFT(summary, 2000) AS summary, version, row_version, environment, status, artifact_links, LEFT(release_notes, 4000) AS release_notes, delivered_at, updated_at FROM process_deliveries WHERE process_id = $1 ORDER BY created_at DESC LIMIT 30`, [processId]),
      ]);
      return { process: processResult.rows[0], updates: updates.rows, checklist: checklist.rows, deliveriesAndDocs: deliveries.rows };
    }
    case 'list_mappings_and_entries': {
      requireDomain(target, 'mappings', 'Acesso a mapeamentos não está liberado.');
      const params = [target.id];
      let statusSql = '';
      if (args.status) { params.push(String(args.status)); statusSql = ` AND s.status = $${params.length}`; }
      const totalResult = await query(`SELECT COUNT(*)::int AS count FROM integration_mapping_sets WHERE company_id = $1${statusSql}`, [...params]);
      const limit = safeLimit(args.limit);
      const offset = safeOffset(args.offset);
      params.push(limit, offset);
      const sets = await query(`
        SELECT s.id, s.name, LEFT(s.description, 2000) AS description, s.source_system, s.target_system, s.version, s.revision, s.status,
               s.approval_status, s.approval_revision, s.approval_requested_at, s.approved_at,
               s.created_at, s.updated_at,
               (SELECT COUNT(*)::int FROM integration_mapping_entries e WHERE e.mapping_set_id = s.id) AS entries_count,
               (SELECT COUNT(*)::int FROM integration_mapping_attachments a WHERE a.mapping_set_id = s.id) AS attachments_count
          FROM integration_mapping_sets s WHERE s.company_id = $1${statusSql}
         ORDER BY s.updated_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}
      `, params);
      const mappingSetIds = sets.rows.map((set) => Number(set.id)).filter(Number.isInteger);
      const attachments = mappingSetIds.length ? await query(`
        SELECT a.id, a.mapping_set_id, a.file_name, a.mime_type, a.file_size, a.created_at
          FROM integration_mapping_attachments a JOIN integration_mapping_sets s ON s.id = a.mapping_set_id
         WHERE s.company_id = $1 AND a.mapping_set_id = ANY($2::int[]) ORDER BY a.created_at DESC
      `, [target.id, mappingSetIds]) : { rows: [] };
      return {
        mappingSets: sets.rows,
        attachments: attachments.rows,
        pagination: pagination(Number(totalResult.rows[0]?.count || 0), offset, sets.rows.length, limit),
      };
    }
    case 'get_mapping_details': {
      requireDomain(target, 'mappings', 'Acesso a mapeamentos não está liberado.');
      const mappingSetId = Number(args.mappingSetId);
      if (!Number.isInteger(mappingSetId) || mappingSetId < 1) throw new Error('mappingSetId inválido.');
      const setResult = await query(`
        SELECT id, name, LEFT(description, 2000) AS description, LEFT(content_markdown, 16000) AS content_markdown,
               source_system, target_system, version, revision, status,
               client_edit_mode, client_can_add_entries, client_can_delete_entries, client_instructions,
               validation_rules, approval_status, approval_revision, approval_requested_at,
               approved_at, approved_by, approval_note, published_at, closed_at, created_at, updated_at
          FROM integration_mapping_sets WHERE id = $1 AND company_id = $2
      `, [mappingSetId, target.id]);
      if (!setResult.rows[0]) throw new Error('Conjunto de mapeamento não encontrado para esta empresa.');
      const entryLimit = Math.min(Math.max(Number(args.entryLimit) || 250, 1), 250);
      const entryOffset = safeOffset(args.entryOffset);
      const [entries, entryCount, attachments, history] = await Promise.all([
        query(`SELECT id, source_path, source_type, target_path, target_type, direction, transformation, fallback_value, is_required, notes, examples, section, mapping_status, sort_order FROM integration_mapping_entries WHERE mapping_set_id = $1 ORDER BY sort_order ASC, id ASC LIMIT $2 OFFSET $3`, [mappingSetId, entryLimit, entryOffset]),
        query('SELECT COUNT(*)::int AS count FROM integration_mapping_entries WHERE mapping_set_id = $1', [mappingSetId]),
        query(`SELECT id, file_name, mime_type, file_size, LEFT(extracted_text, 2000) AS extracted_text_preview, created_at FROM integration_mapping_attachments WHERE mapping_set_id = $1 ORDER BY created_at DESC LIMIT 10`, [mappingSetId]),
        query(`SELECT id, action, entity_type, summary, mapping_revision, created_at FROM integration_mapping_changes WHERE mapping_set_id = $1 AND client_visible = TRUE ORDER BY created_at DESC LIMIT 20`, [mappingSetId]),
      ]);
      return {
        mappingSet: setResult.rows[0],
        entries: entries.rows,
        entriesPagination: pagination(Number(entryCount.rows[0]?.count || 0), entryOffset, entries.rows.length, entryLimit),
        attachments: attachments.rows,
        revisionHistory: history.rows,
      };
    }
    default:
      throw new Error('Ferramenta MCP desconhecida.');
  }
}

function auditMetadata(args, status, targetCompanyId, durationMs, requestId) {
  return {
    status,
    targetCompanyId,
    durationMs,
    requestId,
    arguments: {
      limit: args?.limit,
      status: args?.status,
      processId: args?.processId,
      mappingSetId: args?.mappingSetId,
      integrationId: args?.integrationId,
      entryId: args?.entryId,
      hasContactContext: Boolean(args?.client_context || args?.client_email),
      contactLabelCount: Array.isArray(args?.client_context?.labels) ? args.client_context.labels.length : 0,
    },
  };
}

async function auditMcpCall(principal, toolName, args, status, targetCompanyId, durationMs, requestMeta) {
  try {
    await query(`
      INSERT INTO audit_logs (company_id, action, resource_type, resource_id, metadata, ip_address, user_agent)
      VALUES ($1, $2, 'mcp_tool', $3, $4, $5, $6)
    `, [
      principal.id,
      `mcp.tool_call.${toolName}`,
      toolName,
      JSON.stringify(auditMetadata(args, status, targetCompanyId, durationMs, requestMeta.requestId)),
      requestMeta.ip,
      requestMeta.userAgent,
    ]);
  } catch (error) {
    console.error('[MCP Audit]', error);
  }
}

function createMcpServer(principal, requestMeta) {
  const server = new Server(
    { name: 'lambda-pulse', version: '2.2.0' },
    {
      capabilities: { tools: {} },
      instructions: 'A chave identifica uma única empresa. Comece por get_company_summary; toda resposta bem-sucedida inclui mcpAccess.authorizedClientEmails. Antes de compartilhar dados ou executar mudanças, confirme que o contato possui um email explícito com correspondência exata após trim e lowercase. Quando o chamador fornece contexto de conversa sem correspondência, o servidor bloqueia todas as outras tools.',
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: publicToolsFor(principal) }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const args = request.params.arguments || {};
    const startedAt = Date.now();
    let targetCompanyId = principal.id;
    let mcpAccess = null;
    try {
      const target = await resolveTargetCompany(principal, args);
      targetCompanyId = target.id;
      mcpAccess = await buildMcpAccessContext(target, args);
      if (toolName !== 'get_company_summary' && mcpAccess.contactContextProvided && mcpAccess.contactEmailMatched !== true) {
        throw new Error('O contato não possui um email explícito autorizado para consultar ou alterar dados desta empresa.');
      }
      const data = toolName === 'get_company_summary' && !mcpAccess.accessGranted
        ? { companyName: target.name, accessGranted: false }
        : await executeMcpTool(toolName, args, principal, target);
      await auditMcpCall(principal, toolName, args, 'success', targetCompanyId, Date.now() - startedAt, requestMeta);
      const response = data && typeof data === 'object' && !Array.isArray(data)
        ? { ...data, mcpAccess }
        : { result: data, mcpAccess };
      return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
    } catch (error) {
      await auditMcpCall(principal, toolName, args, 'error', targetCompanyId, Date.now() - startedAt, requestMeta);
      const errorPayload = mcpAccess
        ? { error: error.message || 'Não foi possível executar a ferramenta.', mcpAccess }
        : { error: error.message || 'Não foi possível executar a ferramenta.' };
      return { isError: true, content: [{ type: 'text', text: JSON.stringify(errorPayload, null, 2) }] };
    }
  });
  return server;
}

function requestMeta(req) {
  return {
    requestId: req.requestId || crypto.randomUUID(),
    ip: req.ip || null,
    userAgent: req.get('user-agent') || null,
  };
}

router.use(originGuard);

router.post('/', mcpAuthMiddleware, async (req, res) => {
  const server = createMcpServer(req.mcpPrincipal, requestMeta(req));
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('[MCP Streamable HTTP]', error);
    if (!res.headersSent) rpcError(res, 500, -32603, 'Erro interno no transporte MCP.', req.body?.id ?? null);
  } finally {
    await Promise.allSettled([transport.close(), server.close()]);
  }
});

router.get('/', mcpAuthMiddleware, (_req, res) => rpcError(res, 405, -32000, 'Este servidor MCP opera em modo stateless; envie requisições POST para este endpoint.'));
router.delete('/', mcpAuthMiddleware, (_req, res) => rpcError(res, 405, -32000, 'Não há sessão persistente para encerrar.'));

router.get('/sse', mcpAuthMiddleware, async (req, res) => {
  const server = createMcpServer(req.mcpPrincipal, requestMeta(req));
  const transport = new SSEServerTransport('/mcp/message', res);
  legacySseSessions.set(transport.sessionId, {
    transport,
    server,
    principalId: req.mcpPrincipal.id,
    tokenHash: req.mcpPrincipal.tokenHash,
  });
  res.on('close', () => legacySseSessions.delete(transport.sessionId));
  try {
    await server.connect(transport);
  } catch (error) {
    legacySseSessions.delete(transport.sessionId);
    console.error('[MCP Legacy SSE]', error);
    if (!res.headersSent) rpcError(res, 500, -32603, 'Erro ao iniciar o transporte SSE legado.');
  }
});

router.post('/message', mcpAuthMiddleware, async (req, res) => {
  const session = legacySseSessions.get(String(req.query.sessionId || ''));
  if (!session) return rpcError(res, 404, -32006, 'Sessão SSE inexistente ou expirada.', req.body?.id ?? null);
  if (session.principalId !== req.mcpPrincipal.id || session.tokenHash !== req.mcpPrincipal.tokenHash) {
    return rpcError(res, 403, -32007, 'A credencial não pertence a esta sessão SSE.', req.body?.id ?? null);
  }
  try {
    await session.transport.handlePostMessage(req, res, req.body);
  } catch (error) {
    console.error('[MCP Legacy SSE Message]', error);
    if (!res.headersSent) rpcError(res, 500, -32603, 'Erro ao processar a mensagem SSE.', req.body?.id ?? null);
  }
});

router._mcpInternals = { executeMcpTool, resolveTargetCompany, getAuthorizedClientEmails, buildMcpAccessContext, publicToolsFor, isMeteredMcpRequest, legacySseSessions };

module.exports = router;
