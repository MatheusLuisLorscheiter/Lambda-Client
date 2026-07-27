const express = require('express');
const { LambdaClient, ListFunctionsCommand, InvokeCommand } = require('@aws-sdk/client-lambda');
const { CloudWatchClient, GetMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { authenticateToken } = require('./auth');
const { decrypt } = require('../security/crypto');
const { client: redisClient, connectRedis } = require('../cache/redis');
const { logAudit } = require('../audit/logger');
const { getIntegrationForUser } = require('../services/integrations');
const { calculateCostEstimate } = require('../services/pricing');

const router = express.Router();

const buildAwsClientCredentials = (integration) => ({
  accessKeyId: decrypt(integration.access_key_encrypted),
  secretAccessKey: decrypt(integration.secret_key_encrypted)
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
      credentials: buildAwsClientCredentials(integration)
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

// Get metrics for function
router.get('/metrics/:integrationId', authenticateToken, async (req, res) => {
  const integrationId = parseInt(req.params.integrationId);
  const integration = await getIntegrationForUser(integrationId, req.user);

  if (!integration) {
    return res.status(404).json({ error: 'Integração não encontrada' });
  }

  try {
    await connectRedis();

    const requestedPeriod = Number(req.query.period);
    const requestedDays = Number(req.query.days);
    const days = [1, 7, 14, 30].includes(requestedDays) ? requestedDays : 7;
    // Lambda publishes standard metrics in one-minute intervals. The allowed
    // periods preserve that granularity for short windows and prevent needless
    // CloudWatch datapoints for longer periods.
    const period = [60, 300, 900, 3600, 21600].includes(requestedPeriod)
      ? requestedPeriod
      : (days === 1 ? 300 : 3600);
    const cacheKey = `metrics:${integrationId}:${period}:${days}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const cloudwatchClient = new CloudWatchClient({
      region: integration.region,
      credentials: buildAwsClientCredentials(integration)
    });

    const invocationsCommand = new GetMetricDataCommand({
      MetricDataQueries: [
        {
          Id: 'invocations',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/Lambda',
              MetricName: 'Invocations',
              Dimensions: [{ Name: 'FunctionName', Value: integration.function_name }]
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
              Dimensions: [{ Name: 'FunctionName', Value: integration.function_name }]
            },
            Period: period,
            Stat: 'Sum'
          }
        },
        {
          Id: 'durationSum',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/Lambda',
              MetricName: 'Duration',
              Dimensions: [{ Name: 'FunctionName', Value: integration.function_name }]
            },
            Period: period,
            Stat: 'Sum'
          }
        },
        {
          Id: 'durationSampleCount',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/Lambda',
              MetricName: 'Duration',
              Dimensions: [{ Name: 'FunctionName', Value: integration.function_name }]
            },
            Period: period,
            Stat: 'SampleCount'
          }
        },
        {
          Id: 'throttles',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/Lambda',
              MetricName: 'Throttles',
              Dimensions: [{ Name: 'FunctionName', Value: integration.function_name }]
            },
            Period: period,
            Stat: 'Sum'
          }
        },
        {
          Id: 'concurrentExecutions',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/Lambda',
              MetricName: 'ConcurrentExecutions',
              Dimensions: [{ Name: 'FunctionName', Value: integration.function_name }]
            },
            Period: period,
            Stat: 'Maximum'
          }
        }
      ],
      StartTime: new Date(Date.now() - (days * 24 * 60 * 60 * 1000)),
      EndTime: new Date(),
      ScanBy: 'TimestampAscending'
    });

    const response = await cloudwatchClient.send(invocationsCommand);
    const metricResults = response.MetricDataResults || [];

    const invocationsMetric = metricResults.find(m => m.Id === 'invocations');
    const durationSumMetric = metricResults.find(m => m.Id === 'durationSum');
    const durationSampleCountMetric = metricResults.find(m => m.Id === 'durationSampleCount');

    const totalInvocations = (invocationsMetric?.Values || []).reduce((sum, value) => sum + value, 0);
    const totalDuration = (durationSumMetric?.Values || []).reduce((sum, value) => sum + value, 0);
    const durationSamples = (durationSampleCountMetric?.Values || []).reduce((sum, value) => sum + value, 0);
    const avgDuration = durationSamples > 0 ? totalDuration / durationSamples : 0;

    const costEstimate = integration.show_cost_estimate
      ? calculateCostEstimate({
        invocations: totalInvocations,
        avgDurationMs: avgDuration,
        memoryMb: integration.memory_mb,
        region: integration.region,
        periodLabel: `Últimos ${days} dias`
      })
      : null;

    const payload = {
      metrics: metricResults,
      functionName: integration.function_name,
      costEstimate
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

// Manually invoke the Lambda function with a test payload (admin only: this can trigger real
// production side effects, so it is intentionally restricted).
router.post('/invoke/:integrationId', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso de administrador obrigatório' });
  }

  const integrationId = parseInt(req.params.integrationId);
  const integration = await getIntegrationForUser(integrationId, req.user);

  if (!integration) {
    return res.status(404).json({ error: 'Integração não encontrada' });
  }

  const { payload } = req.body;
  let payloadString = '{}';
  if (payload !== undefined && payload !== null) {
    try {
      payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
      JSON.parse(payloadString);
    } catch {
      return res.status(400).json({ error: 'Payload precisa ser um JSON válido' });
    }
  }

  if (payloadString.length > 200_000) {
    return res.status(400).json({ error: 'Payload excede o tamanho máximo permitido (200KB)' });
  }

  try {
    const lambdaClient = new LambdaClient({
      region: integration.region,
      credentials: buildAwsClientCredentials(integration)
    });

    const command = new InvokeCommand({
      FunctionName: integration.function_name,
      InvocationType: 'RequestResponse',
      LogType: 'Tail',
      Payload: Buffer.from(payloadString, 'utf8')
    });

    const response = await lambdaClient.send(command);

    const responsePayload = response.Payload ? Buffer.from(response.Payload).toString('utf8') : null;
    const logTail = response.LogResult ? Buffer.from(response.LogResult, 'base64').toString('utf8') : null;

    await logAudit({
      companyId: req.user.companyId,
      userId: req.user.id,
      action: 'lambda.invoke.test',
      resourceType: 'integration',
      resourceId: String(integrationId),
      metadata: { statusCode: response.StatusCode, functionError: response.FunctionError || null },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      statusCode: response.StatusCode,
      functionError: response.FunctionError || null,
      payload: responsePayload,
      logTail
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
