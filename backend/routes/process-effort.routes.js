const express = require('express');
const { authenticateToken } = require('./auth');
const { pool, query } = require('../db');
const { logAudit } = require('../audit/logger');
const { publishProcessEvent } = require('../services/processEvents');

const router = express.Router();

const validStages = new Set(['baseline', 'post_automation']);
const validSources = new Set(['estimated', 'observed', 'system']);
const validStatuses = new Set(['draft', 'confirmed']);
const validPeriodUnits = new Set(['day', 'week', 'month', 'quarter', 'year']);
const monthlyPeriodFactors = {
  day: 22,
  week: 52 / 12,
  month: 1,
  quarter: 1 / 3,
  year: 1 / 12
};

const round = (value, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

const normalizeText = (value, label, maxLength, { required = false } = {}) => {
  const normalized = String(value || '').trim();
  if (required && !normalized) throw new Error(`${label} é obrigatório`);
  if (normalized.length > maxLength) throw new Error(`${label} excede ${maxLength} caracteres`);
  return normalized || null;
};

const normalizeDate = (value) => {
  const normalized = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error('Data da medição inválida');
  const [year, month, day] = normalized.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error('Data da medição inválida');
  }
  return normalized;
};

const normalizePositiveNumber = (value, label, { max = 100000000 } = {}) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > max) {
    throw new Error(`${label} deve ser maior que zero`);
  }
  return round(number);
};

const normalizeItems = (items) => {
  if (!Array.isArray(items) || !items.length || items.length > 50) {
    throw new Error('Informe de 1 a 50 atividades ou funções');
  }
  return items.map((item, index) => {
    const periodUnit = String(item.periodUnit || '');
    if (!validPeriodUnits.has(periodUnit)) {
      throw new Error(`Periodicidade inválida na atividade ${index + 1}`);
    }
    return {
      activityName: normalizeText(item.activityName, `Atividade ${index + 1}`, 160, { required: true }),
      roleName: normalizeText(item.roleName, 'Função responsável', 160),
      executionTimeMinutes: normalizePositiveNumber(item.executionTimeMinutes, 'Tempo de execução', { max: 525600 }),
      executionsPerPeriod: normalizePositiveNumber(item.executionsPerPeriod, 'Quantidade de execuções', { max: 10000000 }),
      periodUnit,
      workingDaysPerMonth: normalizePositiveNumber(
        item.workingDaysPerMonth ?? 22,
        'Dias de operação por mês',
        { max: 31 }
      ),
      peopleCount: normalizePositiveNumber(item.peopleCount, 'Quantidade de pessoas', { max: 100000 }),
      monthlyHoursPerEmployee: normalizePositiveNumber(
        item.monthlyHoursPerEmployee ?? 176,
        'Capacidade mensal por pessoa',
        { max: 744 }
      ),
      notes: normalizeText(item.notes, 'Observações da atividade', 2000),
      sortOrder: index
    };
  });
};

const normalizeAssessment = (body, { partial = false } = {}) => {
  const result = {};
  if (!partial || body.stage !== undefined) {
    if (!validStages.has(body.stage)) throw new Error('Momento da medição inválido');
    result.stage = body.stage;
  }
  if (!partial || body.label !== undefined) {
    result.label = normalizeText(body.label, 'Nome da medição', 160, { required: true });
  }
  if (!partial || body.measuredAt !== undefined) {
    result.measuredAt = normalizeDate(body.measuredAt);
  }
  if (!partial || body.source !== undefined) {
    if (!validSources.has(body.source)) throw new Error('Origem da medição inválida');
    result.source = body.source;
  }
  if (!partial || body.status !== undefined) {
    if (!validStatuses.has(body.status)) throw new Error('Status da medição inválido');
    result.status = body.status;
  }
  if (!partial || body.notes !== undefined) {
    result.notes = normalizeText(body.notes, 'Observações', 5000);
  }
  if (!partial || body.items !== undefined) {
    result.items = normalizeItems(body.items);
  }
  return result;
};

