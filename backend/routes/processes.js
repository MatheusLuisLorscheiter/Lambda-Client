const express = require('express');
const { authenticateToken } = require('./auth');
const { pool, query } = require('../db');
const { logAudit } = require('../audit/logger');
const { subscribeToProcessEvents, publishProcessEvent } = require('../services/processEvents');

const router = express.Router();

const validCategories = new Set(['automation', 'integration', 'maintenance', 'improvement', 'support']);
const validStatuses = new Set(['requested', 'analysis', 'queued', 'in_progress', 'validation', 'delivered', 'paused', 'cancelled']);
const validPriorities = new Set(['low', 'normal', 'high', 'urgent']);
const validComplexities = new Set(['simple', 'medium', 'complex']);
const validImpacts = new Set(['low', 'medium', 'high', 'critical']);
const validHealth = new Set(['on_track', 'at_risk', 'off_track', 'blocked']);
const validUpdateKinds = new Set(['update', 'comment', 'status', 'decision', 'delivery', 'system']);
const validChecklistStatuses = new Set(['todo', 'in_progress', 'done', 'blocked']);
const validDeliveryStatuses = new Set(['draft', 'ready', 'accepted', 'rejected']);
const validDeliveryEnvironments = new Set(['development', 'staging', 'production']);

const normalizeText = (value, maxLength, { required = false } = {}) => {
  if (value === undefined) return undefined;
  const normalized = String(value || '').trim();
  if (required && !normalized) throw new Error('Campo obrigatÃ³rio');
  if (normalized.length > maxLength) throw new Error(`Limite de ${maxLength} caracteres excedido`);
  return normalized || null;
};

const normalizeTags = (value) => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error('Tags invÃ¡lidas');
  const tags = [...new Set(value.map(item => String(item).trim().toLowerCase()).filter(Boolean))];
  if (tags.length > 20 || tags.some(tag => tag.length > 40)) throw new Error('Tags invÃ¡lidas');
  return tags;
};

const normalizeLinks = (value) => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 20) throw new Error('Links invÃ¡lidos');
  return [...new Set(value.map(item => {
    const raw = String(item).trim();
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Links invÃ¡lidos');
    return parsed.toString();
  }))];
};

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

const addBusinessHours = (from, hours) => {
  const date = new Date(from);
  let remaining = hours;
  date.setMinutes(0, 0, 0);
  while (remaining > 0) {
    date.setHours(date.getHours() + 1);
    const day = date.getDay();
    const hour = date.getHours();
    if (day !== 0 && day !== 6 && hour >= 9 && hour < 18) remaining -= 1;
  }
  return date;
};

