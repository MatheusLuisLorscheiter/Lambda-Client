const { CloudWatchClient, GetMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { decrypt } = require('../security/crypto');
const { buildLogsPayload } = require('./logAnalyzer');

function credentialsFor(integration) {
  return {
    accessKeyId: decrypt(integration.access_key_encrypted),
    secretAccessKey: decrypt(integration.secret_key_encrypted),
  };
}

function metricQuery(id, metricName, stat, period, functionName) {
  return {
    Id: id,
    MetricStat: {
      Metric: {
        Namespace: 'AWS/Lambda',
        MetricName: metricName,
        Dimensions: [{ Name: 'FunctionName', Value: functionName }],
      },
      Period: period,
      Stat: stat,
    },
    ReturnData: true,
  };
}

function total(metric) {
  return (metric?.Values || []).reduce((sum, value) => sum + Number(value || 0), 0);
}

function maximum(metric) {
  const values = metric?.Values || [];
  return values.length ? Math.max(...values.map(Number)) : 0;
}

function series(metric) {
  const timestamps = metric?.Timestamps || [];
  const values = metric?.Values || [];
  return timestamps.map((timestamp, index) => ({
    timestamp: timestamp instanceof Date ? timestamp.toISOString() : new Date(timestamp).toISOString(),
    value: Number(values[index] || 0),
  })).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

async function getMetricsSnapshot({ integration, hours = 24 }) {
  const safeHours = Math.min(Math.max(Number(hours) || 24, 1), 168);
  const period = safeHours <= 24 ? 300 : safeHours <= 72 ? 900 : 3600;
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - safeHours * 60 * 60 * 1000);
  const client = new CloudWatchClient({ region: integration.region, credentials: credentialsFor(integration) });
  const response = await client.send(new GetMetricDataCommand({
    MetricDataQueries: [
      metricQuery('invocations', 'Invocations', 'Sum', period, integration.function_name),
      metricQuery('errors', 'Errors', 'Sum', period, integration.function_name),
      metricQuery('throttles', 'Throttles', 'Sum', period, integration.function_name),
      metricQuery('durationSum', 'Duration', 'Sum', period, integration.function_name),
      metricQuery('durationSamples', 'Duration', 'SampleCount', period, integration.function_name),
      metricQuery('concurrency', 'ConcurrentExecutions', 'Maximum', period, integration.function_name),
    ],
    StartTime: startTime,
    EndTime: endTime,
    ScanBy: 'TimestampAscending',
  }));
  const byId = new Map((response.MetricDataResults || []).map(item => [item.Id, item]));
  const invocations = total(byId.get('invocations'));
  const errors = total(byId.get('errors'));
  const durationSum = total(byId.get('durationSum'));
  const durationSamples = total(byId.get('durationSamples'));
  return {
    window: { hours: safeHours, startTime: startTime.toISOString(), endTime: endTime.toISOString(), periodSeconds: period },
    summary: {
      invocations,
      errors,
      errorRate: invocations > 0 ? errors / invocations : 0,
      throttles: total(byId.get('throttles')),
      averageDurationMs: durationSamples > 0 ? durationSum / durationSamples : 0,
      maximumConcurrentExecutions: maximum(byId.get('concurrency')),
    },
    timeSeries: {
      invocations: series(byId.get('invocations')),
      errors: series(byId.get('errors')),
      throttles: series(byId.get('throttles')),
      concurrency: series(byId.get('concurrency')),
    },
  };
}

async function getLogsSnapshot({ integration, hours = 24, limit = 20, type = 'relevant', search = '', includeRaw = false }) {
  const safeHours = Math.min(Math.max(Number(hours) || 24, 1), 168);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 20);
  const endTime = Date.now();
  const startTime = endTime - safeHours * 60 * 60 * 1000;
  const payload = await buildLogsPayload({
    integration,
    query: { startTime, endTime, limit: safeLimit, type, search },
    simplifyFlag: true,
    summaryFlag: false,
  });
  return {
    window: { hours: safeHours, startTime: new Date(startTime).toISOString(), endTime: new Date(endTime).toISOString() },
    filter: payload.filter,
    summary: payload.summary,
    logs: payload.logs.map(item => ({
      eventId: item.eventId,
      timestamp: item.timestamp ? new Date(item.timestamp).toISOString() : null,
      ingestionTime: item.ingestionTime ? new Date(item.ingestionTime).toISOString() : null,
      level: item.level,
      category: item.category,
      message: item.simplifiedMessage || String(item.message || '').slice(0, 500),
      ...(includeRaw ? { rawMessage: String(item.message || '').slice(0, 4000) } : {}),
      report: item.parsedReport,
    })),
    nextBefore: payload.nextBefore || null,
  };
}

module.exports = { getMetricsSnapshot, getLogsSnapshot };