const getProcessAccess = async (processId, user) => {
  if (!Number.isInteger(processId) || processId <= 0) return null;
  const result = await query(
    `SELECT id, company_id AS "companyId", status, archived_at AS "archivedAt",
            is_client_visible AS "isClientVisible",
            client_can_manage_effort AS "clientCanManageEffort"
       FROM process_items
      WHERE id = $1`,
    [processId]
  );
  const item = result.rows[0] || null;
  if (!item) return null;
  if (user.role === 'client' && (
    item.companyId !== user.companyId ||
    item.archivedAt ||
    item.isClientVisible === false
  )) {
    return null;
  }
  return item;
};

const assessmentSelect = `
  assessments.id,
  assessments.process_id AS "processId",
  assessments.stage,
  assessments.label,
  to_char(assessments.measured_at, 'YYYY-MM-DD') AS "measuredAt",
  assessments.source,
  assessments.status,
  assessments.notes,
  assessments.version,
  assessments.confirmed_at AS "confirmedAt",
  assessments.created_at AS "createdAt",
  assessments.updated_at AS "updatedAt",
  creators.email AS "createdByEmail",
  COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'id', items.id,
          'activityName', items.activity_name,
          'roleName', items.role_name,
          'executionTimeMinutes', items.execution_time_minutes,
          'executionsPerPeriod', items.executions_per_period,
          'periodUnit', items.period_unit,
          'workingDaysPerMonth', items.working_days_per_month,
          'peopleCount', items.people_count,
          'monthlyHoursPerEmployee', items.monthly_hours_per_employee,
          'notes', items.notes,
          'sortOrder', items.sort_order
        )
        ORDER BY items.sort_order, items.id
      )
      FROM process_effort_items items
      WHERE items.assessment_id = assessments.id
    ),
    '[]'::json
  ) AS items
`;

const getAssessments = async (processId) => {
  const result = await query(
    `SELECT ${assessmentSelect}
       FROM process_effort_assessments assessments
       LEFT JOIN users creators ON creators.id = assessments.created_by
      WHERE assessments.process_id = $1
      ORDER BY assessments.measured_at DESC, assessments.created_at DESC, assessments.id DESC`,
    [processId]
  );
  return result.rows;
};

const summarizeAssessment = (assessment) => {
  if (!assessment) return null;
  const items = (assessment.items || []).map(item => {
    const periodFactor = item.periodUnit === 'day'
      ? Number(item.workingDaysPerMonth || 22)
      : monthlyPeriodFactors[item.periodUnit];
    const executionsPerMonth = Number(item.executionsPerPeriod) * periodFactor;
    const elapsedHoursPerMonth =
      (Number(item.executionTimeMinutes) * executionsPerMonth) / 60;
    const workHoursPerMonth = elapsedHoursPerMonth * Number(item.peopleCount);
    const fteEquivalent = workHoursPerMonth / Number(item.monthlyHoursPerEmployee);
    return {
      id: item.id,
      executionsPerMonth: round(executionsPerMonth),
      elapsedHoursPerMonth: round(elapsedHoursPerMonth),
      workHoursPerMonth: round(workHoursPerMonth),
      fteEquivalent: round(fteEquivalent, 3)
    };
  });
  return {
    assessmentId: assessment.id,
    label: assessment.label,
    measuredAt: assessment.measuredAt,
    status: assessment.status,
    activityCount: items.length,
    executionsPerMonth: round(items.reduce((sum, item) => sum + item.executionsPerMonth, 0)),
    elapsedHoursPerMonth: round(items.reduce((sum, item) => sum + item.elapsedHoursPerMonth, 0)),
    workHoursPerMonth: round(items.reduce((sum, item) => sum + item.workHoursPerMonth, 0)),
    fteEquivalent: round(items.reduce((sum, item) => sum + item.fteEquivalent, 0), 3),
    items
  };
};

