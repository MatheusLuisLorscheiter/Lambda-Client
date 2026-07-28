const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const crypto = require('crypto');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const frontendBaseUrl = process.env.FRONTEND_BASE_URL || 'http://localhost:5173';
const allowedOrigins = frontendBaseUrl.split(',').map(origin => origin.trim()).filter(Boolean);

// Middleware
app.use(helmet());
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
// Mapping documents may include a base64 attachment. The mapping route applies
// its own stricter 10 MB decoded-file limit.
app.use(express.json({ limit: '15mb' }));
app.use((req, res, next) => {
  const requestId = req.get('x-request-id') || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' }
});

// Routes
const { router: authRouter } = require('./routes/auth');
const lambdaRouter = require('./routes/lambda');
const auditRouter = require('./routes/audit');
const processesRouter = require('./routes/processes');

app.use('/auth/login', authLimiter);
app.use('/auth/admin/login', authLimiter);
app.use('/auth/password/forgot', authLimiter);
app.use('/auth/password/reset', authLimiter);

app.use('/auth', authRouter);
app.use('/lambda', lambdaRouter);
app.use('/audit', auditRouter);
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
  console.error('[unhandled error]', { requestId: req.requestId, message: err.message, stack: err.stack });
  if (res.headersSent) {
    return;
  }
  res.status(err.status || 500).json({ error: err.message || 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
