const express = require('express');
const { authenticateToken } = require('./auth');
const { query } = require('../db');

const router = express.Router();

router.get('/logs', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const action = req.query.action || null;
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const startTime = req.query.startTime ? new Date(Number(req.query.startTime)) : null;
    const endTime = req.query.endTime ? new Date(Number(req.query.endTime)) : null;

    const conditions = ['company_id = $1'];
    const values = [req.user.companyId];
    let idx = 2;

    if (action) {
        conditions.push(`action = $${idx++}`);
        values.push(action);
    }

    if (userId) {
        conditions.push(`user_id = $${idx++}`);
        values.push(userId);
    }

    if (startTime) {
        conditions.push(`created_at >= $${idx++}`);
        values.push(startTime);
    }

    if (endTime) {
        conditions.push(`created_at <= $${idx++}`);
        values.push(endTime);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
        `SELECT id, user_id AS "userId", action, resource_type AS "resourceType", resource_id AS "resourceId", metadata, ip_address AS "ipAddress", user_agent AS "userAgent", created_at AS "createdAt"
     FROM audit_logs
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT ${limit}`,
        values
    );

    res.json({ logs: result.rows });
});

module.exports = router;
