const express = require('express');
const { authenticateToken } = require('./auth');
const { query } = require('../db');

const router = express.Router();

router.get('/logs', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Acesso de administrador obrigatório' });
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const action = req.query.action || null;
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const companyId = req.query.companyId ? Number(req.query.companyId) : null;
    const search = String(req.query.search || '').trim();
    const startTime = req.query.startTime ? new Date(Number(req.query.startTime)) : null;
    const endTime = req.query.endTime ? new Date(Number(req.query.endTime)) : null;

    const conditions = [];
    const values = [];
    let idx = 1;

    if (companyId) {
        conditions.push(`audit_logs.company_id = $${idx++}`);
        values.push(companyId);
    }

    if (action) {
        conditions.push(`audit_logs.action = $${idx++}`);
        values.push(action);
    }

    if (userId) {
        conditions.push(`audit_logs.user_id = $${idx++}`);
        values.push(userId);
    }

    if (startTime) {
        conditions.push(`audit_logs.created_at >= $${idx++}`);
        values.push(startTime);
    }

    if (endTime) {
        conditions.push(`audit_logs.created_at <= $${idx++}`);
        values.push(endTime);
    }

    if (search) {
        conditions.push(`(
          audit_logs.action ILIKE $${idx}
          OR COALESCE(audit_logs.resource_type, '') ILIKE $${idx}
          OR COALESCE(audit_logs.resource_id, '') ILIKE $${idx}
          OR COALESCE(users.email, '') ILIKE $${idx}
          OR companies.name ILIKE $${idx}
        )`);
        values.push(`%${search.slice(0, 120)}%`);
        idx += 1;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
        `SELECT audit_logs.id, audit_logs.company_id AS "companyId",
                companies.name AS "companyName",
                audit_logs.user_id AS "userId", users.email AS "userEmail",
                audit_logs.action, audit_logs.resource_type AS "resourceType",
                audit_logs.resource_id AS "resourceId", audit_logs.metadata,
                audit_logs.ip_address AS "ipAddress", audit_logs.user_agent AS "userAgent",
                audit_logs.created_at AS "createdAt"
     FROM audit_logs
     JOIN companies ON companies.id = audit_logs.company_id
     LEFT JOIN users ON users.id = audit_logs.user_id
     ${whereClause}
     ORDER BY audit_logs.created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
        values
    );

    res.json({
        logs: result.rows,
        pagination: { limit, offset, returned: result.rows.length, hasMore: result.rows.length === limit }
    });
});

module.exports = router;
