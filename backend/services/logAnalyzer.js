const { CloudWatchLogsClient, FilterLogEventsCommand, StartQueryCommand, GetQueryResultsCommand } = require('@aws-sdk/client-cloudwatch-logs');
const { decrypt } = require('../security/crypto');

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

const ERROR_TERMS_REGEX = /\b(error|exception|fail(?:ed|ure)?|timeout)\b/i;

const hasErrorIndicator = (value) => {
  if (!value) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return false;
};

const detectStructuredError = (parsedJson) => {
  if (!parsedJson || typeof parsedJson !== 'object') return false;

  const levelCandidate = parsedJson.level || parsedJson.severity || parsedJson.data?.level || parsedJson.data?.severity;
  if (typeof levelCandidate === 'string') {
    const normalized = levelCandidate.toLowerCase();
    if (['error', 'fatal', 'critical'].includes(normalized)) return true;
  }

  const errorValue = parsedJson.error ?? parsedJson.err ?? parsedJson.data?.error ?? parsedJson.data?.err;
  if (hasErrorIndicator(errorValue)) return true;

  const statusCode = parsedJson.status ?? parsedJson.statusCode ?? parsedJson.data?.status ?? parsedJson.data?.statusCode;
  if (typeof statusCode === 'number' && statusCode >= 500) return true;

  const messageFields = [parsedJson.message, parsedJson.msg, parsedJson.data?.message, parsedJson.data?.msg];
  if (messageFields.some(val => typeof val === 'string' && ERROR_TERMS_REGEX.test(val))) return true;

  return false;
};

const isErrorEvent = ({ message, parsedReport, parsedJson, simplified }) => {
  if (simplified?.level === 'error') return true;
  if (parsedReport?.status === 'timeout') return true;
  if (detectStructuredError(parsedJson)) return true;
  if (!parsedJson) {
    return ERROR_TERMS_REGEX.test((message || '').toString());
  }
  return false;
};

const simplifyLogMessage = (message, parsedReport, parsedJsonOverride) => {
  const raw = (message || '').trim();
  const lower = raw.toLowerCase();
  const parsedJson = parsedJsonOverride ?? extractJsonPayload(raw);
  const structuredError = detectStructuredError(parsedJson);

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
    if (structuredError) {
      result.level = 'error';
      result.category = 'ERRO';
    }
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

    result.category = result.category || 'INFO';
    result.simplifiedMessage = messageKey;
    return result;
  }

  if (structuredError || lower.includes('error') || lower.includes('exception') || lower.includes('fail') || lower.includes('timeout')) {
    result.category = 'ERRO';
    result.level = 'error';
  }

  result.simplifiedMessage = raw.length > 200 ? `${raw.slice(0, 197)}...` : raw;
  result.category = result.category || 'INFO';

  return result;
};

