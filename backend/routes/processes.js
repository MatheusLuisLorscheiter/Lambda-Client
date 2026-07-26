const express = require('express');
const { authenticateToken } = require('./auth');
const { query } = require('../db');
const { logAudit } = require('../audit/logger');

const router = express.Router();

const validCategories = new Set(['automation', 'integration', 'maintenance', 'improvement', 'support']);
const validStatuses = new Set(['requested', 'analysis', 'queued', 'in_progress', 'validation', 'delivered', 'paused', 'cancelled']);
const validPriorities = new Set(['low', 'normal', 'high', 'urgent']);
const validComplexities = new Set(['simple', 'medium', 'complex']);

const selectFields = `
  process_items.id,
  process_items.company_id AS "companyId",
  companies.name AS "companyName",
  process_items.requested_by AS "requestedBy",
  users.email AS "requestedByEmail",
  process_items.title,
  process_items.description,
  process_items.category,
  process_items.status,
  process_items.priority,
  process_items.position,
  process_items.complexity,
  process_items.progress,
  process_items.estimate_business_days AS "estimateBusinessDays",
  process_items.planned_start AS "plannedStart",
  process_items.due_date AS "dueDate",
  process_items.delivered_at AS "deliveredAt",
  process_items.latest_update AS "latestUpdate",
  process_items.created_at AS "createdAt",
  process_items.updated_at AS "updatedAt"
`;

const getProcessItem = async (id) => {
  const result = await query(
    `SELECT ${selectFields}
       FROM process_items
       JOIN companies ON companies.id = process_items.company_id
       LEFT JOIN users ON users.id = process_items.requested_by
      WHERE process_items.id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

router.get('/', authenticateToken, async (req, res) => {
  const values = [];
  const conditions = [];

  if (req.user.role === 'client') {
    values.push(req.user.companyId);
    conditions.push(`process_items.company_id = $${values.length}`);
  } else if (req.query.companyId) {
    const companyId = Number(req.query.companyId);
    if (!Number.isInteger(companyId) || companyId <= 0) {
      return res.status(400).json({ error: 'Empresa inválida' });
    }
    values.push(companyId);
    conditions.push(`process_items.company_id = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query(
    `SELECT ${selectFields}
       FROM process_items
       JOIN companies ON companies.id = process_items.company_id
       LEFT JOIN users ON users.id = process_items.requested_by
       ${where}
      ORDER BY
        CASE process_items.status
          WHEN 'in_progress' THEN 1
          WHEN 'validation' THEN 2
          WHEN 'analysis' THEN 3
          WHEN 'queued' THEN 4
          WHEN 'requested' THEN 5
          WHEN 'paused' THEN 6
          WHEN 'delivered' THEN 7
          ELSE 8
        END,
        process_items.position ASC NULLS LAST,
        process_items.updated_at DESC`,
    values
  );

  res.json({ processes: result.rows });
});

