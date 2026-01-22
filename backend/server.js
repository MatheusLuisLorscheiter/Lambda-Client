const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const { router: authRouter } = require('./routes/auth');
const lambdaRouter = require('./routes/lambda');
const auditRouter = require('./routes/audit');

app.use('/auth', authRouter);
app.use('/lambda', lambdaRouter);
app.use('/audit', auditRouter);

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'API Lambda Pulse' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;