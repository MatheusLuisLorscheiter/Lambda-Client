const express = require('express');
const { authenticateToken } = require('./auth');
const { client: redisClient, connectRedis } = require('../cache/redis');
const { logAudit } = require('../audit/logger');
const { summarizeLogs } = require('../copilot/summarizeLogs');
const { getIntegrationForUser } = require('../services/integrations');
const { buildLogsPayload, buildAiSummaryCacheKey, parseAiSummaryState, AI_SUMMARY_TTL_SECONDS } = require('../services/logAnalyzer');

const router = express.Router();

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

    const payload = await buildLogsPayload({
      integration,
      query: req.query,
      simplifyFlag,
      summaryFlag
    });

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
    res.status(error.statusCode || 500).json({ error: error.message });
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
    const model = process.env.GITHUB_MODEL || 'openai/gpt-4o';
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
    const model = process.env.GITHUB_MODEL || 'openai/gpt-4o';
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
    const model = process.env.GITHUB_MODEL || 'openai/gpt-4o';
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

module.exports = router;