const selectFields = `
  process_items.id,
  process_items.company_id AS "companyId",
  companies.name AS "companyName",
  COALESCE(process_items.reference_code, 'LP-' || LPAD(process_items.id::text, 6, '0')) AS "referenceCode",
  process_items.requested_by AS "requestedBy",
  users.email AS "requestedByEmail",
  process_items.owner_user_id AS "ownerUserId",
  owner_users.email AS "ownerEmail",
  process_items.title,
  process_items.description,
  process_items.objective,
  process_items.scope,
  process_items.acceptance_criteria AS "acceptanceCriteria",
  process_items.category,
  process_items.status,
  process_items.priority,
  process_items.impact,
  process_items.health,
  process_items.position,
  process_items.complexity,
  process_items.progress,
  process_items.estimate_business_days AS "estimateBusinessDays",
  to_char(process_items.planned_start, 'YYYY-MM-DD') AS "plannedStart",
  to_char(process_items.due_date, 'YYYY-MM-DD') AS "dueDate",
  process_items.target_sla_at AS "targetSlaAt",
  process_items.delivered_at AS "deliveredAt",
  process_items.blocked_reason AS "blockedReason",
  process_items.next_action AS "nextAction",
  process_items.tags,
  process_items.custom_fields AS "customFields",
  process_items.client_can_comment AS "clientCanComment",
  process_items.version,
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
          'parentId', ordered_updates.parent_id,
          'kind', ordered_updates.kind,
          'visibility', ordered_updates.visibility,
          'message', ordered_updates.message,
          'metadata', ordered_updates.metadata,
          'authorId', ordered_updates.author_user_id,
          'authorEmail', ordered_updates.author_email,
          'authorRole', ordered_updates.author_role,
          'editedAt', ordered_updates.edited_at,
          'createdAt', ordered_updates.created_at
        )
        ORDER BY ordered_updates.created_at DESC
      )
      FROM (
        SELECT process_updates.id, process_updates.parent_id, process_updates.kind,
               process_updates.visibility, process_updates.message, process_updates.metadata,
               process_updates.author_user_id, update_authors.email AS author_email,
               update_authors.role AS author_role, process_updates.edited_at,
               process_updates.created_at
        FROM process_updates
        LEFT JOIN users update_authors ON update_authors.id = process_updates.author_user_id
        WHERE process_updates.process_id = process_items.id
          AND process_updates.deleted_at IS NULL
        ORDER BY process_updates.created_at DESC
        LIMIT 100
      ) AS ordered_updates
    ),
    '[]'::json
  ) AS updates,
  COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'id', checklist.id,
          'title', checklist.title,
          'description', checklist.description,
          'status', checklist.status,
          'assigneeUserId', checklist.assignee_user_id,
          'assigneeEmail', assignees.email,
          'dueDate', to_char(checklist.due_date, 'YYYY-MM-DD'),
          'sortOrder', checklist.sort_order,
          'completedAt', checklist.completed_at,
          'createdAt', checklist.created_at,
          'updatedAt', checklist.updated_at
        )
        ORDER BY checklist.sort_order, checklist.id
      )
      FROM process_checklist_items checklist
      LEFT JOIN users assignees ON assignees.id = checklist.assignee_user_id
      WHERE checklist.process_id = process_items.id
    ),
    '[]'::json
  ) AS checklist,
  COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'id', deliveries.id,
          'title', deliveries.title,
          'summary', deliveries.summary,
          'version', deliveries.version,
          'environment', deliveries.environment,
          'status', deliveries.status,
          'artifactLinks', deliveries.artifact_links,
          'releaseNotes', deliveries.release_notes,
          'rollbackPlan', deliveries.rollback_plan,
          'acceptanceNote', deliveries.acceptance_note,
          'deliveredAt', deliveries.delivered_at,
          'acceptedAt', deliveries.accepted_at,
          'createdAt', deliveries.created_at,
          'updatedAt', deliveries.updated_at
        )
        ORDER BY deliveries.created_at DESC
      )
      FROM process_deliveries deliveries
      WHERE deliveries.process_id = process_items.id
        AND deliveries.status <> 'draft'
    ),
    '[]'::json
  ) AS deliveries
`;

const sanitizeProcessForUser = (item, user) => {
  if (!item) return item;
  if (user?.role === 'client') {
    item.updates = (item.updates || []).filter(update => update.visibility === 'client');
    delete item.customFields;
  }
  return item;
};

const getProcessItem = async (id, user = null) => {
  const result = await query(
    `SELECT ${selectFields}
       FROM process_items
       JOIN companies ON companies.id = process_items.company_id
       LEFT JOIN users ON users.id = process_items.requested_by
       LEFT JOIN users owner_users ON owner_users.id = process_items.owner_user_id
      WHERE process_items.id = $1`,
    [id]
  );
  return sanitizeProcessForUser(result.rows[0] || null, user);
};