router.post('/', authenticateToken, async (req, res) => {
  const title = String(req.body.title || '').trim();
  const description = String(req.body.description || '').trim();
  const category = validCategories.has(req.body.category) ? req.body.category : 'automation';

  if (!title || !description) {
    return res.status(400).json({ error: 'Título e descrição são obrigatórios' });
  }
  if (title.length > 160 || description.length > 5000) {
    return res.status(400).json({ error: 'A solicitação excede o limite de caracteres' });
  }

  let companyId = req.user.companyId;
  if (req.user.role === 'admin') {
    companyId = Number(req.body.companyId);
    if (!Number.isInteger(companyId) || companyId <= 0) {
      return res.status(400).json({ error: 'Empresa é obrigatória' });
    }
    const company = await query('SELECT id FROM companies WHERE id = $1', [companyId]);
    if (!company.rowCount) {
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }
  }

  const requestedBy = req.user.role === 'client' ? req.user.id : null;
  const status = req.user.role === 'admin' && validStatuses.has(req.body.status)
    ? req.body.status
    : 'requested';
  const priority = req.user.role === 'admin' && validPriorities.has(req.body.priority)
    ? req.body.priority
    : 'normal';

  const result = await query(
    `INSERT INTO process_items
      (company_id, requested_by, title, description, category, status, priority, latest_update)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      companyId,
      requestedBy,
      title,
      description,
      category,
      status,
      priority,
      status === 'requested' ? 'Solicitação recebida. A análise de viabilidade será iniciada em até 48h úteis.' : null
    ]
  );

  const item = await getProcessItem(result.rows[0].id);
  await logAudit({
    companyId,
    userId: req.user.id,
    action: 'process.create',
    resourceType: 'process',
    resourceId: String(item.id),
    metadata: { title, category, status },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.status(201).json({ process: item });
});

router.patch('/:processId', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso de administrador obrigatório' });
  }

  const processId = Number(req.params.processId);
  const existing = await getProcessItem(processId);
  if (!existing) {
    return res.status(404).json({ error: 'Demanda não encontrada' });
  }

  const updates = [];
  const values = [];
  const add = (column, value) => {
    values.push(value);
    updates.push(`${column} = $${values.length}`);
  };

  if (req.body.title !== undefined) {
    const title = String(req.body.title).trim();
    if (!title || title.length > 160) return res.status(400).json({ error: 'Título inválido' });
    add('title', title);
  }
  if (req.body.description !== undefined) {
    const description = String(req.body.description).trim();
    if (!description || description.length > 5000) return res.status(400).json({ error: 'Descrição inválida' });
    add('description', description);
  }
  if (req.body.category !== undefined) {
    if (!validCategories.has(req.body.category)) return res.status(400).json({ error: 'Categoria inválida' });
    add('category', req.body.category);
  }
  if (req.body.status !== undefined) {
    if (!validStatuses.has(req.body.status)) return res.status(400).json({ error: 'Status inválido' });
    add('status', req.body.status);
    if (req.body.status === 'delivered') add('delivered_at', new Date());
  }
  if (req.body.priority !== undefined) {
    if (!validPriorities.has(req.body.priority)) return res.status(400).json({ error: 'Prioridade inválida' });
    add('priority', req.body.priority);
  }
  if (req.body.complexity !== undefined) {
    if (req.body.complexity !== null && !validComplexities.has(req.body.complexity)) {
      return res.status(400).json({ error: 'Complexidade inválida' });
    }
    add('complexity', req.body.complexity);
  }
  if (req.body.progress !== undefined) {
    const progress = Number(req.body.progress);
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
      return res.status(400).json({ error: 'Progresso deve estar entre 0 e 100' });
    }
    add('progress', progress);
  }
  if (req.body.position !== undefined) {
    const position = req.body.position === null ? null : Number(req.body.position);
    if (position !== null && (!Number.isInteger(position) || position <= 0)) {
      return res.status(400).json({ error: 'Posição inválida' });
    }
    add('position', position);
  }
  if (req.body.estimateBusinessDays !== undefined) {
    const days = req.body.estimateBusinessDays === null ? null : Number(req.body.estimateBusinessDays);
    if (days !== null && (!Number.isInteger(days) || days <= 0)) {
      return res.status(400).json({ error: 'Estimativa inválida' });
    }
    add('estimate_business_days', days);
  }
  if (req.body.plannedStart !== undefined) add('planned_start', req.body.plannedStart || null);
  if (req.body.dueDate !== undefined) add('due_date', req.body.dueDate || null);
  if (req.body.latestUpdate !== undefined) add('latest_update', String(req.body.latestUpdate || '').trim() || null);

  if (!updates.length) {
    return res.status(400).json({ error: 'Nenhuma alteração informada' });
  }

  add('updated_at', new Date());
  values.push(processId);
  await query(`UPDATE process_items SET ${updates.join(', ')} WHERE id = $${values.length}`, values);

  const item = await getProcessItem(processId);
  await logAudit({
    companyId: existing.companyId,
    userId: req.user.id,
    action: 'process.update',
    resourceType: 'process',
    resourceId: String(processId),
    metadata: { fields: Object.keys(req.body), status: item.status },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  res.json({ process: item });
});

module.exports = router;
