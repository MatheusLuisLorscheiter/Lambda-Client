const express = require('express');
const { authenticateToken } = require('./auth');
const { pool, query } = require('../db');
const { getIntegrationForUser } = require('../services/integrations');
const { logAudit } = require('../audit/logger');

const router = express.Router();
const validStatuses = new Set(['draft', 'published', 'archived']);
const validDirections = new Set(['source_to_target', 'target_to_source', 'bidirectional']);

const requireAdmin = (req, res) => {
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Acesso de administrador obrigatório' });
    return false;
  }
  return true;
};

const normalizeText = (value, label, max, required = false) => {
  const text = String(value || '').trim();
  if (required && !text) throw new Error(`${label} é obrigatório`);
  if (text.length > max) throw new Error(`${label} excede ${max} caracteres`);
  return text || null;
};

const getMappingSet = async (mappingSetId, user, { forUpdate = false } = {}) => {
  const result = await query(
    `SELECT mapping_sets.*, integrations.company_id AS integration_company_id
       FROM integration_mapping_sets mapping_sets
       JOIN integrations ON integrations.id = mapping_sets.integration_id
      WHERE mapping_sets.id = $1
      ${forUpdate ? 'FOR UPDATE' : ''}`,
    [mappingSetId]
  );
  const item = result.rows[0];
  if (!item) return null;
  if (user.role === 'client' &&
    (item.integration_company_id !== user.companyId || item.status !== 'published')) {
    return null;
  }
  return item;
};

const mappingSetSelect = `
  mapping_sets.id,
  mapping_sets.company_id AS "companyId",
  mapping_sets.integration_id AS "integrationId",
  mapping_sets.process_id AS "processId",
  process_items.title AS "processTitle",
  mapping_sets.name,
  mapping_sets.description,
  mapping_sets.source_system AS "sourceSystem",
  mapping_sets.target_system AS "targetSystem",
  mapping_sets.version,
  mapping_sets.status,
  mapping_sets.published_at AS "publishedAt",
  mapping_sets.created_at AS "createdAt",
  mapping_sets.updated_at AS "updatedAt",
  COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'id', entries.id,
          'sourcePath', entries.source_path,
          'sourceType', entries.source_type,
          'targetPath', entries.target_path,
          'targetType', entries.target_type,
          'direction', entries.direction,
          'transformation', entries.transformation,
          'fallbackValue', entries.fallback_value,
          'isRequired', entries.is_required,
          'notes', entries.notes,
          'examples', entries.examples,
          'sortOrder', entries.sort_order,
          'createdAt', entries.created_at,
          'updatedAt', entries.updated_at
        )
        ORDER BY entries.sort_order, entries.id
      )
      FROM integration_mapping_entries entries
      WHERE entries.mapping_set_id = mapping_sets.id
    ),
    '[]'::json
  ) AS entries
`;

router.get('/integrations/:integrationId/mappings', authenticateToken, async (req, res) => {
  const integrationId = Number(req.params.integrationId);
  if (!Number.isInteger(integrationId) || integrationId <= 0) {
    return res.status(400).json({ error: 'Integração inválida' });
  }
  const integration = await getIntegrationForUser(integrationId, req.user);
  if (!integration) return res.status(404).json({ error: 'Integração não encontrada' });

  const conditions = ['mapping_sets.integration_id = $1'];
  const values = [integrationId];
  if (req.user.role === 'client') conditions.push("mapping_sets.status = 'published'");
  if (req.query.status && req.user.role === 'admin') {
    if (!validStatuses.has(req.query.status)) return res.status(400).json({ error: 'Status inválido' });
    values.push(req.query.status);
    conditions.push(`mapping_sets.status = $${values.length}`);
  }
  const result = await query(
    `SELECT ${mappingSetSelect}
       FROM integration_mapping_sets mapping_sets
       LEFT JOIN process_items ON process_items.id = mapping_sets.process_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        CASE mapping_sets.status WHEN 'published' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END,
        mapping_sets.updated_at DESC`,
    values
  );
  res.json({ mappingSets: result.rows });
});

