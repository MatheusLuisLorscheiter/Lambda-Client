const express = require('express');
const { LambdaClient, ListFunctionsCommand } = require('@aws-sdk/client-lambda');
const { CloudWatchLogsClient, FilterLogEventsCommand } = require('@aws-sdk/client-cloudwatch-logs');
const { CloudWatchClient, GetMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { authenticateToken } = require('./auth');
const { query } = require('../db');
const { encrypt, decrypt } = require('../security/crypto');
const { client: redisClient, connectRedis } = require('../cache/redis');
const { logAudit } = require('../audit/logger');
const { summarizeLogs } = require('../copilot/summarizeLogs');

const router = express.Router();

const getIntegrationForUser = async (integrationId, user) => {
  const result = await query(
    'SELECT id, name, function_name, region, memory_mb, show_cost_estimate, documentation_links, access_key_encrypted, secret_key_encrypted, owner_user_id, client_user_id, company_id FROM integrations WHERE id = $1',
    [integrationId]
  );

  const integration = result.rows[0];
  if (!integration) {
    return null;
  }

  if (user.role === 'admin') {
    return integration;
  }

  if (user.role === 'client' && integration.company_id === user.companyId) {
    return integration;
  }

  return null;
};

const parseReportLine = (message) => {
  const durationMatch = message.match(/Duration: ([\d.]+) ms/);
  const billedMatch = message.match(/Billed Duration: (\d+) ms/);
  const memorySizeMatch = message.match(/Memory Size: (\d+) MB/);
  const maxMemoryMatch = message.match(/Max Memory Used: (\d+) MB/);
  const initDurationMatch = message.match(/Init Duration: ([\d.]+) ms/);
  const statusMatch = message.match(/Status: (\w+)/i);

  if (!durationMatch && !billedMatch && !memorySizeMatch && !maxMemoryMatch && !initDurationMatch) {
    return null;
  }

  return {
    durationMs: durationMatch ? Number(durationMatch[1]) : null,
    billedDurationMs: billedMatch ? Number(billedMatch[1]) : null,
    memorySizeMb: memorySizeMatch ? Number(memorySizeMatch[1]) : null,
    maxMemoryUsedMb: maxMemoryMatch ? Number(maxMemoryMatch[1]) : null,
    initDurationMs: initDurationMatch ? Number(initDurationMatch[1]) : null,
    status: statusMatch ? statusMatch[1].toLowerCase() : null
  };
};

const extractJsonPayload = (message) => {
  if (!message) return null;
  const firstBrace = message.indexOf('{');
  if (firstBrace === -1) return null;

  const jsonText = message.slice(firstBrace).trim();
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
};

const simplifyLogMessage = (message, parsedReport) => {
  const raw = (message || '').trim();
  const lower = raw.toLowerCase();
  const parsedJson = extractJsonPayload(raw);

  const result = {
    simplifiedMessage: null,
    category: null,
    level: 'info'
  };

  if (/^start requestid:/i.test(raw)) {
    result.category = 'INÍCIO';
    result.simplifiedMessage = 'Início da execução';
    return result;
  }

  if (/^end requestid:/i.test(raw)) {
    result.category = 'FIM';
    result.simplifiedMessage = 'Fim da execução';
    return result;
  }

  if (/^init_start/i.test(raw)) {
    result.category = 'INÍCIO';
    result.simplifiedMessage = 'Inicialização do runtime';
    return result;
  }

  if (/^report\b/i.test(raw)) {
    result.category = 'RELATÓRIO';
    const duration = parsedReport?.durationMs != null ? `${parsedReport.durationMs} ms` : '—';
    const billed = parsedReport?.billedDurationMs != null ? `${parsedReport.billedDurationMs} ms` : '—';
    const maxMemory = parsedReport?.maxMemoryUsedMb != null ? `${parsedReport.maxMemoryUsedMb} MB` : '—';
    const statusText = parsedReport?.status ? ` • status ${parsedReport.status}` : '';
    if (parsedReport?.status === 'timeout') {
      result.level = 'error';
    }
    result.simplifiedMessage = `Relatório: duração ${duration}, cobrado ${billed}, uso máx. ${maxMemory}${statusText}`;
    return result;
  }

  if (parsedJson && typeof parsedJson.message === 'string') {
    const payload = parsedJson.data || {};
    const messageKey = parsedJson.message;

    if (messageKey === 'Lambda start: event recebido') {
      result.category = 'INÍCIO';
      result.simplifiedMessage = 'Início: evento recebido';
      return result;
    }

    if (messageKey === 'Lambda payload parseado') {
      result.category = 'INFO';
      result.simplifiedMessage = 'Payload recebido e processado';
      return result;
    }

    if (messageKey === 'HTTP request') {
      result.category = 'HTTP';
      const method = payload.method || 'GET';
      const url = payload.url || '';
      let hostPath = url;
      try {
        const parsedUrl = new URL(url);
        hostPath = `${parsedUrl.hostname}${parsedUrl.pathname}`;
      } catch {
        // keep raw url
      }
      result.simplifiedMessage = `Requisição HTTP ${method} ${hostPath}`;
      return result;
    }

    if (messageKey === 'HTTP response ok') {
      result.category = 'HTTP';
      const status = payload.status || '200';
      result.simplifiedMessage = `Resposta HTTP OK (status ${status})`;
      return result;
    }

    if (messageKey === 'RD request attempt') {
      result.category = 'INTEGRAÇÃO';
      const method = payload.method || 'GET';
      result.simplifiedMessage = `Tentativa RD Station (${method})`;
      return result;
    }

    if (messageKey === 'Omie request attempt') {
      result.category = 'INTEGRAÇÃO';
      const callName = payload.callName || 'Omie';
      result.simplifiedMessage = `Tentativa Omie (${callName})`;
      return result;
    }

    if (messageKey === 'Vendedores Omie carregados') {
      result.category = 'INTEGRAÇÃO';
      const total = payload.total ?? 0;
      result.simplifiedMessage = `Vendedores Omie carregados (total ${total})`;
      return result;
    }

    if (messageKey === 'Deals resolvidos') {
      result.category = 'PROCESSO';
      const total = payload.total ?? 0;
      result.simplifiedMessage = `Deals resolvidos (total ${total})`;
      return result;
    }

    if (messageKey === 'Processando deal') {
      result.category = 'PROCESSO';
      const name = payload.deal_name || payload.deal_id || 'deal';
      result.simplifiedMessage = `Processando deal (${name})`;
      return result;
    }

    if (messageKey === 'Deal filtrado') {
      result.category = 'PROCESSO';
      const motivos = Array.isArray(payload.motivos) ? payload.motivos.join(', ') : 'motivo não informado';
      result.simplifiedMessage = `Deal filtrado (${motivos})`;
      return result;
    }

    if (messageKey === 'Resumo final') {
      result.category = 'PROCESSO';
      const sucesso = payload.totalSucesso ?? 0;
      const falha = payload.totalFalha ?? 0;
      result.simplifiedMessage = `Resumo final: ${sucesso} sucesso(s), ${falha} falha(s)`;
      if (falha > 0) {
        result.level = 'warn';
      }
      return result;
    }

    result.category = 'INFO';
    result.simplifiedMessage = messageKey;
    return result;
  }

  if (lower.includes('error') || lower.includes('exception') || lower.includes('fail') || lower.includes('timeout')) {
    result.category = 'ERRO';
    result.level = 'error';
  }

  result.simplifiedMessage = raw.length > 200 ? `${raw.slice(0, 197)}...` : raw;
  result.category = result.category || 'INFO';

  return result;
};

const normalizeDocumentationLinks = (input) => {
  if (input === undefined || input === null) {
    return [];
  }

  let items = [];
  if (Array.isArray(input)) {
    items = input;
  } else if (typeof input === 'string') {
    items = input.split(/\r?\n|,/g);
  } else {
    throw new Error('Formato de documentação inválido');
  }

  const normalized = items
    .map(item => String(item).trim())
    .filter(item => item.length > 0)
    .map(item => {
      let parsed;
      try {
        parsed = new URL(item);
      } catch {
        throw new Error(`Link inválido: ${item}`);
      }

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error(`Link inválido (protocolo): ${item}`);
      }

      return parsed.toString();
    });

  if (normalized.length > 20) {
    throw new Error('Limite de 20 links excedido');
  }

  return normalized;
};