const getAuthorizedProcess = async (id, user) => {
  const item = await getProcessItem(id, user);
  if (!item) return null;
  if (user.role === 'client' && item.companyId !== user.companyId) return null;
  return item;
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

  if (req.query.status) {
    const statuses = String(req.query.status).split(',').map(value => value.trim()).filter(Boolean);
    if (!statuses.length || statuses.some(status => !validStatuses.has(status))) {
      return res.status(400).json({ error: 'Status invÃ¡lido' });
    }
    values.push(statuses);
    conditions.push(`process_items.status = ANY($${values.length}::text[])`);
  }

  if (req.query.search) {
    const search = String(req.query.search).trim();
    if (search.length > 120) return res.status(400).json({ error: 'Busca muito longa' });
    values.push(`%${search}%`);
    conditions.push(`(
      process_items.title ILIKE $${values.length}
      OR process_items.description ILIKE $${values.length}
      OR process_items.reference_code ILIKE $${values.length}
      OR companies.name ILIKE $${values.length}
    )`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(Number(req.query.limit) || 250, 1), 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const result = await query(
    `SELECT ${selectFields}
       FROM process_items
       JOIN companies ON companies.id = process_items.company_id
       LEFT JOIN users ON users.id = process_items.requested_by
       LEFT JOIN users owner_users ON owner_users.id = process_items.owner_user_id
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
        process_items.updated_at DESC
      LIMIT ${limit} OFFSET ${offset}`,
    values
  );

  res.json({
    processes: result.rows.map(item => sanitizeProcessForUser(item, req.user)),
    pagination: { limit, offset, returned: result.rows.length, hasMore: result.rows.length === limit }
  });
});

router.get('/summary', authenticateToken, async (req, res) => {
  const values = [];
  const conditions = [];

  if (req.user.role === 'client') {
    values.push(req.user.companyId);
    conditions.push(`company_id = $${values.length}`);
  } else if (req.query.companyId) {
    const companyId = Number(req.query.companyId);
    if (!Number.isInteger(companyId) || companyId <= 0) {
      return res.status(400).json({ error: 'Empresa invÃ¡lida' });
    }
    values.push(companyId);
    conditions.push(`company_id = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status IN ('requested', 'analysis'))::int AS "awaitingAnalysis",
       COUNT(*) FILTER (WHERE status = 'queued')::int AS queued,
       COUNT(*) FILTER (WHERE status IN ('in_progress', 'validation'))::int AS "inExecution",
       COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
       COUNT(*) FILTER (WHERE health IN ('at_risk', 'off_track', 'blocked'))::int AS "needsAttention",
       COUNT(*) FILTER (
         WHERE due_date IS NOT NULL
           AND due_date < CURRENT_DATE
           AND status NOT IN ('delivered', 'cancelled')
       )::int AS overdue,
       COALESCE(ROUND(AVG(progress) FILTER (WHERE status IN ('in_progress', 'validation'))), 0)::int AS "averageProgress",
       MIN(due_date) FILTER (
         WHERE due_date >= CURRENT_DATE
           AND status NOT IN ('delivered', 'cancelled')
       ) AS "nextDueDate"
     FROM process_items
     ${where}`,
    values
  );

  const recent = await query(
    `SELECT id,
            COALESCE(reference_code, 'LP-' || LPAD(id::text, 6, '0')) AS "referenceCode",
            title, status, health, progress, updated_at AS "updatedAt"
       FROM process_items
       ${where}
      ORDER BY updated_at DESC
      LIMIT 8`,
    values
  );

  res.json({ summary: result.rows[0], recent: recent.rows });
});

router.get('/stream/events', authenticateToken, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.write(`event: connected\ndata: ${JSON.stringify({ connectedAt: new Date().toISOString() })}\n\n`);

  const unsubscribe = subscribeToProcessEvents({
    companyId: req.user.companyId,
    isAdmin: req.user.role === 'admin',
    send: event => {
      res.write(`id: ${event.id}\nevent: process-change\ndata: ${JSON.stringify(event)}\n\n`);
    }
  });
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

router.get('/:processId', authenticateToken, async (req, res) => {
  const processId = Number(req.params.processId);
  if (!Number.isInteger(processId) || processId <= 0) {
    return res.status(400).json({ error: 'Demanda invÃ¡lida' });
  }
  const item = await getAuthorizedProcess(processId, req.user);
  if (!item) return res.status(404).json({ error: 'Demanda nÃ£o encontrada' });
  res.json({ process: item });
});

router.post('/', authenticateToken, async (req, res) => {
  const title = String(req.body.title || '').trim();
  const description = String(req.body.description || '').trim();
  const category = validCategories.has(req.body.category) ? req.body.category : 'automation';
  let objective;
  let scope;
  let acceptanceCriteria;
  let tags;
  try {
    objective = normalizeText(req.body.objective, 3000);
    scope = normalizeText(req.body.scope, 5000);
    acceptanceCriteria = normalizeText(req.body.acceptanceCriteria, 5000);
    tags = normalizeTags(req.body.tags) || [];
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

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
  const impact = req.user.role === 'admin' && validImpacts.has(req.body.impact)
    ? req.body.impact
    : 'medium';
  const health = req.user.role === 'admin' && validHealth.has(req.body.health)
    ? req.body.health
    : 'on_track';
  const ownerUserId = req.user.role === 'admin' && req.body.ownerUserId
    ? Number(req.body.ownerUserId)
    : null;
  if (ownerUserId !== null && (!Number.isInteger(ownerUserId) || ownerUserId <= 0)) {
    return res.status(400).json({ error: 'ResponsÃ¡vel invÃ¡lido' });
  }

  let progress = 0;
  let estimateBusinessDays = null;
  let position = null;
  let plannedStart = null;
  let dueDate = null;
  let targetSlaAt = req.user.role === 'client' ? addBusinessHours(new Date(), 48) : null;
  let blockedReason = null;
  let nextAction = null;
  let clientCanComment = true;
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
    blockedReason = String(req.body.blockedReason || '').trim() || null;
    nextAction = String(req.body.nextAction || '').trim() || null;
    clientCanComment = req.body.clientCanComment !== false;
    if (req.body.targetSlaAt) {
      targetSlaAt = new Date(req.body.targetSlaAt);
      if (Number.isNaN(targetSlaAt.getTime())) {
        return res.status(400).json({ error: 'SLA invÃ¡lido' });
      }
    }

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
         complexity, progress, estimate_business_days, planned_start, due_date, delivered_at, latest_update,
         owner_user_id, objective, scope, acceptance_criteria, impact, health, target_sla_at,
         blocked_reason, next_action, tags, client_can_comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
               $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
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
        latestUpdate,
        ownerUserId,
        objective,
        scope,
        acceptanceCriteria,
        impact,
        health,
        targetSlaAt,
        blockedReason,
        nextAction,
        JSON.stringify(tags),
        clientCanComment
      ]
    );
    processId = result.rows[0].id;
    await client.query(
      `UPDATE process_items
          SET reference_code = 'LP-' || LPAD(id::text, 6, '0')
        WHERE id = $1 AND reference_code IS NULL`,
      [processId]
    );
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

  const item = await getProcessItem(processId, req.user);
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
  publishProcessEvent({ companyId, processId: item.id, type: 'process.created', data: { status: item.status } });

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
  try {
    if (req.body.objective !== undefined) add('objective', normalizeText(req.body.objective, 3000));
    if (req.body.scope !== undefined) add('scope', normalizeText(req.body.scope, 5000));
    if (req.body.acceptanceCriteria !== undefined) {
      add('acceptance_criteria', normalizeText(req.body.acceptanceCriteria, 5000));
    }
    if (req.body.tags !== undefined) add('tags', JSON.stringify(normalizeTags(req.body.tags)));
  } catch (error) {
    return res.status(400).json({ error: error.message });
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
  if (req.body.impact !== undefined) {
    if (!validImpacts.has(req.body.impact)) return res.status(400).json({ error: 'Impacto invÃ¡lido' });
    add('impact', req.body.impact);
  }
  if (req.body.health !== undefined) {
    if (!validHealth.has(req.body.health)) return res.status(400).json({ error: 'SaÃºde invÃ¡lida' });
    add('health', req.body.health);
  }
  if (req.body.ownerUserId !== undefined) {
    const ownerUserId = req.body.ownerUserId === null || req.body.ownerUserId === ''
      ? null
      : Number(req.body.ownerUserId);
    if (ownerUserId !== null && (!Number.isInteger(ownerUserId) || ownerUserId <= 0)) {
      return res.status(400).json({ error: 'ResponsÃ¡vel invÃ¡lido' });
    }
    add('owner_user_id', ownerUserId);
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
  if (req.body.targetSlaAt !== undefined) {
    const targetSlaAt = req.body.targetSlaAt ? new Date(req.body.targetSlaAt) : null;
    if (targetSlaAt && Number.isNaN(targetSlaAt.getTime())) {
      return res.status(400).json({ error: 'SLA invÃ¡lido' });
    }
    add('target_sla_at', targetSlaAt);
  }
  if (req.body.blockedReason !== undefined) {
    try {
      add('blocked_reason', normalizeText(req.body.blockedReason, 2000));
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }
  if (req.body.nextAction !== undefined) {
    try {
      add('next_action', normalizeText(req.body.nextAction, 2000));
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }
  if (req.body.clientCanComment !== undefined) {
    add('client_can_comment', Boolean(req.body.clientCanComment));
  }
  if (req.body.customFields !== undefined) {
    if (!req.body.customFields || typeof req.body.customFields !== 'object' || Array.isArray(req.body.customFields)) {
      return res.status(400).json({ error: 'Campos personalizados invÃ¡lidos' });
    }
    const serialized = JSON.stringify(req.body.customFields);
    if (serialized.length > 20_000) return res.status(400).json({ error: 'Campos personalizados excedem o limite' });
    add('custom_fields', serialized);
  }

  const effectiveHealth = req.body.health || existing.health;
  const effectiveBlockedReason = req.body.blockedReason !== undefined
    ? String(req.body.blockedReason || '').trim()
    : existing.blockedReason;
  if (effectiveHealth === 'blocked' && !effectiveBlockedReason) {
    return res.status(400).json({ error: 'Informe o motivo do bloqueio' });
  }
  const nextUpdateMessage = req.body.latestUpdate !== undefined
    ? String(req.body.latestUpdate || '').trim() || null
    : undefined;
  if (nextUpdateMessage !== undefined) add('latest_update', nextUpdateMessage);

  if (!updates.length) {
    return res.status(400).json({ error: 'Nenhuma alteração informada' });
  }

  updates.push('version = version + 1');
  add('updated_at', new Date());
  values.push(processId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if ((req.body.status || existing.status) === 'queued' && req.body.position) {
      await client.query(
        `UPDATE process_items
            SET position = position + 1000000
          WHERE company_id = $1
            AND status = 'queued'
            AND id <> $2
            AND position >= $3`,
        [existing.companyId, processId, Number(req.body.position)]
      );
      await client.query(
        `UPDATE process_items
            SET position = position - 999999
          WHERE company_id = $1
            AND status = 'queued'
            AND id <> $2
            AND position >= $3 + 1000000`,
        [existing.companyId, processId, Number(req.body.position)]
      );
    }
    await client.query(`UPDATE process_items SET ${updates.join(', ')} WHERE id = $${values.length}`, values);
    if (nextUpdateMessage && nextUpdateMessage !== existing.latestUpdate) {
      await client.query(
        'INSERT INTO process_updates (process_id, author_user_id, message) VALUES ($1, $2, $3)',
        [processId, req.user.id, nextUpdateMessage]
      );
    } else if (req.body.status && req.body.status !== existing.status) {
      const statusMessage = `Status atualizado de ${existing.status} para ${req.body.status}.`;
      await client.query(
        `INSERT INTO process_updates
          (process_id, author_user_id, kind, visibility, message, metadata)
         VALUES ($1, $2, 'status', 'client', $3, $4)`,
        [processId, req.user.id, statusMessage, JSON.stringify({ from: existing.status, to: req.body.status })]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const item = await getProcessItem(processId, req.user);
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
  publishProcessEvent({
    companyId: existing.companyId,
    processId,
    type: 'process.updated',
    data: { status: item.status, version: item.version }
  });

  res.json({ process: item });
});

router.post('/queue/reorder', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso de administrador obrigatÃ³rio' });
  }
  const companyId = Number(req.body.companyId);
  const orderedIds = Array.isArray(req.body.orderedIds)
    ? [...new Set(req.body.orderedIds.map(Number))]
    : [];
  if (!Number.isInteger(companyId) || companyId <= 0 || !orderedIds.length ||
      orderedIds.some(id => !Number.isInteger(id) || id <= 0)) {
    return res.status(400).json({ error: 'Ordem da fila invÃ¡lida' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT id
         FROM process_items
        WHERE company_id = $1 AND status = 'queued'
        ORDER BY position NULLS LAST, created_at, id
        FOR UPDATE`,
      [companyId]
    );
    const currentIds = current.rows.map(row => Number(row.id));
    if (currentIds.length !== orderedIds.length ||
        currentIds.some(id => !orderedIds.includes(id))) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'A fila mudou enquanto vocÃª organizava. Atualize a tela e tente novamente.'
      });
    }

    await client.query(
      `UPDATE process_items
          SET position = position + 1000000
        WHERE company_id = $1 AND status = 'queued'`,
      [companyId]
    );
    for (let index = 0; index < orderedIds.length; index += 1) {
      await client.query(
        'UPDATE process_items SET position = $1, updated_at = NOW(), version = version + 1 WHERE id = $2',
        [index + 1, orderedIds[index]]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await logAudit({
    companyId,
    userId: req.user.id,
    action: 'process.queue.reorder',
    resourceType: 'process_queue',
    resourceId: String(companyId),
    metadata: { orderedIds },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
  publishProcessEvent({ companyId, type: 'queue.reordered', data: { orderedIds } });
  res.json({ success: true });
});

router.post('/:processId/comments', authenticateToken, async (req, res) => {
  const processId = Number(req.params.processId);
  const item = await getAuthorizedProcess(processId, req.user);
  if (!item) return res.status(404).json({ error: 'Demanda nÃ£o encontrada' });
  if (req.user.role === 'client' && !item.clientCanComment) {
    return res.status(403).json({ error: 'Os comentÃ¡rios estÃ£o desativados para esta demanda' });
  }

  const message = String(req.body.message || '').trim();
  if (!message || message.length > 5000) {
    return res.status(400).json({ error: 'ComentÃ¡rio invÃ¡lido' });
  }
  const visibility = req.user.role === 'admin' && req.body.visibility === 'internal'
    ? 'internal'
    : 'client';
  const kind = validUpdateKinds.has(req.body.kind) ? req.body.kind : 'comment';
  const parentId = req.body.parentId ? Number(req.body.parentId) : null;
  if (parentId && (!Number.isInteger(parentId) || parentId <= 0)) {
    return res.status(400).json({ error: 'Resposta invÃ¡lida' });
  }
  if (parentId) {
    const parent = await query(
      'SELECT id, visibility FROM process_updates WHERE id = $1 AND process_id = $2 AND deleted_at IS NULL',
      [parentId, processId]
    );
    if (!parent.rowCount || (req.user.role === 'client' && parent.rows[0].visibility !== 'client')) {
      return res.status(404).json({ error: 'ComentÃ¡rio original nÃ£o encontrado' });
    }
  }

  const result = await query(
    `INSERT INTO process_updates
      (process_id, author_user_id, parent_id, kind, visibility, message)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, parent_id AS "parentId", kind, visibility, message,
               author_user_id AS "authorId", created_at AS "createdAt"`,
    [processId, req.user.id, parentId, kind, visibility, message]
  );
  await query('UPDATE process_items SET updated_at = NOW(), version = version + 1 WHERE id = $1', [processId]);

  const comment = {
    ...result.rows[0],
    authorEmail: req.user.email,
    authorRole: req.user.role,
    metadata: {}
  };
  await logAudit({
    companyId: item.companyId,
    userId: req.user.id,
    action: 'process.comment.create',
    resourceType: 'process',
    resourceId: String(processId),
    metadata: { visibility, kind },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
  publishProcessEvent({ companyId: item.companyId, processId, type: 'comment.created', data: { visibility } });
  res.status(201).json({ comment });
});

router.patch('/:processId/comments/:commentId', authenticateToken, async (req, res) => {
  const processId = Number(req.params.processId);
  const commentId = Number(req.params.commentId);
  const item = await getAuthorizedProcess(processId, req.user);
  if (!item) return res.status(404).json({ error: 'Demanda nÃ£o encontrada' });
  const message = String(req.body.message || '').trim();
  if (!message || message.length > 5000) {
    return res.status(400).json({ error: 'ComentÃ¡rio invÃ¡lido' });
  }
  const result = await query(
    `UPDATE process_updates
        SET message = $1, edited_at = NOW()
      WHERE id = $2 AND process_id = $3 AND author_user_id = $4
        AND kind = 'comment' AND deleted_at IS NULL
      RETURNING id, message, edited_at AS "editedAt"`,
    [message, commentId, processId, req.user.id]
  );
  if (!result.rowCount) {
    return res.status(404).json({ error: 'ComentÃ¡rio nÃ£o encontrado ou sem permissÃ£o para editar' });
  }
  res.json({ comment: result.rows[0] });
});

router.delete('/:processId/comments/:commentId', authenticateToken, async (req, res) => {
  const processId = Number(req.params.processId);
  const commentId = Number(req.params.commentId);
  const item = await getAuthorizedProcess(processId, req.user);
  if (!item) return res.status(404).json({ error: 'Demanda nÃ£o encontrada' });
  const values = [commentId, processId];
  const authorCondition = req.user.role === 'admin' ? '' : 'AND author_user_id = $3';
  if (req.user.role !== 'admin') values.push(req.user.id);
  const result = await query(
    `UPDATE process_updates
        SET deleted_at = NOW(), message = '[comentÃ¡rio removido]'
      WHERE id = $1 AND process_id = $2 ${authorCondition} AND kind = 'comment' AND deleted_at IS NULL
      RETURNING id`,
    values
  );
  if (!result.rowCount) return res.status(404).json({ error: 'ComentÃ¡rio nÃ£o encontrado' });
  res.json({ success: true });
});

router.post('/:processId/checklist', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso de administrador obrigatÃ³rio' });
  }
  const processId = Number(req.params.processId);
  const item = await getAuthorizedProcess(processId, req.user);
  if (!item) return res.status(404).json({ error: 'Demanda nÃ£o encontrada' });
  const title = String(req.body.title || '').trim();
  const description = String(req.body.description || '').trim() || null;
  if (!title || title.length > 240 || (description && description.length > 3000)) {
    return res.status(400).json({ error: 'Item da lista invÃ¡lido' });
  }
  const status = validChecklistStatuses.has(req.body.status) ? req.body.status : 'todo';
  let dueDate;
  try {
    dueDate = normalizeOptionalDate(req.body.dueDate, 'Prazo');
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const sortResult = await query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS "sortOrder" FROM process_checklist_items WHERE process_id = $1',
    [processId]
  );
  const result = await query(
    `INSERT INTO process_checklist_items
      (process_id, title, description, status, due_date, sort_order, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, title, description, status, due_date AS "dueDate",
               sort_order AS "sortOrder", completed_at AS "completedAt",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [
      processId, title, description, status, dueDate,
      Number(sortResult.rows[0].sortOrder),
      status === 'done' ? new Date() : null
    ]
  );
  res.status(201).json({ checklistItem: result.rows[0] });
});

router.patch('/:processId/checklist/:itemId', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso de administrador obrigatÃ³rio' });
  }
  const processId = Number(req.params.processId);
  const itemId = Number(req.params.itemId);
  const item = await getAuthorizedProcess(processId, req.user);
  if (!item) return res.status(404).json({ error: 'Demanda nÃ£o encontrada' });

  const fields = [];
  const values = [];
  const add = (column, value) => {
    values.push(value);
    fields.push(`${column} = $${values.length}`);
  };
  if (req.body.title !== undefined) {
    const title = String(req.body.title || '').trim();
    if (!title || title.length > 240) return res.status(400).json({ error: 'TÃ­tulo invÃ¡lido' });
    add('title', title);
  }
  if (req.body.description !== undefined) add('description', String(req.body.description || '').trim() || null);
  if (req.body.status !== undefined) {
    if (!validChecklistStatuses.has(req.body.status)) return res.status(400).json({ error: 'Status invÃ¡lido' });
    add('status', req.body.status);
    add('completed_at', req.body.status === 'done' ? new Date() : null);
  }
  if (req.body.dueDate !== undefined) {
    try {
      add('due_date', normalizeOptionalDate(req.body.dueDate, 'Prazo'));
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }
  if (req.body.sortOrder !== undefined) {
    const sortOrder = Number(req.body.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0) return res.status(400).json({ error: 'Ordem invÃ¡lida' });
    add('sort_order', sortOrder);
  }
  if (!fields.length) return res.status(400).json({ error: 'Nenhuma alteraÃ§Ã£o informada' });
  fields.push('updated_at = NOW()');
  values.push(itemId, processId);
  const result = await query(
    `UPDATE process_checklist_items SET ${fields.join(', ')}
      WHERE id = $${values.length - 1} AND process_id = $${values.length}
      RETURNING id, title, description, status, due_date AS "dueDate",
                sort_order AS "sortOrder", completed_at AS "completedAt",
                created_at AS "createdAt", updated_at AS "updatedAt"`,
    values
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Item nÃ£o encontrado' });
  publishProcessEvent({ companyId: item.companyId, processId, type: 'checklist.updated' });
  res.json({ checklistItem: result.rows[0] });
});

router.delete('/:processId/checklist/:itemId', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso de administrador obrigatÃ³rio' });
  }
  const processId = Number(req.params.processId);
  const itemId = Number(req.params.itemId);
  const item = await getAuthorizedProcess(processId, req.user);
  if (!item) return res.status(404).json({ error: 'Demanda nÃ£o encontrada' });
  const result = await query(
    'DELETE FROM process_checklist_items WHERE id = $1 AND process_id = $2 RETURNING id',
    [itemId, processId]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Item nÃ£o encontrado' });
  publishProcessEvent({ companyId: item.companyId, processId, type: 'checklist.deleted' });
  res.json({ success: true });
});

router.post('/:processId/deliveries', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso de administrador obrigatÃ³rio' });
  }
  const processId = Number(req.params.processId);
  const item = await getAuthorizedProcess(processId, req.user);
  if (!item) return res.status(404).json({ error: 'Demanda nÃ£o encontrada' });
  const title = String(req.body.title || '').trim();
  const summary = String(req.body.summary || '').trim();
  const status = validDeliveryStatuses.has(req.body.status) ? req.body.status : 'ready';
  const environment = validDeliveryEnvironments.has(req.body.environment) ? req.body.environment : 'production';
  if (!title || title.length > 240 || !summary || summary.length > 5000) {
    return res.status(400).json({ error: 'Dados da entrega invÃ¡lidos' });
  }
  let artifactLinks;
  try {
    artifactLinks = normalizeLinks(req.body.artifactLinks) || [];
  } catch {
    return res.status(400).json({ error: 'Links da entrega invÃ¡lidos' });
  }

  const client = await pool.connect();
  let delivery;
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO process_deliveries
        (process_id, created_by, title, summary, version, environment, status,
         artifact_links, release_notes, rollback_plan, delivered_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, title, summary, version, environment, status,
                 artifact_links AS "artifactLinks", release_notes AS "releaseNotes",
                 rollback_plan AS "rollbackPlan", delivered_at AS "deliveredAt",
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        processId, req.user.id, title, summary, String(req.body.version || '').trim() || null,
        environment, status, JSON.stringify(artifactLinks),
        String(req.body.releaseNotes || '').trim() || null,
        String(req.body.rollbackPlan || '').trim() || null,
        status === 'ready' ? new Date() : null
      ]
    );
    delivery = result.rows[0];
    if (status === 'ready') {
      await client.query(
        `UPDATE process_items
            SET status = 'validation', progress = GREATEST(progress, 95),
                latest_update = $1, updated_at = NOW(), version = version + 1
          WHERE id = $2`,
        [`Entrega "${title}" disponÃ­vel para validaÃ§Ã£o.`, processId]
      );
      await client.query(
        `INSERT INTO process_updates
          (process_id, author_user_id, kind, visibility, message, metadata)
         VALUES ($1, $2, 'delivery', 'client', $3, $4)`,
        [
          processId, req.user.id,
          `Entrega "${title}" disponÃ­vel para validaÃ§Ã£o.`,
          JSON.stringify({ deliveryId: delivery.id, version: delivery.version, environment })
        ]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  publishProcessEvent({ companyId: item.companyId, processId, type: 'delivery.created', data: { deliveryId: delivery.id } });
  res.status(201).json({ delivery });
});

router.patch('/:processId/deliveries/:deliveryId', authenticateToken, async (req, res) => {
  const processId = Number(req.params.processId);
  const deliveryId = Number(req.params.deliveryId);
  const item = await getAuthorizedProcess(processId, req.user);
  if (!item) return res.status(404).json({ error: 'Demanda nÃ£o encontrada' });
  const status = req.body.status;
  const allowed = req.user.role === 'client'
    ? new Set(['accepted', 'rejected'])
    : validDeliveryStatuses;
  if (!allowed.has(status)) return res.status(400).json({ error: 'Status da entrega invÃ¡lido' });
  const acceptanceNote = String(req.body.acceptanceNote || '').trim() || null;
  if (status === 'rejected' && !acceptanceNote) {
    return res.status(400).json({ error: 'Informe o que precisa ser ajustado' });
  }

  const client = await pool.connect();
  let delivery;
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      'SELECT id, title, status FROM process_deliveries WHERE id = $1 AND process_id = $2 FOR UPDATE',
      [deliveryId, processId]
    );
    if (!existing.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Entrega nÃ£o encontrada' });
    }
    if (req.user.role === 'client' && existing.rows[0].status !== 'ready') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Esta entrega nÃ£o estÃ¡ aguardando validaÃ§Ã£o' });
    }
    const result = await client.query(
      `UPDATE process_deliveries
          SET status = $1, acceptance_note = $2,
              accepted_at = CASE WHEN $1 = 'accepted' THEN NOW() ELSE NULL END,
              accepted_by = CASE WHEN $1 = 'accepted' THEN $3 ELSE NULL END,
              delivered_at = CASE WHEN $1 = 'ready' THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END,
              updated_at = NOW()
        WHERE id = $4
        RETURNING id, title, summary, version, environment, status,
                  artifact_links AS "artifactLinks", release_notes AS "releaseNotes",
                  rollback_plan AS "rollbackPlan", acceptance_note AS "acceptanceNote",
                  delivered_at AS "deliveredAt", accepted_at AS "acceptedAt",
                  created_at AS "createdAt", updated_at AS "updatedAt"`,
      [status, acceptanceNote, req.user.id, deliveryId]
    );
    delivery = result.rows[0];

    if (status === 'accepted' || status === 'rejected') {
      const accepted = status === 'accepted';
      const message = accepted
        ? `Entrega "${delivery.title}" aceita.`
        : `Ajustes solicitados na entrega "${delivery.title}": ${acceptanceNote}`;
      await client.query(
        `UPDATE process_items
            SET status = $1, progress = $2, health = $3,
                delivered_at = $4, latest_update = $5,
                updated_at = NOW(), version = version + 1
          WHERE id = $6`,
        [
          accepted ? 'delivered' : 'in_progress',
          accepted ? 100 : Math.min(item.progress, 90),
          accepted ? 'on_track' : 'at_risk',
          accepted ? new Date() : null,
          message,
          processId
        ]
      );
      await client.query(
        `INSERT INTO process_updates
          (process_id, author_user_id, kind, visibility, message, metadata)
         VALUES ($1, $2, 'delivery', 'client', $3, $4)`,
        [processId, req.user.id, message, JSON.stringify({ deliveryId, status })]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  publishProcessEvent({ companyId: item.companyId, processId, type: 'delivery.updated', data: { deliveryId, status } });
  res.json({ delivery });
});

module.exports = router;