const escapeRegex = (value) => {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\//g, '\\/');
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const runInsightsQuery = async ({ logsClient, logGroupName, startTime, endTime, queryString, maxWaitMs = 5000, pollIntervalMs = 250 }) => {
  const startResp = await logsClient.send(new StartQueryCommand({
    logGroupName,
    startTime: Math.floor(startTime / 1000),
    endTime: Math.floor(endTime / 1000),
    queryString
  }));

  if (!startResp.queryId) {
    throw new Error('Falha ao iniciar consulta de logs');
  }

  const startedAt = Date.now();
  while (true) {
    const resultResp = await logsClient.send(new GetQueryResultsCommand({ queryId: startResp.queryId }));
    const status = resultResp.status;

    if (status === 'Complete') {
      return resultResp.results || [];
    }

    if (['Failed', 'Cancelled', 'Timeout'].includes(status)) {
      throw new Error(`Consulta de logs falhou: ${status}`);
    }

    if (Date.now() - startedAt > maxWaitMs) {
      throw new Error('Tempo limite ao consultar logs');
    }

    await sleep(pollIntervalMs);
  }
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

  const limit = Math.min(Number(query.limit) || 20, 20);
  const startTime = Number(query.startTime) || Date.now() - (24 * 60 * 60 * 1000);
  const endTime = Number(query.endTime) || Date.now();
  const search = (query.search || '').toString().trim();
  const before = Number(query.before);
  const effectiveEndTime = Number.isFinite(before) && before > 0 ? Math.min(endTime, before - 1) : endTime;

  const summaryScope = (query.summaryScope || (summaryFlag ? 'full' : 'page')).toString().toLowerCase();
  const requestedType = (query.type || 'relevant').toString().toLowerCase();
  // Keep the endpoint forgiving for existing clients, but never let an unknown
  // value silently behave like the "relevant" filter. That previously made a
  // request for `errors` include REPORT events.
  const typeAliases = { errors: 'error', reports: 'report' };
  const type = typeAliases[requestedType] || requestedType;
  const validTypes = new Set(['all', 'relevant', 'error', 'report']);
  if (!validTypes.has(type)) {
    const error = new Error('Filtro de logs inválido. Use all, relevant, error ou report.');
    error.statusCode = 400;
    throw error;
  }

  // AWS CloudWatch FilterLogEvents returns events in chronological order (oldest first)
  // We sort locally to show newest first in the UI.
  const pageLimit = Math.min(Math.max(Number(limit) || 20, 1), 20);
  let eventsToProcess = [];
  let normalizedLogs = [];
  let relevantLogs = [];

  const buildNormalizedLogs = (events) => (events || []).map(event => {
    const parsedReport = parseReportLine(event.message);
    const parsedJson = extractJsonPayload(event.message);
    const simplified = simplifyFlag || summaryFlag ? simplifyLogMessage(event.message, parsedReport, parsedJson) : null;

    return {
      eventId: event.eventId || null,
      ingestionTime: event.ingestionTime || null,
      timestamp: event.timestamp,
      message: event.message,
      parsedReport,
      simplifiedMessage: simplified?.simplifiedMessage ?? null,
      category: simplified?.category ?? null,
      level: simplified?.level ?? null
    };
  });

  const filterRelevantLogs = (events) => (events || []).filter(event => {
    const message = event.message || '';
    const messageLower = message.toLowerCase();
    const isReportLine = /^report\b/i.test(message);
    const parsedJson = extractJsonPayload(message);

    if (type === 'error') {
      return isErrorEvent({
        message,
        parsedReport: event.parsedReport,
        parsedJson,
        simplified: { level: event.level }
      });
    }

    if (type === 'report') {
      return isReportLine || Boolean(event.parsedReport);
    }

    if (type === 'all') {
      return true;
    }

    return isErrorEvent({
      message,
      parsedReport: event.parsedReport,
      parsedJson,
      simplified: { level: event.level }
    }) ||
      messageLower.includes('duration') ||
      messageLower.includes('report') ||
      Boolean(event.parsedReport);
  });

  if (effectiveEndTime <= startTime) {
    return {
      logs: [],
      summary: {
        total: 0,
        reports: 0,
        errors: 0,
        avgDurationMs: null,
        timeouts: 0,
        startTime: null,
        endTime: null,
        filter: type,
        simplify: simplifyFlag
      },
      filter: type,
      limit,
      startTime,
      endTime: effectiveEndTime,
      search,
      nextBefore: null,
      nextToken: null
    };
  }

  // Semantic filters (especially `error`) can be sparse. Inspect a wider
  // CloudWatch window before declaring it empty; otherwise a busy function
  // could show no errors simply because its latest 100 events were informational.
  const insightsLimit = type === 'error'
    ? 1000
    : Math.min(Math.max(pageLimit * 5, pageLimit), 1000);
  const queryParts = ['fields @timestamp, @message, @ingestionTime, @logStream, @ptr'];
  if (search) {
    queryParts.push(`| filter @message like /${escapeRegex(search)}/`);
  }
  queryParts.push('| sort @timestamp desc');
  queryParts.push(`| limit ${insightsLimit}`);
  const queryString = queryParts.join('\n');

  const results = await runInsightsQuery({
    logsClient,
    logGroupName,
    startTime,
    endTime: effectiveEndTime,
    queryString
  });

  eventsToProcess = results.map(fields => {
    const map = new Map((fields || []).map(field => [field.field, field.value]));
    const timestampValue = map.get('@timestamp');
    const ingestionValue = map.get('@ingestionTime');

    return {
      eventId: map.get('@ptr') || map.get('@logStream') || null,
      ingestionTime: ingestionValue ? Date.parse(ingestionValue) : null,
      timestamp: timestampValue ? Date.parse(timestampValue) : null,
      message: map.get('@message') || ''
    };
  }).filter(event => Number.isFinite(event.timestamp));

  normalizedLogs = buildNormalizedLogs(eventsToProcess);
  relevantLogs = filterRelevantLogs(normalizedLogs);

  const sortedLogs = relevantLogs.sort((a, b) => {
    const timeDiff = (b.timestamp || 0) - (a.timestamp || 0);
    if (timeDiff !== 0) return timeDiff;
    const ingestDiff = (b.ingestionTime || 0) - (a.ingestionTime || 0);
    if (ingestDiff !== 0) return ingestDiff;
    return String(b.eventId || '').localeCompare(String(a.eventId || ''));
  });

  const pagedLogs = sortedLogs.slice(0, pageLimit);

  const reportEvents = pagedLogs.filter(log => log.parsedReport);
  const durationSamples = reportEvents
    .map(log => log.parsedReport.durationMs)
    .filter(value => typeof value === 'number');

  const timeRange = pagedLogs.length
    ? {
      startTime: pagedLogs[pagedLogs.length - 1].timestamp,
      endTime: pagedLogs[0].timestamp
    }
    : { startTime: null, endTime: null };

  const timeoutCount = reportEvents.filter(log => log.parsedReport?.status === 'timeout').length;

  // Compute summary values. By default we compute summary for the current page.
  // If summaryFlag is true, aggregate across all pages in the requested interval
  // to provide an accurate total and top messages.
  let totalCount = pagedLogs.length;
  let reportCount = reportEvents.length;
  let errorsCount = pagedLogs.filter(log => isErrorEvent({
    message: log.message,
    parsedReport: log.parsedReport,
    parsedJson: extractJsonPayload(log.message),
    simplified: { level: log.level }
  })).length;
  let avgDurationMs = durationSamples.length
    ? durationSamples.reduce((sum, value) => sum + value, 0) / durationSamples.length
    : null;
  let timeouts = timeoutCount;
  let summaryTopMessages;

  if (summaryFlag && summaryScope !== 'full') {
    const topMap = new Map();
    for (const log of pagedLogs) {
      const baseMessage = (log.simplifiedMessage ?? log.message ?? '').trim();
      const trimmed = baseMessage.length > 120 ? `${baseMessage.slice(0, 117)}...` : baseMessage;
      if (trimmed) topMap.set(trimmed, (topMap.get(trimmed) || 0) + 1);
    }
    summaryTopMessages = Array.from(topMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([message, count]) => ({ message, count }));
  }

  if (summaryFlag && summaryScope === 'full') {
    // Paginate through all matching events to compute totals and top messages.
    const aggPageLimit = 1000;
    let aggNextToken;
    const topMap = new Map();
    let aggTotal = 0;
    let aggReports = 0;
    let aggErrors = 0;
    let aggTimeouts = 0;
    const aggDurations = [];
    const maxAggregate = 100000; // safety cap

    try {
      do {
        const aggCmd = new FilterLogEventsCommand({
          logGroupName,
          limit: aggPageLimit,
          startTime,
          endTime, // aggregate across the full requested interval, not the page-bound 'before'
          filterPattern: search ? `?"${search}"` : undefined,
          nextToken: aggNextToken
        });

        const aggResp = await logsClient.send(aggCmd);
        const aggEvents = aggResp.events || [];

        for (const event of aggEvents) {
          const pr = parseReportLine(event.message);
          const parsedJson = extractJsonPayload(event.message);
          const simplified = simplifyFlag || summaryFlag ? simplifyLogMessage(event.message, pr, parsedJson) : null;

          const messageLower = (event.message || '').toLowerCase();
          const isReportLine = /^report\b/i.test(event.message || '');

          // Determine relevant per type
          let isRelevant = false;
          if (type === 'error') {
            isRelevant = isErrorEvent({
              message: event.message,
              parsedReport: pr,
              parsedJson,
              simplified
            });
          } else if (type === 'report') {
            isRelevant = isReportLine;
          } else if (type === 'all') {
            isRelevant = true;
          } else {
            isRelevant = isErrorEvent({
              message: event.message,
              parsedReport: pr,
              parsedJson,
              simplified
            }) || messageLower.includes('duration') || messageLower.includes('report') || Boolean(pr);
          }

          if (!isRelevant) continue;

          aggTotal += 1;

          if (pr) {
            aggReports += 1;
            if (typeof pr.durationMs === 'number') aggDurations.push(pr.durationMs);
            if (pr.status === 'timeout') aggTimeouts += 1;
          }

          if (isErrorEvent({ message: event.message, parsedReport: pr, parsedJson, simplified })) {
            aggErrors += 1;
          }

          const baseMessage = (simplified?.simplifiedMessage ?? event.message ?? '').trim();
          const trimmed = baseMessage.length > 120 ? `${baseMessage.slice(0, 117)}...` : baseMessage;
          if (trimmed) topMap.set(trimmed, (topMap.get(trimmed) || 0) + 1);

          if (aggTotal >= maxAggregate) break;
        }

        aggNextToken = aggResp.nextToken;
        if (aggTotal >= maxAggregate) break;
      } while (aggNextToken);
    } catch (err) {
      console.error('Failed to aggregate full summary for logs:', err && err.message ? err.message : err);
    }

    totalCount = aggTotal;
    reportCount = aggReports;
    errorsCount = aggErrors;
    timeouts = aggTimeouts;
    avgDurationMs = aggDurations.length ? aggDurations.reduce((s, v) => s + v, 0) / aggDurations.length : null;
    summaryTopMessages = Array.from(topMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([message, count]) => ({ message, count }));
  }

  const hasMore = relevantLogs.length > pageLimit || eventsToProcess.length >= insightsLimit;
  const oldestScannedTimestamp = eventsToProcess[eventsToProcess.length - 1]?.timestamp;
  // Keep pagination available even when this batch contains no matching
  // semantic events. The next batch may still contain the requested errors.
  const nextBefore = hasMore
    ? Math.max(((pagedLogs[pagedLogs.length - 1]?.timestamp || oldestScannedTimestamp || effectiveEndTime) - 1), startTime)
    : null;

  return {
    logs: pagedLogs,
    summary: {
      total: totalCount,
      reports: reportCount,
      errors: errorsCount,
      avgDurationMs,
      timeouts,
      startTime: timeRange.startTime ?? startTime,
      endTime: timeRange.endTime ?? endTime,
      topMessages: summaryTopMessages || undefined,
      filter: type,
      simplify: simplifyFlag
    },
    filter: type,
    limit,
    startTime,
    endTime: effectiveEndTime,
    search,
    nextBefore,
    nextToken: null
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

module.exports = {
  parseReportLine,
  extractJsonPayload,
  isErrorEvent,
  simplifyLogMessage,
  escapeRegex,
  buildLogsPayload,
  buildAiSummaryCacheKey,
  parseAiSummaryState,
  AI_SUMMARY_TTL_SECONDS
};