const pickCurrentAssessment = (assessments, stage) =>
  assessments.find(item => item.stage === stage && item.status === 'confirmed') ||
  assessments.find(item => item.stage === stage) ||
  null;

const buildComparison = (assessments) => {
  const baseline = summarizeAssessment(pickCurrentAssessment(assessments, 'baseline'));
  const postAutomation = summarizeAssessment(pickCurrentAssessment(assessments, 'post_automation'));
  if (!baseline) {
    return { baseline: null, postAutomation, savings: null };
  }
  if (!postAutomation) {
    return { baseline, postAutomation: null, savings: null };
  }
  const monthlyHoursSaved = baseline.workHoursPerMonth - postAutomation.workHoursPerMonth;
  const monthlyFteSaved = baseline.fteEquivalent - postAutomation.fteEquivalent;
  const reductionPercent = baseline.workHoursPerMonth > 0
    ? (monthlyHoursSaved / baseline.workHoursPerMonth) * 100
    : 0;
  return {
    baseline,
    postAutomation,
    savings: {
      monthlyHours: round(monthlyHoursSaved),
      annualHours: round(monthlyHoursSaved * 12),
      monthlyFte: round(monthlyFteSaved, 3),
      reductionPercent: round(reductionPercent, 1)
    }
  };
};

const insertItems = async (client, assessmentId, items) => {
  const values = [];
  const placeholders = items.map(item => {
    const offset = values.length;
    values.push(
      assessmentId,
      item.activityName,
      item.roleName,
      item.executionTimeMinutes,
      item.executionsPerPeriod,
      item.periodUnit,
      item.workingDaysPerMonth,
      item.peopleCount,
      item.monthlyHoursPerEmployee,
      item.notes,
      item.sortOrder
    );
    return `(${Array.from({ length: 11 }, (_, index) => `$${offset + index + 1}`).join(', ')})`;
  });
  await client.query(
    `INSERT INTO process_effort_items
      (assessment_id, activity_name, role_name, execution_time_minutes,
       executions_per_period, period_unit, working_days_per_month, people_count, monthly_hours_per_employee,
       notes, sort_order)
     VALUES ${placeholders.join(', ')}`,
    values
  );
};

