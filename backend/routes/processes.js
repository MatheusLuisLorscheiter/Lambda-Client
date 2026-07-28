const express = require('express');
const { authenticateToken } = require('./auth');
const { pool, query } = require('../db');
const { logAudit } = require('../audit/logger');

const router = express.Router();

const validCategories = new Set(['automation', 'integration', 'maintenance', 'improvement', 'support']);
const validStatuses = new Set(['requested', 'analysis', 'queued', 'in_progress', 'validation', 'delivered', 'paused', 'cancelled']);
const validPriorities = new Set(['low', 'normal', 'high', 'urgent']);
const validComplexities = new Set(['simple', 'medium', 'complex']);

const normalizeOptionalDate = (value, fieldLabel) => {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${fieldLabel} inválida`);
  }
  const [year, month, day] = normalized.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new Error(`${fieldLabel} inválida`);
  }
  return normalized;
};

const validatePlanningWindow = (plannedStart, dueDate) => {
  if (plannedStart && dueDate && dueDate < plannedStart) {
    throw new Error('A previsão de entrega não pode ser anterior ao início planejado');
  }
};

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
  to_char(process_items.planned_start, 'YYYY-MM-DD') AS "plannedStart",
  to_char(process_items.due_date, 'YYYY-MM-DD') AS "dueDate",
  process_items.delivered_at AS "deliveredAt",
  process_items.latest_update AS "latestUpdate",
  process_items.created_at AS "createdAt",
  process_items.updated_at AS "updatedAt",
  COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'id', integrations.id,
          'name', integrations.name,
          'functionName', integrations.function_name
        )
        ORDER BY integrations.name
      )
      FROM process_integrations
      JOIN integrations ON integrations.id = process_integrations.integration_id
      WHERE process_integrations.process_id = process_items.id
        AND integrations.company_id = process_items.company_id
    ),
    '[]'::json
  ) AS integrations,
  COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'id', ordered_updates.id,
          'message', ordered_updates.message,
          'createdAt', ordered_updates.created_at
        )
        ORDER BY ordered_updates.created_at DESC
      )
      FROM (
        SELECT process_updates.id, process_updates.message, process_updates.created_at
        FROM process_updates
        WHERE process_updates.process_id = process_items.id
        ORDER BY process_updates.created_at DESC
        LIMIT 20
      ) AS ordered_updates
    ),
    '[]'::json
  ) AS updates
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
  const complexity = req.user.role === 'admin' && validComplexities.has(req.body.complexity)
    ? req.body.complexity
    : null;

  let progress = 0;
  let estimateBusinessDays = null;
  let position = null;
  let plannedStart = null;
  let dueDate = null;
  let latestUpdate = status === 'requested'
    ? 'Solicitação recebida. A análise de viabilidade será iniciada em até 48h úteis.'
    : null;

  if (req.user.role === 'admin') {
    if (req.body.progress !== undefined && req.body.progress !== null) {
      progress = Number(req.body.progress);
      if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
        return res.status(400).json({ error: 'Progresso deve estar entre 0 e 100' });
      }
    }
    if (status === 'delivered') progress = 100;

    if (req.body.estimateBusinessDays !== undefined && req.body.estimateBusinessDays !== null && req.body.estimateBusinessDays !== '') {
      estimateBusinessDays = Number(req.body.estimateBusinessDays);
      if (!Number.isInteger(estimateBusinessDays) || estimateBusinessDays <= 0) {
        return res.status(400).json({ error: 'Estimativa inválida' });
      }
    }

    try {
      plannedStart = normalizeOptionalDate(req.body.plannedStart, 'Data de início');
      dueDate = normalizeOptionalDate(req.body.dueDate, 'Previsão de entrega');
      validatePlanningWindow(plannedStart, dueDate);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    latestUpdate = String(req.body.latestUpdate || '').trim() || latestUpdate;

    if (status === 'queued') {
      if (req.body.position !== undefined && req.body.position !== null && req.body.position !== '') {
        position = Number(req.body.position);
        if (!Number.isInteger(position) || position <= 0) {
          return res.status(400).json({ error: 'Posição inválida' });
        }
      } else {
        const nextPosition = await query(
          `SELECT COALESCE(MAX(position), 0) + 1 AS position
             FROM process_items
            WHERE company_id = $1 AND status = 'queued'`,
          [companyId]
        );
        position = Number(nextPosition.rows[0].position);
      }
    }
  }

  const client = await pool.connect();
  let processId;
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO process_items
        (company_id, requested_by, title, description, category, status, priority, position,
         complexity, progress, estimate_business_days, planned_start, due_date, delivered_at, latest_update)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id`,
      [
        companyId,
        requestedBy,
        title,
        description,
        category,
        status,
        priority,
        position,
        complexity,
        progress,
        estimateBusinessDays,
        plannedStart,
        dueDate,
        status === 'delivered' ? new Date() : null,
        latestUpdate
      ]
    );
    processId = result.rows[0].id;
    if (latestUpdate) {
      await client.query(
        'INSERT INTO process_updates (process_id, author_user_id, message) VALUES ($1, $2, $3)',
        [processId, req.user.id, latestUpdate]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const item = await getProcessItem(processId);
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
  if (!Number.isInteger(processId) || processId <= 0) {
    return res.status(400).json({ error: 'Demanda inválida' });
  }
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
    if (req.body.status === 'delivered') {
      add('delivered_at', existing.deliveredAt || new Date());
      if (req.body.progress === undefined) add('progress', 100);
    } else if (existing.status === 'delivered') {
      add('delivered_at', null);
    }

    if (req.body.status === 'queued' && req.body.position === undefined && !existing.position) {
      const nextPosition = await query(
        `SELECT COALESCE(MAX(position), 0) + 1 AS position
           FROM process_items
          WHERE company_id = $1 AND status = 'queued' AND id <> $2`,
        [existing.companyId, processId]
      );
      add('position', Number(nextPosition.rows[0].position));
    } else if (req.body.status !== 'queued' && req.body.position === undefined) {
      add('position', null);
    }
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
    const progress = req.body.status === 'delivered' ? 100 : Number(req.body.progress);
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
      return res.status(400).json({ error: 'Progresso deve estar entre 0 e 100' });
    }
    add('progress', progress);
  }
  if (req.body.position !== undefined) {
    const position = req.body.position === null || req.body.position === ''
      ? null
      : Number(req.body.position);
    if (position !== null && (!Number.isInteger(position) || position <= 0)) {
      return res.status(400).json({ error: 'Posição inválida' });
    }
    const effectiveStatus = req.body.status || existing.status;
    if (effectiveStatus !== 'queued') {
      add('position', null);
    } else if (position !== null) {
      add('position', position);
    } else if (!existing.position) {
      const nextPosition = await query(
        `SELECT COALESCE(MAX(position), 0) + 1 AS position
           FROM process_items
          WHERE company_id = $1 AND status = 'queued' AND id <> $2`,
        [existing.companyId, processId]
      );
      add('position', Number(nextPosition.rows[0].position));
    }
  }
  if (req.body.estimateBusinessDays !== undefined) {
    const days = req.body.estimateBusinessDays === null ? null : Number(req.body.estimateBusinessDays);
    if (days !== null && (!Number.isInteger(days) || days <= 0)) {
      return res.status(400).json({ error: 'Estimativa inválida' });
    }
    add('estimate_business_days', days);
  }
  let nextPlannedStart = existing.plannedStart;
  let nextDueDate = existing.dueDate;
  try {
    if (req.body.plannedStart !== undefined) {
      nextPlannedStart = normalizeOptionalDate(req.body.plannedStart, 'Data de início');
    }
    if (req.body.dueDate !== undefined) {
      nextDueDate = normalizeOptionalDate(req.body.dueDate, 'Previsão de entrega');
    }
    validatePlanningWindow(nextPlannedStart, nextDueDate);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  if (req.body.plannedStart !== undefined) add('planned_start', nextPlannedStart);
  if (req.body.dueDate !== undefined) add('due_date', nextDueDate);
  const nextUpdateMessage = req.body.latestUpdate !== undefined
    ? String(req.body.latestUpdate || '').trim() || null
    : undefined;
  if (nextUpdateMessage !== undefined) add('latest_update', nextUpdateMessage);

  if (!updates.length) {
    return res.status(400).json({ error: 'Nenhuma alteração informada' });
  }

  add('updated_at', new Date());
  values.push(processId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE process_items SET ${updates.join(', ')} WHERE id = $${values.length}`, values);
    if (nextUpdateMessage && nextUpdateMessage !== existing.latestUpdate) {
      await client.query(
        'INSERT INTO process_updates (process_id, author_user_id, message) VALUES ($1, $2, $3)',
        [processId, req.user.id, nextUpdateMessage]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

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