const buildLogsPayload = async ({ integration, query, simplifyFlag, summaryFlag }) => {
  const logsClient = new CloudWatchLogsClient({
    region: integration.region,
    credentials: {
      accessKeyId: decrypt(integration.access_key_encrypted),
      secretAccessKey: decrypt(integration.secret_key_encrypted)
    }
  });

  const logGroupName = `/aws/lambda/${integration.function_name}`;

  const limit = Math.min(Number(query.limit) || 100, 500);
  const startTime = Number(query.startTime) || Date.now() - (24 * 60 * 60 * 1000);
  const endTime = Number(query.endTime) || Date.now();
  const search = (query.search || '').toString().trim();

  const filterCommand = new FilterLogEventsCommand({
    logGroupName,
    limit,
    startTime,
    endTime,
    filterPattern: search ? `?"${search}"` : undefined
  });

  const response = await logsClient.send(filterCommand);

  const type = (query.type || 'relevant').toString().toLowerCase();

  const normalizedLogs = (response.events || []).map(event => {
    const parsedReport = parseReportLine(event.message);
    const simplified = simplifyFlag || summaryFlag ? simplifyLogMessage(event.message, parsedReport) : null;

    return {
      timestamp: event.timestamp,
      message: event.message,
      parsedReport,
      simplifiedMessage: simplified?.simplifiedMessage ?? null,
      category: simplified?.category ?? null,
      level: simplified?.level ?? null
    };
  });

  const relevantLogs = normalizedLogs.filter(event => {
    const message = (event.message || '').toLowerCase();
    const isReportLine = /^report\b/i.test(event.message || '');

    if (type === 'error') {
      return message.includes('error') || message.includes('fail') || message.includes('exception');
    }

    if (type === 'report') {
      return isReportLine;
    }

    if (type === 'all') {
      return true;
    }

    return message.includes('error') ||
      message.includes('duration') ||
      message.includes('report') ||
      message.includes('fail') ||
      Boolean(event.parsedReport);
  });

  const sortedLogs = relevantLogs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  const reportEvents = sortedLogs.filter(log => log.parsedReport);
  const durationSamples = reportEvents
    .map(log => log.parsedReport.durationMs)
    .filter(value => typeof value === 'number');

  const timeRange = sortedLogs.length
    ? {
      startTime: sortedLogs[sortedLogs.length - 1].timestamp,
      endTime: sortedLogs[0].timestamp
    }
    : { startTime: null, endTime: null };

  const timeoutCount = reportEvents.filter(log => log.parsedReport?.status === 'timeout').length;

  const topMessagesMap = new Map();
  if (summaryFlag) {
    sortedLogs.forEach(log => {
      const baseMessage = log.simplifiedMessage || log.message || '';
      const trimmed = baseMessage.length > 120 ? `${baseMessage.slice(0, 117)}...` : baseMessage;
      if (!trimmed) return;
      topMessagesMap.set(trimmed, (topMessagesMap.get(trimmed) || 0) + 1);
    });
  }

  const topMessages = summaryFlag
    ? Array.from(topMessagesMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([message, count]) => ({ message, count }))
    : undefined;

  return {
    logs: sortedLogs,
    summary: {
      total: sortedLogs.length,
      reports: reportEvents.length,
      errors: sortedLogs.filter(log => log.level === 'error' || (log.message || '').toLowerCase().includes('error')).length,
      avgDurationMs: durationSamples.length
        ? durationSamples.reduce((sum, value) => sum + value, 0) / durationSamples.length
        : null,
      timeouts: timeoutCount,
      startTime: timeRange.startTime,
      endTime: timeRange.endTime,
      topMessages,
      filter: type,
      simplify: simplifyFlag
    },
    filter: type,
    limit,
    startTime,
    endTime,
    search
  };
};