router.post('/integrations/:integrationId/mappings', authenticateToken, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const integrationId = Number(req.params.integrationId);
  const integration = await getIntegrationForUser(integrationId, req.user);
  if (!integration) return res.status(404).json({ error: 'Integração não encontrada' });

  let name;
  let description;
  let sourceSystem;
  let targetSystem;
  try {
    name = normalizeText(req.body.name, 'Nome', 160, true);
    description = normalizeText(req.body.description, 'Descrição', 3000);
    sourceSystem = normalizeText(req.body.sourceSystem, 'Sistema de origem', 160, true);
    targetSystem = normalizeText(req.body.targetSystem, 'Sistema de destino', 160, true);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const processId = req.body.processId ? Number(req.body.processId) : null;
  if (processId) {
    const process = await query(
      'SELECT id FROM process_items WHERE id = $1 AND company_id = $2',
      [processId, integration.company_id]
    );
    if (!process.rowCount) return res.status(400).json({ error: 'Processo relacionado inválido' });
  }

  const result = await query(
    `INSERT INTO integration_mapping_sets
      (company_id, integration_id, process_id, created_by, name, description, source_system, target_system)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      integration.company_id, integrationId, processId, req.user.id,
      name, description, sourceSystem, targetSystem
    ]
  );
  await logAudit({
    companyId: integration.company_id,
    userId: req.user.id,
    action: 'mapping.create',
    resourceType: 'mapping_set',
    resourceId: String(result.rows[0].id),
    metadata: { integrationId, name, sourceSystem, targetSystem },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
  res.status(201).json({ mappingSetId: result.rows[0].id });
});

router.patch('/mappings/:mappingSetId', authenticateToken, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const mappingSetId = Number(req.params.mappingSetId);
  const existing = await getMappingSet(mappingSetId, req.user);
  if (!existing) return res.status(404).json({ error: 'Mapeamento não encontrado' });

  const fields = [];
  const values = [];
  const add = (column, value) => {
    values.push(value);
    fields.push(`${column} = $${values.length}`);
  };
  try {
    if (req.body.name !== undefined) add('name', normalizeText(req.body.name, 'Nome', 160, true));
    if (req.body.description !== undefined) {
      add('description', normalizeText(req.body.description, 'Descrição', 3000));
    }
    if (req.body.sourceSystem !== undefined) {
      add('source_system', normalizeText(req.body.sourceSystem, 'Sistema de origem', 160, true));
    }
    if (req.body.targetSystem !== undefined) {
      add('target_system', normalizeText(req.body.targetSystem, 'Sistema de destino', 160, true));
    }
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  if (req.body.processId !== undefined) {
    const processId = req.body.processId ? Number(req.body.processId) : null;
    if (processId) {
      const process = await query(
        'SELECT id FROM process_items WHERE id = $1 AND company_id = $2',
        [processId, existing.company_id]
      );
      if (!process.rowCount) return res.status(400).json({ error: 'Processo relacionado inválido' });
    }
    add('process_id', processId);
  }
  if (req.body.status !== undefined) {
    if (!validStatuses.has(req.body.status)) return res.status(400).json({ error: 'Status inválido' });
    add('status', req.body.status);
    add('published_at', req.body.status === 'published' ? new Date() : null);
  }
  if (!fields.length) return res.status(400).json({ error: 'Nenhuma alteração informada' });
  if (req.body.status === 'published') {
    await query(
      `UPDATE integration_mapping_sets
          SET status = 'archived', updated_at = NOW()
        WHERE integration_id = $1
          AND name = $2
          AND status = 'published'
          AND id <> $3`,
      [existing.integration_id, existing.name, mappingSetId]
    );
  }
  fields.push('version = version + 1', 'updated_at = NOW()');
  values.push(mappingSetId);
  const result = await query(
    `UPDATE integration_mapping_sets
        SET ${fields.join(', ')}
      WHERE id = $${values.length}
      RETURNING id, version, status, published_at AS "publishedAt", updated_at AS "updatedAt"`,
    values
  );
  res.json({ mappingSet: result.rows[0] });
});

router.post('/mappings/:mappingSetId/entries', authenticateToken, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const mappingSetId = Number(req.params.mappingSetId);
  const mappingSet = await getMappingSet(mappingSetId, req.user);
  if (!mappingSet) return res.status(404).json({ error: 'Mapeamento não encontrado' });
  if (mappingSet.status !== 'draft') {
    return res.status(409).json({ error: 'Crie uma nova versão antes de alterar um mapa publicado' });
  }
  let sourcePath;
  let targetPath;
  try {
    sourcePath = normalizeText(req.body.sourcePath, 'Campo de origem', 500, true);
    targetPath = normalizeText(req.body.targetPath, 'Campo de destino', 500, true);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const direction = validDirections.has(req.body.direction) ? req.body.direction : 'source_to_target';
  const sortResult = await query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS "sortOrder" FROM integration_mapping_entries WHERE mapping_set_id = $1',
    [mappingSetId]
  );
  const examples = req.body.examples && typeof req.body.examples === 'object' && !Array.isArray(req.body.examples)
    ? req.body.examples
    : {};
  const result = await query(
    `INSERT INTO integration_mapping_entries
      (mapping_set_id, source_path, source_type, target_path, target_type, direction,
       transformation, fallback_value, is_required, notes, examples, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id, source_path AS "sourcePath", source_type AS "sourceType",
               target_path AS "targetPath", target_type AS "targetType", direction,
               transformation, fallback_value AS "fallbackValue",
               is_required AS "isRequired", notes, examples, sort_order AS "sortOrder",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [
      mappingSetId, sourcePath, normalizeText(req.body.sourceType, 'Tipo de origem', 80),
      targetPath, normalizeText(req.body.targetType, 'Tipo de destino', 80), direction,
      normalizeText(req.body.transformation, 'Transformação', 5000),
      normalizeText(req.body.fallbackValue, 'Valor padrão', 2000),
      Boolean(req.body.isRequired), normalizeText(req.body.notes, 'Observações', 3000),
      JSON.stringify(examples), Number(sortResult.rows[0].sortOrder)
    ]
  );
  await query(
    'UPDATE integration_mapping_sets SET version = version + 1, status = $1, updated_at = NOW() WHERE id = $2',
    [mappingSet.status === 'published' ? 'draft' : mappingSet.status, mappingSetId]
  );
  res.status(201).json({ entry: result.rows[0] });
});

router.patch('/mappings/:mappingSetId/entries/:entryId', authenticateToken, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const mappingSetId = Number(req.params.mappingSetId);
  const entryId = Number(req.params.entryId);
  const mappingSet = await getMappingSet(mappingSetId, req.user);
  if (!mappingSet) return res.status(404).json({ error: 'Mapeamento não encontrado' });
  if (mappingSet.status !== 'draft') {
    return res.status(409).json({ error: 'Crie uma nova versão antes de alterar um mapa publicado' });
  }
  const allowedFields = {
    sourcePath: ['source_path', 500],
    sourceType: ['source_type', 80],
    targetPath: ['target_path', 500],
    targetType: ['target_type', 80],
    transformation: ['transformation', 5000],
    fallbackValue: ['fallback_value', 2000],
    notes: ['notes', 3000]
  };
  const fields = [];
  const values = [];
  const add = (column, value) => {
    values.push(value);
    fields.push(`${column} = $${values.length}`);
  };
  try {
    for (const [key, [column, max]] of Object.entries(allowedFields)) {
      if (req.body[key] !== undefined) {
        add(column, normalizeText(req.body[key], key, max, ['sourcePath', 'targetPath'].includes(key)));
      }
    }
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  if (req.body.direction !== undefined) {
    if (!validDirections.has(req.body.direction)) return res.status(400).json({ error: 'Direção inválida' });
    add('direction', req.body.direction);
  }
  if (req.body.isRequired !== undefined) add('is_required', Boolean(req.body.isRequired));
  if (req.body.examples !== undefined) {
    if (!req.body.examples || typeof req.body.examples !== 'object' || Array.isArray(req.body.examples)) {
      return res.status(400).json({ error: 'Exemplos inválidos' });
    }
    add('examples', JSON.stringify(req.body.examples));
  }
  if (req.body.sortOrder !== undefined) {
    const sortOrder = Number(req.body.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0) return res.status(400).json({ error: 'Ordem inválida' });
    add('sort_order', sortOrder);
  }
  if (!fields.length) return res.status(400).json({ error: 'Nenhuma alteração informada' });
  fields.push('updated_at = NOW()');
  values.push(entryId, mappingSetId);
  const result = await query(
    `UPDATE integration_mapping_entries
        SET ${fields.join(', ')}
      WHERE id = $${values.length - 1} AND mapping_set_id = $${values.length}
      RETURNING id, source_path AS "sourcePath", source_type AS "sourceType",
                target_path AS "targetPath", target_type AS "targetType", direction,
                transformation, fallback_value AS "fallbackValue",
                is_required AS "isRequired", notes, examples, sort_order AS "sortOrder",
                created_at AS "createdAt", updated_at AS "updatedAt"`,
    values
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Campo não encontrado' });
  await query(
    'UPDATE integration_mapping_sets SET version = version + 1, status = $1, updated_at = NOW() WHERE id = $2',
    [mappingSet.status === 'published' ? 'draft' : mappingSet.status, mappingSetId]
  );
  res.json({ entry: result.rows[0] });
});

router.delete('/mappings/:mappingSetId/entries/:entryId', authenticateToken, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const mappingSetId = Number(req.params.mappingSetId);
  const entryId = Number(req.params.entryId);
  const mappingSet = await getMappingSet(mappingSetId, req.user);
  if (!mappingSet) return res.status(404).json({ error: 'Mapeamento não encontrado' });
  if (mappingSet.status !== 'draft') {
    return res.status(409).json({ error: 'Crie uma nova versão antes de alterar um mapa publicado' });
  }
  const result = await query(
    'DELETE FROM integration_mapping_entries WHERE id = $1 AND mapping_set_id = $2 RETURNING id',
    [entryId, mappingSetId]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Campo não encontrado' });
  await query(
    'UPDATE integration_mapping_sets SET version = version + 1, status = $1, updated_at = NOW() WHERE id = $2',
    [mappingSet.status === 'published' ? 'draft' : mappingSet.status, mappingSetId]
  );
  res.json({ success: true });
});

router.post('/mappings/:mappingSetId/clone', authenticateToken, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const mappingSetId = Number(req.params.mappingSetId);
  const mappingSet = await getMappingSet(mappingSetId, req.user);
  if (!mappingSet) return res.status(404).json({ error: 'Mapeamento não encontrado' });
  const client = await pool.connect();
  let clonedId;
  try {
    await client.query('BEGIN');
    const created = await client.query(
      `INSERT INTO integration_mapping_sets
        (company_id, integration_id, process_id, created_by, name, description,
         source_system, target_system, version, status)
       SELECT company_id, integration_id, process_id, $1, $2, description,
              source_system, target_system, 1, 'draft'
         FROM integration_mapping_sets
        WHERE id = $3
       RETURNING id`,
      [req.user.id, String(req.body.name || mappingSet.name).trim(), mappingSetId]
    );
    clonedId = created.rows[0].id;
    await client.query(
      'UPDATE integration_mapping_sets SET version = $1 WHERE id = $2',
      [Number(mappingSet.version) + 1, clonedId]
    );
    await client.query(
      `INSERT INTO integration_mapping_entries
        (mapping_set_id, source_path, source_type, target_path, target_type, direction,
         transformation, fallback_value, is_required, notes, examples, sort_order)
       SELECT $1, source_path, source_type, target_path, target_type, direction,
              transformation, fallback_value, is_required, notes, examples, sort_order
         FROM integration_mapping_entries
        WHERE mapping_set_id = $2`,
      [clonedId, mappingSetId]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  res.status(201).json({ mappingSetId: clonedId });
});

module.exports = router;