const auditAndPublish = async ({ req, process, assessmentId, action, stage, status }) => {
  await logAudit({
    companyId: process.companyId,
    userId: req.user.id,
    action,
    resourceType: 'process_effort_assessment',
    resourceId: String(assessmentId),
    metadata: { processId: process.id, stage, status },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
  publishProcessEvent({
    companyId: process.companyId,
    processId: process.id,
    type: action,
    data: { assessmentId, stage, status }
  });
};

router.get('/:processId/effort', authenticateToken, async (req, res) => {
  const processId = Number(req.params.processId);
  const process = await getProcessAccess(processId, req.user);
  if (!process) return res.status(404).json({ error: 'Demanda não encontrada' });
  const assessments = await getAssessments(processId);
  return res.json({
    assessments,
    comparison: buildComparison(assessments),
    permissions: {
      canManage: req.user.role === 'admin' || process.clientCanManageEffort !== false,
      canDeleteConfirmed: req.user.role === 'admin'
    }
  });
});

router.post('/:processId/effort', authenticateToken, async (req, res) => {
  const processId = Number(req.params.processId);
  const process = await getProcessAccess(processId, req.user);
  if (!process) return res.status(404).json({ error: 'Demanda não encontrada' });
  if (req.user.role === 'client' && process.clientCanManageEffort === false) {
    return res.status(403).json({ error: 'O preenchimento de esforço não está liberado para esta demanda' });
  }

  let assessment;
  try {
    assessment = normalizeAssessment(req.body);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const client = await pool.connect();
  let assessmentId;
  try {
    await client.query('BEGIN');
    const created = await client.query(
      `INSERT INTO process_effort_assessments
        (process_id, created_by, updated_by, stage, label, measured_at, source,
         status, notes, confirmed_at)
       VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8,
               CASE WHEN $7 = 'confirmed' THEN NOW() ELSE NULL END)
       RETURNING id`,
      [
        processId,
        req.user.id,
        assessment.stage,
        assessment.label,
        assessment.measuredAt,
        assessment.source,
        assessment.status,
        assessment.notes
      ]
    );
    assessmentId = created.rows[0].id;
    await insertItems(client, assessmentId, assessment.items);
    await client.query(
      `INSERT INTO process_updates
        (process_id, author_user_id, kind, visibility, message, metadata)
       VALUES ($1, $2, 'system', 'client', $3, $4)`,
      [
        processId,
        req.user.id,
        `${assessment.stage === 'baseline' ? 'Linha de base' : 'Medição após a automação'} "${assessment.label}" ${assessment.status === 'confirmed' ? 'confirmada' : 'salva como rascunho'}.`,
        JSON.stringify({ assessmentId, stage: assessment.stage, status: assessment.status })
      ]
    );
    await client.query(
      'UPDATE process_items SET updated_at = NOW(), version = version + 1 WHERE id = $1',
      [processId]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await auditAndPublish({
    req,
    process,
    assessmentId,
    action: 'process.effort.create',
    stage: assessment.stage,
    status: assessment.status
  });
  const assessments = await getAssessments(processId);
  return res.status(201).json({
    assessment: assessments.find(item => Number(item.id) === Number(assessmentId)),
    comparison: buildComparison(assessments)
  });
});

router.patch('/:processId/effort/:assessmentId', authenticateToken, async (req, res) => {
  const processId = Number(req.params.processId);
  const assessmentId = Number(req.params.assessmentId);
  const process = await getProcessAccess(processId, req.user);
  if (!process) return res.status(404).json({ error: 'Demanda não encontrada' });
  if (!Number.isInteger(assessmentId) || assessmentId <= 0) {
    return res.status(400).json({ error: 'Medição inválida' });
  }
  if (req.user.role === 'client' && process.clientCanManageEffort === false) {
    return res.status(403).json({ error: 'O preenchimento de esforço não está liberado para esta demanda' });
  }
  const existingResult = await query(
    `SELECT id, stage, status, version
       FROM process_effort_assessments
      WHERE id = $1 AND process_id = $2`,
    [assessmentId, processId]
  );
  const existing = existingResult.rows[0];
  if (!existing) return res.status(404).json({ error: 'Medição não encontrada' });
  if (existing.status === 'confirmed') {
    return res.status(409).json({
      error: 'Esta medição já foi confirmada. Crie uma nova medição para preservar o histórico.'
    });
  }
  if (req.body.expectedVersion === undefined || Number(req.body.expectedVersion) !== Number(existing.version)) {
    return res.status(409).json({
      error: 'A medição foi atualizada. Reabra o editor para carregar a versão mais recente.'
    });
  }

  let assessment;
  try {
    assessment = normalizeAssessment(req.body, { partial: true });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const changedFields = Object.keys(assessment);
  if (!changedFields.length) return res.status(400).json({ error: 'Nenhuma alteração informada' });

  const fields = [];
  const values = [];
  const add = (column, value) => {
    values.push(value);
    fields.push(`${column} = $${values.length}`);
  };
  if (assessment.stage !== undefined) add('stage', assessment.stage);
  if (assessment.label !== undefined) add('label', assessment.label);
  if (assessment.measuredAt !== undefined) add('measured_at', assessment.measuredAt);
  if (assessment.source !== undefined) add('source', assessment.source);
  if (assessment.status !== undefined) {
    add('status', assessment.status);
    add('confirmed_at', assessment.status === 'confirmed' ? new Date() : null);
  }
  if (assessment.notes !== undefined) add('notes', assessment.notes);
  add('updated_by', req.user.id);
  fields.push('version = version + 1', 'updated_at = NOW()');
  values.push(assessmentId, processId, Number(req.body.expectedVersion));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE process_effort_assessments
          SET ${fields.join(', ')}
        WHERE id = $${values.length - 2}
          AND process_id = $${values.length - 1}
          AND version = $${values.length}`,
      values
    );
    if (!updated.rowCount) {
      const conflict = new Error('A medição foi atualizada por outra pessoa. Reabra o editor e tente novamente.');
      conflict.status = 409;
      throw conflict;
    }
    if (assessment.items !== undefined) {
      await client.query('DELETE FROM process_effort_items WHERE assessment_id = $1', [assessmentId]);
      await insertItems(client, assessmentId, assessment.items);
    }
    const nextStage = assessment.stage || existing.stage;
    const nextStatus = assessment.status || existing.status;
    await client.query(
      `INSERT INTO process_updates
        (process_id, author_user_id, kind, visibility, message, metadata)
       VALUES ($1, $2, 'system', 'client', $3, $4)`,
      [
        processId,
        req.user.id,
        `${nextStage === 'baseline' ? 'Linha de base' : 'Medição após a automação'} atualizada${nextStatus === 'confirmed' ? ' e confirmada' : ''}.`,
        JSON.stringify({ assessmentId, stage: nextStage, status: nextStatus, fields: changedFields })
      ]
    );
    await client.query(
      'UPDATE process_items SET updated_at = NOW(), version = version + 1 WHERE id = $1',
      [processId]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await auditAndPublish({
    req,
    process,
    assessmentId,
    action: 'process.effort.update',
    stage: assessment.stage || existing.stage,
    status: assessment.status || existing.status
  });
  const assessments = await getAssessments(processId);
  return res.json({
    assessment: assessments.find(item => Number(item.id) === assessmentId),
    comparison: buildComparison(assessments)
  });
});

router.delete('/:processId/effort/:assessmentId', authenticateToken, async (req, res) => {
  const processId = Number(req.params.processId);
  const assessmentId = Number(req.params.assessmentId);
  const process = await getProcessAccess(processId, req.user);
  if (!process) return res.status(404).json({ error: 'Demanda não encontrada' });
  const existingResult = await query(
    `SELECT id, stage, status
       FROM process_effort_assessments
      WHERE id = $1 AND process_id = $2`,
    [assessmentId, processId]
  );
  const existing = existingResult.rows[0];
  if (!existing) return res.status(404).json({ error: 'Medição não encontrada' });
  if (req.user.role === 'client' && (
    process.clientCanManageEffort === false || existing.status === 'confirmed'
  )) {
    return res.status(403).json({
      error: existing.status === 'confirmed'
        ? 'Uma medição confirmada não pode ser excluída'
        : 'O preenchimento de esforço não está liberado para esta demanda'
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM process_effort_assessments WHERE id = $1 AND process_id = $2',
      [assessmentId, processId]
    );
    await client.query(
      `INSERT INTO process_updates
        (process_id, author_user_id, kind, visibility, message, metadata)
       VALUES ($1, $2, 'system', 'client', $3, $4)`,
      [
        processId,
        req.user.id,
        `${existing.stage === 'baseline' ? 'Linha de base' : 'Medição após a automação'} removida.`,
        JSON.stringify({ assessmentId, stage: existing.stage, previousStatus: existing.status })
      ]
    );
    await client.query(
      'UPDATE process_items SET updated_at = NOW(), version = version + 1 WHERE id = $1',
      [processId]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await auditAndPublish({
    req,
    process,
    assessmentId,
    action: 'process.effort.delete',
    stage: existing.stage,
    status: existing.status
  });
  return res.json({ success: true });
});

module.exports = router;
module.exports.buildComparison = buildComparison;
module.exports.normalizeAssessment = normalizeAssessment;