const buildAiSummaryCacheKey = ({ integrationId, query, simplifyFlag, model }) => {
  return `logs-ai-summary:${integrationId}:${query.type || 'relevant'}:${query.limit || 100}:${query.startTime || 'default'}:${query.endTime || 'now'}:${query.search || ''}:${simplifyFlag ? 'simple' : 'raw'}:${model}`;
};

const parseAiSummaryState = (raw) => {
  if (!raw) {
    return { status: 'idle' };
  }

  try {
    return JSON.parse(raw);
  } catch {
    return { status: 'idle' };
  }
};

const AI_SUMMARY_TTL_SECONDS = 60 * 60;

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

// Get Lambda function details
router.get('/functions/:integrationId', authenticateToken, async (req, res) => {
  const integrationId = parseInt(req.params.integrationId);
  const integration = await getIntegrationForUser(integrationId, req.user);

  if (!integration) {
    return res.status(404).json({ error: 'Integração não encontrada' });
  }

  try {
    const lambdaClient = new LambdaClient({
      region: integration.region,
      credentials: {
        accessKeyId: decrypt(integration.access_key_encrypted),
        secretAccessKey: decrypt(integration.secret_key_encrypted)
      }
    });

    const command = new ListFunctionsCommand({});
    const response = await lambdaClient.send(command);

    await logAudit({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'lambda.list_functions',
      resourceType: 'integration',
      resourceId: String(integrationId),
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ functions: response.Functions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get logs for function
router.get('/logs/:integrationId', authenticateToken, async (req, res) => {
  const integrationId = parseInt(req.params.integrationId);
  const integration = await getIntegrationForUser(integrationId, req.user);

  if (!integration) {
    return res.status(404).json({ error: 'Integração não encontrada' });
  }

  try {
    await connectRedis();

    const simplifyFlag = ['1', 'true', 'yes'].includes((req.query.simplify || '').toString().toLowerCase());
    const summaryFlag = ['1', 'true', 'yes'].includes((req.query.summary || '').toString().toLowerCase());

    const cacheKey = `logs:${integrationId}:${req.query.type || 'relevant'}:${req.query.limit || 100}:${req.query.startTime || 'default'}:${req.query.endTime || 'now'}:${req.query.search || ''}:${simplifyFlag ? 'simple' : 'raw'}:${summaryFlag ? 'summary' : 'nosummary'}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const payload = await buildLogsPayload({
      integration,
      query: req.query,
      simplifyFlag,
      summaryFlag
    });

    await redisClient.set(cacheKey, JSON.stringify(payload), { EX: 60 });

    await logAudit({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'lambda.logs.fetch',
      resourceType: 'integration',
      resourceId: String(integrationId),
      metadata: { type: payload.filter, limit: payload.limit, startTime: payload.startTime, endTime: payload.endTime, search: payload.search },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/logs/:integrationId/ai-summary/start', authenticateToken, async (req, res) => {
  const integrationId = parseInt(req.params.integrationId);
  const integration = await getIntegrationForUser(integrationId, req.user);

  if (!integration) {
    return res.status(404).json({ error: 'Integração não encontrada' });
  }

  try {
    await connectRedis();

    const simplifyFlag = true;
    const model = process.env.GITHUB_MODEL || 'openai/gpt-4o-mini';
    const cacheKey = buildAiSummaryCacheKey({ integrationId, query: req.query, simplifyFlag, model });
    const cachedState = parseAiSummaryState(await redisClient.get(cacheKey));

    if (cachedState.status === 'running' || cachedState.status === 'complete') {
      return res.json(cachedState);
    }

    const runningState = {
      status: 'running',
      model,
      requestedAt: Date.now()
    };

    console.info('[copilot] resumo iniciado', {
      integrationId,
      type: req.query.type || 'relevant',
      limit: req.query.limit || 100,
      startTime: req.query.startTime || 'default',
      endTime: req.query.endTime || 'now',
      simplify: simplifyFlag,
      model
    });

    await redisClient.set(cacheKey, JSON.stringify(runningState), { EX: AI_SUMMARY_TTL_SECONDS });

    setImmediate(async () => {
      try {
        const payload = await buildLogsPayload({
          integration,
          query: req.query,
          simplifyFlag,
          summaryFlag: true
        });

        const result = await summarizeLogs({
          logs: payload.logs,
          summary: payload.summary,
          integration
        });

        const responsePayload = {
          status: 'complete',
          summary: result.summary,
          model,
          generatedAt: Date.now(),
          requestedAt: runningState.requestedAt,
          logCount: payload.logs.length
        };

        await redisClient.set(cacheKey, JSON.stringify(responsePayload), { EX: AI_SUMMARY_TTL_SECONDS });

        console.info('[copilot] resumo concluido', {
          integrationId,
          model,
          logCount: payload.logs.length
        });

        await logAudit({
          companyId: req.user.companyId,
          userId: req.user.id,
          action: 'lambda.logs.ai_summary',
          resourceType: 'integration',
          resourceId: String(integrationId),
          metadata: { type: payload.filter, limit: payload.limit, startTime: payload.startTime, endTime: payload.endTime, search: payload.search, model },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        });
      } catch (error) {
        const errorPayload = {
          status: 'error',
          model,
          requestedAt: runningState.requestedAt,
          error: error.message || 'Falha ao gerar resumo.'
        };
        await redisClient.set(cacheKey, JSON.stringify(errorPayload), { EX: AI_SUMMARY_TTL_SECONDS });

        console.error('[copilot] erro ao gerar resumo', {
          integrationId,
          model,
          message: error.message || 'Falha ao gerar resumo.'
        });
      }
    });

    res.json(runningState);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/logs/:integrationId/ai-summary/status', authenticateToken, async (req, res) => {
  const integrationId = parseInt(req.params.integrationId);
  const integration = await getIntegrationForUser(integrationId, req.user);

  if (!integration) {
    return res.status(404).json({ error: 'Integração não encontrada' });
  }

  try {
    await connectRedis();

    const simplifyFlag = true;
    const model = process.env.GITHUB_MODEL || 'openai/gpt-4o-mini';
    const cacheKey = buildAiSummaryCacheKey({ integrationId, query: req.query, simplifyFlag, model });
    const cachedState = parseAiSummaryState(await redisClient.get(cacheKey));

    return res.json(cachedState);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/logs/:integrationId/ai-summary', authenticateToken, async (req, res) => {
  const integrationId = parseInt(req.params.integrationId);
  const integration = await getIntegrationForUser(integrationId, req.user);

  if (!integration) {
    return res.status(404).json({ error: 'Integração não encontrada' });
  }

  try {
    await connectRedis();

    const simplifyFlag = true;
    const model = process.env.GITHUB_MODEL || 'openai/gpt-4o-mini';
    const cacheKey = buildAiSummaryCacheKey({ integrationId, query: req.query, simplifyFlag, model });

    await redisClient.del(cacheKey);

    console.info('[copilot] resumo limpo', {
      integrationId,
      type: req.query.type || 'relevant',
      limit: req.query.limit || 100,
      startTime: req.query.startTime || 'default',
      endTime: req.query.endTime || 'now',
      simplify: simplifyFlag,
      model
    });

    return res.json({ cleared: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get metrics for function
router.get('/metrics/:integrationId', authenticateToken, async (req, res) => {
  const integrationId = parseInt(req.params.integrationId);
  const integration = await getIntegrationForUser(integrationId, req.user);

  if (!integration) {
    return res.status(404).json({ error: 'Integração não encontrada' });
  }

  try {
    await connectRedis();

    const period = Number(req.query.period) || 3600;
    const days = Number(req.query.days) || 7;
    const cacheKey = `metrics:${integrationId}:${period}:${days}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const cloudwatchClient = new CloudWatchClient({
      region: integration.region,
      credentials: {
        accessKeyId: decrypt(integration.access_key_encrypted),
        secretAccessKey: decrypt(integration.secret_key_encrypted)
      }
    });

    // Get invocation count

    const invocationsCommand = new GetMetricDataCommand({
      MetricDataQueries: [
        {
          Id: 'invocations',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/Lambda',
              MetricName: 'Invocations',
              Dimensions: [
                {
                  Name: 'FunctionName',
                  Value: integration.function_name
                }
              ]
            },
            Period: period,
            Stat: 'Sum'
          }
        },
        {
          Id: 'errors',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/Lambda',
              MetricName: 'Errors',
              Dimensions: [
                {
                  Name: 'FunctionName',
                  Value: integration.function_name
                }
              ]
            },
            Period: period,
            Stat: 'Sum'
          }
        },
        {
          Id: 'duration',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/Lambda',
              MetricName: 'Duration',
              Dimensions: [
                {
                  Name: 'FunctionName',
                  Value: integration.function_name
                }
              ]
            },
            Period: period,
            Stat: 'Average'
          }
        }
      ],
      StartTime: new Date(Date.now() - (days * 24 * 60 * 60 * 1000)),
      EndTime: new Date()
    });

    const response = await cloudwatchClient.send(invocationsCommand);

    const payload = {
      metrics: response.MetricDataResults,
      functionName: integration.function_name
    };

    await redisClient.set(cacheKey, JSON.stringify(payload), { EX: 300 });

    await logAudit({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'lambda.metrics.fetch',
      resourceType: 'integration',
      resourceId: String(integrationId),
      metadata: { period, days },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;