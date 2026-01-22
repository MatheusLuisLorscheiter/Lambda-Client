const express = require('express');
const { LambdaClient, ListFunctionsCommand } = require('@aws-sdk/client-lambda');
const { CloudWatchLogsClient, FilterLogEventsCommand } = require('@aws-sdk/client-cloudwatch-logs');
const { CloudWatchClient, GetMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { authenticateToken } = require('./auth');
const { query } = require('../db');
const { encrypt, decrypt } = require('../security/crypto');
const { client: redisClient, connectRedis } = require('../cache/redis');
const { logAudit } = require('../audit/logger');

const router = express.Router();

const getIntegrationForUser = async (integrationId, user) => {
  const result = await query(
    'SELECT id, name, function_name, region, memory_mb, access_key_encrypted, secret_key_encrypted, owner_user_id, client_user_id, company_id FROM integrations WHERE id = $1',
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

  if (!durationMatch && !billedMatch && !memorySizeMatch && !maxMemoryMatch && !initDurationMatch) {
    return null;
  }

  return {
    durationMs: durationMatch ? Number(durationMatch[1]) : null,
    billedDurationMs: billedMatch ? Number(billedMatch[1]) : null,
    memorySizeMb: memorySizeMatch ? Number(memorySizeMatch[1]) : null,
    maxMemoryUsedMb: maxMemoryMatch ? Number(maxMemoryMatch[1]) : null,
    initDurationMs: initDurationMatch ? Number(initDurationMatch[1]) : null
  };
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

  const { name, functionName, region, accessKeyId, secretAccessKey, memoryMb, companyId } = req.body;

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

  const resolvedClientId = null;

  let resolvedCompanyId = req.user.companyId;
  if (companyId) {
    const companyResult = await query('SELECT id FROM companies WHERE id = $1', [Number(companyId)]);
    if (companyResult.rowCount === 0) {
      return res.status(400).json({ error: 'Empresa não encontrada' });
    }
    resolvedCompanyId = Number(companyId);
  }

  const encryptedAccessKey = encrypt(accessKeyId);
  const encryptedSecretKey = encrypt(secretAccessKey);

  const result = await query(
    `INSERT INTO integrations
      (company_id, name, function_name, region, memory_mb, access_key_encrypted, secret_key_encrypted, owner_user_id, client_user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, name, function_name AS "functionName", region, memory_mb AS "memoryMb", company_id AS "companyId", owner_user_id AS "userId", client_user_id AS "clientId"`,
    [resolvedCompanyId, name, functionName, region, resolvedMemoryMb, encryptedAccessKey, encryptedSecretKey, req.user.id, resolvedClientId]
  );

  const companyNameResult = await query('SELECT name FROM companies WHERE id = $1', [resolvedCompanyId]);
  const companyName = companyNameResult.rows[0]?.name || null;

  await logAudit({
    companyId: req.user.companyId,
    userId: req.user.id,
    action: 'integration.create',
    resourceType: 'integration',
    resourceId: String(result.rows[0].id),
    metadata: { name, functionName, region, memoryMb: resolvedMemoryMb, companyId: resolvedCompanyId },
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

  await query('DELETE FROM integrations WHERE id = $1 AND company_id = $2', [integrationId, req.user.companyId]);

  await logAudit({
    companyId: req.user.companyId,
    userId: req.user.id,
    action: 'integration.delete',
    resourceType: 'integration',
    resourceId: String(integrationId),
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
  res.json({ success: true });
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

    const cacheKey = `logs:${integrationId}:${req.query.type || 'relevant'}:${req.query.limit || 100}:${req.query.startTime || 'default'}:${req.query.endTime || 'now'}:${req.query.search || ''}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const logsClient = new CloudWatchLogsClient({
      region: integration.region,
      credentials: {
        accessKeyId: decrypt(integration.access_key_encrypted),
        secretAccessKey: decrypt(integration.secret_key_encrypted)
      }
    });

    // Get log group for the function
    const logGroupName = `/aws/lambda/${integration.function_name}`;

    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const startTime = Number(req.query.startTime) || Date.now() - (24 * 60 * 60 * 1000);
    const endTime = Number(req.query.endTime) || Date.now();
    const search = (req.query.search || '').toString().trim();

    const filterCommand = new FilterLogEventsCommand({
      logGroupName,
      limit,
      startTime,
      endTime,
      filterPattern: search ? `?"${search}"` : undefined
    });

    const response = await logsClient.send(filterCommand);

    const type = (req.query.type || 'relevant').toString().toLowerCase();

    const normalizedLogs = (response.events || []).map(event => {
      const parsedReport = parseReportLine(event.message);
      return {
        timestamp: event.timestamp,
        message: event.message,
        parsedReport
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

    const payload = {
      logs: sortedLogs,
      summary: {
        total: sortedLogs.length,
        reports: reportEvents.length,
        errors: sortedLogs.filter(log => (log.message || '').toLowerCase().includes('error')).length,
        avgDurationMs: durationSamples.length
          ? durationSamples.reduce((sum, value) => sum + value, 0) / durationSamples.length
          : null
      }
    };

    await redisClient.set(cacheKey, JSON.stringify(payload), { EX: 60 });

    await logAudit({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'lambda.logs.fetch',
      resourceType: 'integration',
      resourceId: String(integrationId),
      metadata: { type, limit, startTime, endTime, search },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    res.json(payload);
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