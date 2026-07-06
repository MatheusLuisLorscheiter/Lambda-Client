const express = require('express');
const integrationsRoutes = require('./integrations.routes');
const logsRoutes = require('./logs.routes');
const metricsRoutes = require('./metrics.routes');

// This router only aggregates the feature-specific routers below. Route
// implementations live in integrations.routes.js, logs.routes.js and
// metrics.routes.js, backed by shared logic in services/integrations.js,
// services/logAnalyzer.js and services/pricing.js.
const router = express.Router();

router.use(integrationsRoutes);
router.use(logsRoutes);
router.use(metricsRoutes);

module.exports = router;
