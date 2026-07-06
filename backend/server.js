const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');

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
app.use(express.json({ limit: '1mb' }));

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

app.use('/auth/login', authLimiter);
app.use('/auth/admin/login', authLimiter);
app.use('/auth/password/forgot', authLimiter);
app.use('/auth/password/reset', authLimiter);

app.use('/auth', authRouter);
app.use('/lambda', lambdaRouter);
app.use('/audit', auditRouter);

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'API Lambda Pulse' });
});

// 404 handler (JSON)
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Global JSON error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[unhandled error]', err);
  if (res.headersSent) {
    return;
  }
  res.status(err.status || 500).json({ error: err.message || 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;