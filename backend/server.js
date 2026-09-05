const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const crypto = require('crypto');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// A API publica passa por um unico proxy reverso da EasyPanel/Traefik. Limitar
// a confianca a exatamente um salto permite que Express e express-rate-limit
// usem o IP real sem aceitar uma cadeia X-Forwarded-For arbitraria do cliente.
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 1);
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 1) {
  throw new Error('TRUST_PROXY_HOPS must be a positive integer');
}
app.set('trust proxy', trustProxyHops);

const frontendBaseUrl = process.env.FRONTEND_BASE_URL || 'http://localhost:5173';
const allowedOrigins = frontendBaseUrl.split(',').map(origin => origin.trim()).filter(Boolean);

// Middleware
app.use(helmet());
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use((req, res, next) => {
  const requestId = req.get('x-request-id') || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
});
// MCP aceita apenas JSON pequeno; anexos base64 das demais rotas continuam com
// o limite maior e com a validação específica do módulo de mapeamentos.
const mcpJsonParser = express.json({ limit: '1mb' });
const applicationJsonParser = express.json({ limit: '15mb' });
app.use((req, res, next) => {
  const parser = req.path === '/mcp' || req.path.startsWith('/mcp/')
    ? mcpJsonParser
    : applicationJsonParser;
  return parser(req, res, next);
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' }
});

const invitationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas com este convite. Aguarde alguns minutos.' }
});

const invitationDeliveryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite temporário de convites atingido. Tente novamente mais tarde.' }
});

// Routes
const { router: authRouter } = require('./routes/auth');
const lambdaRouter = require('./routes/lambda');
const auditRouter = require('./routes/audit');
const processesRouter = require('./routes/processes');
const processEffortRouter = require('./routes/process-effort.routes');
const adminMcpRouter = require('./routes/admin-mcp.routes');
const mcpRouter = require('./routes/mcp.routes');
const webhookEndpointsRouter = require('./routes/webhook-endpoints.routes');
const { dispatchPendingWebhookEvents } = require('./services/genericWebhookPublisher');

app.use('/auth/login', authLimiter);
app.use('/auth/admin/login', authLimiter);
app.use('/auth/password/forgot', authLimiter);
app.use('/auth/password/reset', authLimiter);
app.use('/auth/companies/by-email', authLimiter);
app.use('/auth/invitations', invitationLimiter);
app.post('/auth/clients', invitationDeliveryLimiter);
app.post('/auth/clients/:clientId/invite', invitationDeliveryLimiter);

app.use('/auth/admin/mcp', adminMcpRouter);
app.use('/auth/admin/webhook-endpoints', webhookEndpointsRouter);
app.use('/mcp', mcpRouter);
app.use('/auth', authRouter);
app.use('/lambda', lambdaRouter);
app.use('/audit', auditRouter);
app.use('/processes', processEffortRouter);
app.use('/processes', processesRouter);

// Basic route

app.get('/', (req, res) => {
  res.json({ message: 'API Lambda Pulse' });
});

app.get('/health/live', (_req, res) => {
  res.json({ status: 'ok', service: 'lambda-pulse-api', timestamp: new Date().toISOString() });
});

app.get('/health/ready', async (_req, res) => {
  const { query } = require('./db');
  const { client: redisClient, connectRedis } = require('./cache/redis');
  const checks = { postgres: 'unavailable', redis: 'unavailable' };
  try {
    await query('SELECT 1');
    checks.postgres = 'ok';
  } catch {
    checks.postgres = 'unavailable';
  }
  try {
    await connectRedis();
    await redisClient.ping();
    checks.redis = 'ok';
  } catch {
    checks.redis = 'unavailable';
  }
  const ready = Object.values(checks).every(status => status === 'ok');
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    checks,
    timestamp: new Date().toISOString()
  });
});

// 404 handler (JSON)
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Global JSON error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return;
  }
  const malformedJson = err instanceof SyntaxError && err.type === 'entity.parse.failed';
  const candidateStatus = Number(err.status || err.statusCode);
  const status = malformedJson ? 400 : Number.isInteger(candidateStatus) && candidateStatus >= 400 && candidateStatus <= 599
    ? candidateStatus
    : 500;
  if (status >= 500) {
    console.error('[unhandled error]', { requestId: req.requestId, message: err.message, stack: err.stack });
  }
  const error = malformedJson
    ? 'JSON inválido'
    : status < 500 && err.message
    ? err.message
    : 'Erro interno do servidor';
  res.status(status).json({ error, requestId: req.requestId });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const webhookDispatcher = setInterval(() => {
  dispatchPendingWebhookEvents().catch(error => console.error('[Generic webhook dispatcher]', error.message));
}, 10_000);
webhookDispatcher.unref();

module.exports = app;
