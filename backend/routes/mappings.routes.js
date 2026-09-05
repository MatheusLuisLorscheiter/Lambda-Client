const express = require('express');
const { authenticateToken } = require('./auth');
const { pool, query } = require('../db');
const { getIntegrationForUser } = require('../services/integrations');
const { logAudit } = require('../audit/logger');
const { buildChangedFields, recordMappingChange } = require('../services/mappingHistory');
const { enqueueGenericWebhookEvent } = require('../services/genericWebhookPublisher');

const router = express.Router();
const validStatuses = new Set(['draft', 'published', 'archived']);
const validDirections = new Set(['source_to_target', 'target_to_source', 'bidirectional']);
const validMappingStatuses = new Set(['mapped', 'pending', 'attention', 'ignored']);
const validClientEditModes = new Set(['none', 'all', 'selected']);
const defaultValidationRules = Object.freeze({
  requireStructuredEntries: false,
  blockUnresolved: false,
  blockDuplicateSources: false,
  requireTypes: false
});
const clientWritableEntryFields = new Set([
  'section', 'sourcePath', 'sourceType', 'targetPath', 'targetType', 'direction',
  'transformation', 'fallbackValue', 'isRequired', 'notes', 'examples', 'mappingStatus'
]);
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const allowedAttachmentExtensions = new Set([
  'md', 'markdown', 'txt', 'pdf', 'csv', 'tsv', 'json', 'html', 'htm', 'xml', 'yaml', 'yml',
  'doc', 'docx', 'odt', 'xls', 'xlsx', 'ods', 'png', 'jpg', 'jpeg', 'webp'
]);
const textAttachmentExtensions = new Set([
  'md', 'markdown', 'txt', 'csv', 'tsv', 'json', 'html', 'htm', 'xml', 'yaml', 'yml'
]);

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

const normalizeClientEditableFields = (value) => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error('Campos editáveis pelo cliente são inválidos');
  const fields = [...new Set(value.map(field => String(field).trim()).filter(Boolean))];
  if (fields.some(field => !clientWritableEntryFields.has(field))) {
    throw new Error('Há campos editáveis pelo cliente que não são permitidos');
  }
  return fields;
};

const normalizeValidationRules = (value) => {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Regras de validação inválidas');
  }
  return Object.fromEntries(Object.keys(defaultValidationRules).map(key => [key, Boolean(value[key])]));
};

const parseClientDocumentFields = markdown => {
  const text = String(markdown || '');
  const pattern = /\{\{campo:([^}\n]+)\}\}/g;
  const textParts = [];
  const fields = [];
  const ids = new Set();
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    let field;
    try {
      field = JSON.parse(decodeURIComponent(match[1] || ''));
    } catch {
      return null;
    }
    if (!field || typeof field !== 'object' || Array.isArray(field) || !field.id || ids.has(String(field.id))) {
      return null;
    }
    ids.add(String(field.id));
    textParts.push(text.slice(cursor, match.index));
    fields.push({
      id: String(field.id),
      type: String(field.type || 'text'),
      label: String(field.label || ''),
      options: Array.isArray(field.options) ? field.options.map(String) : [],
      required: Boolean(field.required),
      value: String(field.value || '')
    });
    cursor = match.index + match[0].length;
  }
  textParts.push(text.slice(cursor));
  return { textParts, fields };
};

const isSelectedDocumentFieldUpdate = (beforeMarkdown, afterMarkdown) => {
  const before = parseClientDocumentFields(beforeMarkdown);
  const after = parseClientDocumentFields(afterMarkdown);
  if (!before || !after || !before.fields.length || before.fields.length !== after.fields.length) return false;
  if (JSON.stringify(before.textParts) !== JSON.stringify(after.textParts)) return false;
  return before.fields.every((field, index) => {
    const next = after.fields[index];
    if (!next) return false;
    const { value: _beforeValue, ...beforeConfig } = field;
    const { value: _afterValue, ...afterConfig } = next;
    return JSON.stringify(beforeConfig) === JSON.stringify(afterConfig);
  });
};

const normalizeEntryInput = (entry, { allowClientEditableFields = false } = {}) => {
  const examples = entry.examples && typeof entry.examples === 'object' && !Array.isArray(entry.examples)
    ? entry.examples
    : {};
  return {
    sourcePath: normalizeText(entry.sourcePath, 'Campo de origem', 500, true),
    sourceType: normalizeText(entry.sourceType, 'Tipo de origem', 80),
    targetPath: normalizeText(entry.targetPath, 'Campo de destino', 500, true),
    targetType: normalizeText(entry.targetType, 'Tipo de destino', 80),
    direction: validDirections.has(entry.direction) ? entry.direction : 'source_to_target',
    transformation: normalizeText(entry.transformation, 'Transformação', 5000),
    fallbackValue: normalizeText(entry.fallbackValue, 'Valor padrão', 2000),
    isRequired: Boolean(entry.isRequired),
    notes: normalizeText(entry.notes, 'Observações', 3000),
    examples,
    section: normalizeText(entry.section, 'Seção', 240),
    mappingStatus: validMappingStatuses.has(entry.mappingStatus) ? entry.mappingStatus : 'mapped',
    clientEditableFields: allowClientEditableFields
      ? (normalizeClientEditableFields(entry.clientEditableFields) || [])
      : []
  };
};

const insertEntries = async (db, mappingSetId, entries, firstSortOrder = 0) => {
  if (!entries.length) return;
  const values = [];
  const placeholders = entries.map((entry, entryIndex) => {
    const offset = values.length;
    values.push(
      mappingSetId,
      entry.sourcePath,
      entry.sourceType,
      entry.targetPath,
      entry.targetType,
      entry.direction,
      entry.transformation,
      entry.fallbackValue,
      entry.isRequired,
      entry.notes,
      JSON.stringify(entry.examples),
      firstSortOrder + entryIndex,
      entry.section,
      entry.mappingStatus,
      JSON.stringify(entry.clientEditableFields || [])
    );
    return `(${Array.from({ length: 15 }, (_, fieldIndex) => `$${offset + fieldIndex + 1}`).join(', ')})`;
  });
  await db.query(
    `INSERT INTO integration_mapping_entries
      (mapping_set_id, source_path, source_type, target_path, target_type, direction,
       transformation, fallback_value, is_required, notes, examples, sort_order, section,
       mapping_status, client_editable_fields)
     VALUES ${placeholders.join(', ')}`,
    values
  );
};

const canClientEditEntryField = (mappingSet, entry, field) => {
  if (mappingSet.client_edit_mode === 'all') return clientWritableEntryFields.has(field);
  if (mappingSet.client_edit_mode !== 'selected') return false;
  return Array.isArray(entry.client_editable_fields) && entry.client_editable_fields.includes(field);
};

const expectedRevisionFrom = (body) => {
  const raw = body.expectedRevision ?? body.expectedVersion;
  if (raw === undefined) return null;
  const revision = Number(raw);
  return Number.isInteger(revision) && revision > 0 ? revision : NaN;
};

const mappingSetSnapshot = (item) => ({
  name: item.name,
  description: item.description ?? null,
  contentMarkdown: item.content_markdown ?? item.contentMarkdown ?? null,
  sourceSystem: item.source_system ?? item.sourceSystem,
  targetSystem: item.target_system ?? item.targetSystem,
  processId: item.process_id ?? item.processId ?? null,
  status: item.status,
  clientEditMode: item.client_edit_mode ?? item.clientEditMode,
  clientCanAddEntries: item.client_can_add_entries ?? item.clientCanAddEntries ?? false,
  clientCanDeleteEntries: item.client_can_delete_entries ?? item.clientCanDeleteEntries ?? false,
  clientInstructions: item.client_instructions ?? item.clientInstructions ?? null,
  validationRules: item.validation_rules ?? item.validationRules ?? defaultValidationRules
});

const entrySnapshot = (item) => item ? ({
  id: item.id,
  section: item.section ?? null,
  sourcePath: item.source_path ?? item.sourcePath,
  sourceType: item.source_type ?? item.sourceType ?? null,
  targetPath: item.target_path ?? item.targetPath,
  targetType: item.target_type ?? item.targetType ?? null,
  direction: item.direction,
  transformation: item.transformation ?? null,
  fallbackValue: item.fallback_value ?? item.fallbackValue ?? null,
  isRequired: item.is_required ?? item.isRequired ?? false,
  notes: item.notes ?? null,
  examples: item.examples || {},
  mappingStatus: item.mapping_status ?? item.mappingStatus,
  clientEditableFields: item.client_editable_fields ?? item.clientEditableFields ?? [],
  sortOrder: item.sort_order ?? item.sortOrder ?? 0
}) : null;

const getFileExtension = (fileName) => {
  const parts = String(fileName || '').toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
};

const normalizeAttachment = (body) => {
  const fileName = normalizeText(body.fileName, 'Nome do arquivo', 255, true);
  const mimeType = normalizeText(body.mimeType || 'application/octet-stream', 'Tipo do arquivo', 160, true);
  const extension = getFileExtension(fileName);
  if (!allowedAttachmentExtensions.has(extension)) {
    throw new Error('Formato não suportado. Use documentos, planilhas, imagens, PDF, MD, TXT, CSV, JSON, HTML, XML ou YAML');
  }
  const encoded = String(body.contentBase64 || '').replace(/^data:[^;]+;base64,/, '');
  if (!encoded || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new Error('Conteúdo do arquivo inválido');
  }
  const fileData = Buffer.from(encoded, 'base64');
  if (!fileData.length) throw new Error('O arquivo está vazio');
  if (fileData.length > MAX_ATTACHMENT_BYTES) throw new Error('O arquivo deve ter no máximo 10 MB');
  const extractedText = textAttachmentExtensions.has(extension)
    ? fileData.toString('utf8').replace(/^\uFEFF/, '').slice(0, 250_000)
    : null;
  return { fileName, mimeType, fileData, extractedText };
};

const attachmentSelect = `
  COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'id', attachments.id,
          'fileName', attachments.file_name,
          'mimeType', attachments.mime_type,
          'fileSize', attachments.file_size,
          'hasExtractedText', attachments.extracted_text IS NOT NULL,
          'uploadedByEmail', (
            SELECT users.email FROM users WHERE users.id = attachments.uploaded_by
          ),
          'createdAt', attachments.created_at
        )
        ORDER BY attachments.created_at, attachments.id
      )
      FROM integration_mapping_attachments attachments
      WHERE attachments.mapping_set_id = mapping_sets.id
    ),
    '[]'::json
  ) AS attachments
`;

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
  mapping_sets.content_markdown AS "contentMarkdown",
  mapping_sets.source_system AS "sourceSystem",
  mapping_sets.target_system AS "targetSystem",
  mapping_sets.version,
  mapping_sets.revision,
  mapping_sets.status,
  mapping_sets.client_edit_mode AS "clientEditMode",
  mapping_sets.client_can_add_entries AS "clientCanAddEntries",
  mapping_sets.client_can_delete_entries AS "clientCanDeleteEntries",
  mapping_sets.client_instructions AS "clientInstructions",
  mapping_sets.validation_rules AS "validationRules",
  mapping_sets.approval_status AS "approvalStatus",
  mapping_sets.approval_revision AS "approvalRevision",
  mapping_sets.approval_requested_at AS "approvalRequestedAt",
  mapping_sets.approved_at AS "approvedAt",
  mapping_sets.approval_note AS "approvalNote",
  mapping_sets.last_client_edited_at AS "lastClientEditedAt",
  (
    SELECT users.email FROM users WHERE users.id = mapping_sets.last_client_edited_by
  ) AS "lastClientEditedByEmail",
  mapping_sets.last_reviewed_at AS "lastReviewedAt",
  (
    SELECT users.email FROM users WHERE users.id = mapping_sets.last_reviewed_by
  ) AS "lastReviewedByEmail",
  (
    mapping_sets.last_client_edited_at IS NOT NULL
    AND (
      mapping_sets.last_reviewed_at IS NULL
      OR mapping_sets.last_client_edited_at > mapping_sets.last_reviewed_at
    )
  ) AS "hasUnreviewedClientChanges",
  mapping_sets.cloned_from_mapping_set_id AS "clonedFromMappingSetId",
  mapping_sets.published_at AS "publishedAt",
  mapping_sets.closed_at AS "closedAt",
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
          'section', entries.section,
          'mappingStatus', entries.mapping_status,
          'clientEditableFields', entries.client_editable_fields,
          'lastClientEditedAt', entries.last_client_edited_at,
          'lastClientEditedByEmail', (
            SELECT users.email FROM users WHERE users.id = entries.last_client_edited_by
          ),
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
  ) AS entries,
  ${attachmentSelect}
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
  let contentMarkdown;
  let sourceSystem;
  let targetSystem;
  let clientInstructions;
  try {
    name = normalizeText(req.body.name, 'Nome', 160, true);
    description = normalizeText(req.body.description, 'Descrição', 3000);
    contentMarkdown = normalizeText(req.body.contentMarkdown, 'Conteúdo do documento', 250000);
    sourceSystem = normalizeText(req.body.sourceSystem, 'Sistema de origem', 160, true);
    targetSystem = normalizeText(req.body.targetSystem, 'Sistema de destino', 160, true);
    clientInstructions = normalizeText(req.body.clientInstructions, 'Orientações ao cliente', 5000);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const clientEditMode = validClientEditModes.has(req.body.clientEditMode)
    ? req.body.clientEditMode
    : 'none';
  const clientCanAddEntries = clientEditMode === 'all' && Boolean(req.body.clientCanAddEntries);
  const clientCanDeleteEntries = clientEditMode === 'all' && Boolean(req.body.clientCanDeleteEntries);
  let validationRules = defaultValidationRules;
  let initialEntries = [];
  let initialAttachment = null;
  try {
    validationRules = normalizeValidationRules(req.body.validationRules) || defaultValidationRules;
    if (req.body.entries !== undefined) {
      if (!Array.isArray(req.body.entries) || req.body.entries.length > 500) {
        throw new Error('A importação aceita até 500 vínculos');
      }
      initialEntries = req.body.entries.map((entry) => normalizeEntryInput(entry, {
        allowClientEditableFields: true
      }));
    }
    if (req.body.attachment) initialAttachment = normalizeAttachment(req.body.attachment);
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
  const duplicateName = await query(
    'SELECT id FROM integration_mapping_sets WHERE integration_id = $1 AND name = $2 LIMIT 1',
    [integrationId, name]
  );
  if (duplicateName.rowCount) {
    return res.status(409).json({
      error: 'Já existe um de-para com este nome. Abra-o e use “Criar nova versão”.'
    });
  }

  const client = await pool.connect();
  let created;
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO integration_mapping_sets
        (company_id, integration_id, process_id, created_by, name, description, content_markdown,
         source_system, target_system, client_edit_mode, client_can_add_entries,
         client_can_delete_entries, client_instructions, validation_rules)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *, id`,
      [
        integration.company_id, integrationId, processId, req.user.id,
        name, description, contentMarkdown, sourceSystem, targetSystem, clientEditMode,
        clientCanAddEntries, clientCanDeleteEntries, clientInstructions, JSON.stringify(validationRules)
      ]
    );
    created = result.rows[0];
    await insertEntries(client, created.id, initialEntries);
    if (initialAttachment) {
      await client.query(
        `INSERT INTO integration_mapping_attachments
          (mapping_set_id, uploaded_by, file_name, mime_type, file_size, file_data, extracted_text)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          created.id, req.user.id, initialAttachment.fileName, initialAttachment.mimeType,
          initialAttachment.fileData.length, initialAttachment.fileData, initialAttachment.extractedText
        ]
      );
    }
    await recordMappingChange({
      db: client,
      mappingSetId: created.id,
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'create',
      entityType: 'mapping_set',
      entityId: created.id,
      summary: initialAttachment || initialEntries.length
        ? `Mapeamento criado com ${initialEntries.length} vínculo(s) importado(s)`
        : 'Mapeamento criado',
      afterData: {
        ...mappingSetSnapshot(created),
        importedEntries: initialEntries,
        attachment: initialAttachment
          ? {
              fileName: initialAttachment.fileName,
              mimeType: initialAttachment.mimeType,
              fileSize: initialAttachment.fileData.length
            }
          : null
      },
      changedFields: [
        { field: 'name', before: null, after: name },
        { field: 'sourceSystem', before: null, after: sourceSystem },
        { field: 'targetSystem', before: null, after: targetSystem },
        ...(initialEntries.length
          ? [{ field: 'entries', before: 0, after: initialEntries.length }]
          : []),
        ...(initialAttachment
          ? [{ field: 'attachments', before: null, after: initialAttachment.fileName }]
          : [])
      ],
      mappingRevision: created.revision,
      clientVisible: false
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logAudit({
    companyId: integration.company_id,
    userId: req.user.id,
    action: 'mapping.create',
    resourceType: 'mapping_set',
    resourceId: String(created.id),
    metadata: {
      integrationId, name, sourceSystem, targetSystem, clientEditMode,
      importedEntries: initialEntries.length,
      importedAttachment: Boolean(initialAttachment)
    },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
  res.status(201).json({ mappingSetId: created.id, revision: created.revision });
});

router.patch('/mappings/:mappingSetId', authenticateToken, async (req, res) => {
  const mappingSetId = Number(req.params.mappingSetId);
  if (!Number.isInteger(mappingSetId) || mappingSetId <= 0) {
    return res.status(400).json({ error: 'Mapeamento inválido' });
  }
  const existing = await getMappingSet(mappingSetId, req.user);
  if (!existing) return res.status(404).json({ error: 'Mapeamento não encontrado' });

  if (req.user.role === 'client') {
    const requestedFields = Object.keys(req.body).filter(key => !['expectedVersion', 'expectedRevision'].includes(key));
    if (!['all', 'selected'].includes(existing.client_edit_mode) || existing.status !== 'published' ||
      requestedFields.length !== 1 || requestedFields[0] !== 'contentMarkdown') {
      return res.status(403).json({ error: 'Este documento não está liberado para edição' });
    }
    const expectedRevision = expectedRevisionFrom(req.body);
    if (!Number.isInteger(expectedRevision) || expectedRevision !== Number(existing.revision)) {
      return res.status(409).json({ error: 'O de-para foi atualizado. Reabra o editor para carregar a versão mais recente.' });
    }
    let contentMarkdown;
    try {
      contentMarkdown = normalizeText(req.body.contentMarkdown, 'Conteúdo do documento', 250000);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    if (existing.client_edit_mode === 'selected' &&
        !isSelectedDocumentFieldUpdate(existing.content_markdown, contentMarkdown)) {
      return res.status(403).json({ error: 'Somente os campos marcados pela equipe podem ser alterados' });
    }
    const client = await pool.connect();
    let updated;
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE integration_mapping_sets
          SET content_markdown = $1,
              revision = revision + 1,
              approval_status = 'not_requested',
              approval_revision = NULL,
              approval_requested_at = NULL,
              approved_at = NULL,
              approved_by = NULL,
              approval_note = NULL,
              last_client_edited_by = $2,
                last_client_edited_at = NOW(),
                updated_at = NOW()
          WHERE id = $3 AND revision = $4
          RETURNING id, version, revision, status, updated_at AS "updatedAt",
                    last_client_edited_at AS "lastClientEditedAt"`,
        [contentMarkdown, req.user.id, mappingSetId, expectedRevision]
      );
      if (!result.rowCount) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'O de-para mudou enquanto você editava. Recarregue antes de salvar novamente.' });
      }
      updated = result.rows[0];
      await recordMappingChange({
        db: client,
        mappingSetId,
        actorUserId: req.user.id,
        actorRole: req.user.role,
        action: 'update',
        entityType: 'mapping_set',
        entityId: mappingSetId,
        summary: 'Cliente atualizou o documento',
        beforeData: { contentMarkdown: existing.content_markdown ?? null },
        afterData: { contentMarkdown },
        mappingRevision: updated.revision
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await logAudit({
      companyId: existing.company_id,
      userId: req.user.id,
      action: 'mapping.client.document.update',
      resourceType: 'mapping_set',
      resourceId: String(mappingSetId),
      metadata: { contentLength: contentMarkdown?.length || 0 },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    return res.json({ mappingSet: updated });
  }

  if (!requireAdmin(req, res)) return;

  const fields = [];
  const values = [];
  let effectiveValidationRules = existing.validation_rules || defaultValidationRules;
  const add = (column, value) => {
    values.push(value);
    fields.push(`${column} = $${values.length}`);
  };
  try {
    if (req.body.name !== undefined) add('name', normalizeText(req.body.name, 'Nome', 160, true));
    if (req.body.description !== undefined) {
      add('description', normalizeText(req.body.description, 'Descrição', 3000));
    }
    if (req.body.contentMarkdown !== undefined) {
      add('content_markdown', normalizeText(req.body.contentMarkdown, 'Conteúdo do documento', 250000));
    }
    if (req.body.sourceSystem !== undefined) {
      add('source_system', normalizeText(req.body.sourceSystem, 'Sistema de origem', 160, true));
    }
    if (req.body.targetSystem !== undefined) {
      add('target_system', normalizeText(req.body.targetSystem, 'Sistema de destino', 160, true));
    }
    if (req.body.clientInstructions !== undefined) {
      add('client_instructions', normalizeText(req.body.clientInstructions, 'Orientações ao cliente', 5000));
    }
    if (req.body.validationRules !== undefined) {
      effectiveValidationRules = normalizeValidationRules(req.body.validationRules);
      add('validation_rules', JSON.stringify(effectiveValidationRules));
    }
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const effectiveClientEditMode = req.body.clientEditMode ?? existing.client_edit_mode;
  const effectiveName = req.body.name !== undefined ? String(req.body.name).trim() : existing.name;
  if (!validClientEditModes.has(effectiveClientEditMode)) {
    return res.status(400).json({ error: 'Modo de edição do cliente inválido' });
  }
  if (req.body.clientEditMode !== undefined) add('client_edit_mode', effectiveClientEditMode);
  if (req.body.clientCanAddEntries !== undefined || req.body.clientEditMode !== undefined) {
    add(
      'client_can_add_entries',
      effectiveClientEditMode === 'all' && Boolean(req.body.clientCanAddEntries ?? existing.client_can_add_entries)
    );
  }
  if (req.body.clientCanDeleteEntries !== undefined || req.body.clientEditMode !== undefined) {
    add(
      'client_can_delete_entries',
      effectiveClientEditMode === 'all' && Boolean(req.body.clientCanDeleteEntries ?? existing.client_can_delete_entries)
    );
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
  const expectedRevision = expectedRevisionFrom(req.body);
  if (Number.isNaN(expectedRevision)) {
    return res.status(400).json({ error: 'Revisão esperada inválida' });
  }
  if (expectedRevision !== null && expectedRevision !== Number(existing.revision)) {
    return res.status(409).json({ error: 'O mapeamento foi atualizado por outra pessoa. Recarregue antes de salvar.' });
  }
  if (req.body.status !== undefined) {
    if (!validStatuses.has(req.body.status)) return res.status(400).json({ error: 'Status inválido' });
    if (req.body.status === 'published' && !existing.content_markdown) {
      const contentCheck = await query(
        `SELECT
           EXISTS(SELECT 1 FROM integration_mapping_entries WHERE mapping_set_id = $1) OR
           EXISTS(SELECT 1 FROM integration_mapping_attachments WHERE mapping_set_id = $1) AS has_content`,
        [mappingSetId]
      );
      if (!contentCheck.rows[0]?.has_content) {
        return res.status(409).json({ error: 'Adicione conteúdo, vínculos ou arquivos antes de publicar' });
      }
    }
    if (req.body.status === 'published') {
      if (!Number.isInteger(expectedRevision)) {
        return res.status(409).json({ error: 'Informe a revisão exata aprovada antes de publicar.' });
      }
      if (existing.approval_status !== 'approved' ||
          Number(existing.approval_revision) !== expectedRevision ||
          !existing.approved_by) {
        return res.status(409).json({
          error: 'Esta revisão ainda não possui aprovação humana explícita. Solicite e conclua a aprovação antes de publicar.'
        });
      }
      const qualityResult = await query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE mapping_status IN ('pending', 'attention'))::int AS unresolved,
           COUNT(*) FILTER (
             WHERE NULLIF(source_type, '') IS NULL OR NULLIF(target_type, '') IS NULL
           )::int AS missing_types,
           (
             SELECT COUNT(*)::int
               FROM (
                 SELECT section, LOWER(source_path)
                   FROM integration_mapping_entries
                  WHERE mapping_set_id = $1 AND mapping_status <> 'ignored'
                  GROUP BY section, LOWER(source_path)
                 HAVING COUNT(*) > 1
               ) duplicate_groups
           ) AS duplicate_sources
         FROM integration_mapping_entries
        WHERE mapping_set_id = $1`,
        [mappingSetId]
      );
      const quality = qualityResult.rows[0];
      const issues = [];
      if (effectiveValidationRules.requireStructuredEntries && !quality.total) {
        issues.push('adicione ao menos um vínculo estruturado');
      }
      if (effectiveValidationRules.blockUnresolved && quality.unresolved) {
        issues.push(`resolva ${quality.unresolved} pendência(s)`);
      }
      if (effectiveValidationRules.blockDuplicateSources && quality.duplicate_sources) {
        issues.push(`revise ${quality.duplicate_sources} origem(ns) duplicada(s)`);
      }
      if (effectiveValidationRules.requireTypes && quality.missing_types) {
        issues.push(`informe os tipos de ${quality.missing_types} vínculo(s)`);
      }
      if (issues.length) {
        return res.status(409).json({
          error: `A política de publicação exige que você ${issues.join('; ')}.`
        });
      }
    }
    add('status', req.body.status);
    if (req.body.status === 'published') {
      add('published_at', new Date());
      add('closed_at', effectiveClientEditMode === 'none' ? new Date() : null);
    } else if (req.body.status === 'archived') {
      add('closed_at', new Date());
    } else {
      add('published_at', null);
      add('closed_at', null);
    }
  }
  if (!fields.length) return res.status(400).json({ error: 'Nenhuma alteração informada' });
  if (req.body.status !== 'published') {
    fields.push(
      "approval_status = 'not_requested'",
      'approval_revision = NULL',
      'approval_requested_at = NULL',
      'approved_at = NULL',
      'approved_by = NULL',
      'approval_note = NULL'
    );
  }
  fields.push('revision = revision + 1', 'updated_at = NOW()');
  values.push(mappingSetId);
  const mappingSetIdPosition = values.length;
  let revisionCondition = '';
  if (expectedRevision !== null) {
    values.push(expectedRevision);
    revisionCondition = ` AND revision = $${values.length}`;
  }
  const client = await pool.connect();
  let result;
  try {
    await client.query('BEGIN');
    if (req.body.status === 'published') {
      const archivedResult = await client.query(
        `UPDATE integration_mapping_sets
            SET status = 'archived', closed_at = NOW(), revision = revision + 1, updated_at = NOW()
          WHERE integration_id = $1
            AND name = $2
            AND status = 'published'
            AND id <> $3
          RETURNING id, revision`,
        [existing.integration_id, effectiveName, mappingSetId]
      );
      for (const archived of archivedResult.rows || []) {
        await recordMappingChange({
          db: client,
          mappingSetId: archived.id,
          actorUserId: req.user.id,
          actorRole: req.user.role,
          action: 'archive',
          entityType: 'mapping_set',
          entityId: archived.id,
          summary: 'Versão substituída por uma publicação mais recente',
          beforeData: { status: 'published' },
          afterData: { status: 'archived' },
          mappingRevision: archived.revision,
          clientVisible: true
        });
      }
    }
    result = await client.query(
      `UPDATE integration_mapping_sets
          SET ${fields.join(', ')}
        WHERE id = $${mappingSetIdPosition}${revisionCondition}
        RETURNING *`,
      values
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'O mapeamento mudou enquanto você editava. Recarregue e tente novamente.' });
    }
    const action = req.body.status === 'published'
      ? 'publish'
      : req.body.status === 'archived'
        ? 'archive'
        : 'update';
    await recordMappingChange({
      db: client,
      mappingSetId,
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action,
      entityType: 'mapping_set',
      entityId: mappingSetId,
      summary: action === 'publish'
        ? 'Versão publicada para o cliente'
        : action === 'archive'
          ? 'Mapeamento arquivado'
          : 'Configurações do mapeamento atualizadas',
      beforeData: mappingSetSnapshot(existing),
      afterData: mappingSetSnapshot(result.rows[0]),
      mappingRevision: result.rows[0].revision,
      clientVisible: action !== 'update' || req.body.contentMarkdown !== undefined
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logAudit({
    companyId: existing.company_id,
    userId: req.user.id,
    action: req.body.status === 'archived' ? 'mapping.archive' : 'mapping.update',
    resourceType: 'mapping_set',
    resourceId: String(mappingSetId),
    metadata: { fields: Object.keys(req.body), status: req.body.status || existing.status },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
  res.json({
    mappingSet: {
      id: result.rows[0].id,
      version: result.rows[0].version,
      revision: result.rows[0].revision,
      status: result.rows[0].status,
      publishedAt: result.rows[0].published_at,
      updatedAt: result.rows[0].updated_at
    }
  });
});

router.get('/mappings/:mappingSetId/history', authenticateToken, async (req, res) => {
  const mappingSetId = Number(req.params.mappingSetId);
  if (!Number.isInteger(mappingSetId) || mappingSetId <= 0) {
    return res.status(400).json({ error: 'Mapeamento inválido' });
  }
  const mappingSet = await getMappingSet(mappingSetId, req.user);
  if (!mappingSet) return res.status(404).json({ error: 'Mapeamento não encontrado' });

  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const values = [mappingSetId];
  const conditions = ['changes.mapping_set_id = $1'];
  if (req.user.role === 'client') conditions.push('changes.client_visible = TRUE');
  if (req.query.actorRole) {
    if (!['admin', 'client', 'system'].includes(req.query.actorRole)) {
      return res.status(400).json({ error: 'Filtro de autor inválido' });
    }
    values.push(req.query.actorRole);
    conditions.push(`changes.actor_role = $${values.length}`);
  }
  if (req.query.entityType) {
    if (!['mapping_set', 'mapping_entry', 'attachment', 'comment'].includes(req.query.entityType)) {
      return res.status(400).json({ error: 'Filtro de item inválido' });
    }
    values.push(req.query.entityType);
    conditions.push(`changes.entity_type = $${values.length}`);
  }
  const search = String(req.query.search || '').trim().slice(0, 120);
  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(
      changes.summary ILIKE $${values.length}
      OR COALESCE(users.email, '') ILIKE $${values.length}
      OR changes.changed_fields::text ILIKE $${values.length}
    )`);
  }

  const result = await query(
    `SELECT changes.id,
            changes.actor_user_id AS "actorUserId",
            users.email AS "actorEmail",
            changes.actor_role AS "actorRole",
            changes.action,
            changes.entity_type AS "entityType",
            changes.entity_id AS "entityId",
            changes.summary,
            changes.changed_fields AS "changedFields",
            (
              changes.before_data IS NOT NULL
              OR (changes.entity_type = 'mapping_entry' AND changes.action = 'create')
            ) AS "canRestore",
            changes.mapping_revision AS "mappingRevision",
            changes.created_at AS "createdAt",
            COUNT(*) OVER()::int AS "totalCount"
       FROM integration_mapping_changes changes
       LEFT JOIN users ON users.id = changes.actor_user_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY changes.created_at DESC, changes.id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    values
  );
  const total = result.rows[0]?.totalCount || 0;
  res.json({
    changes: result.rows.map(({ totalCount: _totalCount, ...change }) => change),
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + result.rows.length < total
    }
  });
});

router.post('/mappings/:mappingSetId/comments', authenticateToken, async (req, res) => {
  const mappingSetId = Number(req.params.mappingSetId);
  const mappingSet = await getMappingSet(mappingSetId, req.user);
  if (!mappingSet) return res.status(404).json({ error: 'Mapeamento não encontrado' });
  let message;
  try {
    message = normalizeText(req.body.message, 'Comentário', 2000, true);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const change = await recordMappingChange({
    db: { query },
    mappingSetId,
    actorUserId: req.user.id,
    actorRole: req.user.role,
    action: 'comment',
    entityType: 'comment',
    summary: message,
    afterData: { message },
    changedFields: [],
    mappingRevision: mappingSet.revision,
    clientVisible: true
  });
  res.status(201).json({
    comment: {
      ...change,
      actorUserId: req.user.id,
      actorRole: req.user.role,
      actorEmail: req.user.email || null,
      action: 'comment',
      entityType: 'comment',
      summary: message,
      changedFields: [],
      mappingRevision: mappingSet.revision
    }
  });
});

router.post('/mappings/:mappingSetId/approval/request', authenticateToken, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const mappingSetId = Number(req.params.mappingSetId);
  const mappingSet = await getMappingSet(mappingSetId, req.user);
  if (!mappingSet) return res.status(404).json({ error: 'Mapeamento não encontrado' });
  const expectedRevision = expectedRevisionFrom(req.body);
  if (!Number.isInteger(expectedRevision) || expectedRevision !== Number(mappingSet.revision)) {
    return res.status(409).json({ error: 'O mapeamento mudou. Recarregue antes de solicitar aprovação.' });
  }
  if (mappingSet.status !== 'draft' || mappingSet.approval_status === 'pending') {
    return res.status(409).json({ error: 'Este mapeamento não pode ser submetido neste estado.' });
  }
  const content = await query(
    `SELECT NULLIF(BTRIM(content_markdown), '') IS NOT NULL
            OR EXISTS(SELECT 1 FROM integration_mapping_entries WHERE mapping_set_id = $1)
            OR EXISTS(SELECT 1 FROM integration_mapping_attachments WHERE mapping_set_id = $1) AS has_content
       FROM integration_mapping_sets WHERE id = $1`,
    [mappingSetId]
  );
  if (!content.rows[0]?.has_content) {
    return res.status(409).json({ error: 'Adicione conteúdo, vínculos ou arquivos antes de solicitar aprovação.' });
  }
  let note = null;
  try {
    note = normalizeText(req.body.note, 'Observação da solicitação', 2000);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const client = await pool.connect();
  let reviewRequest;
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE integration_mapping_sets
          SET approval_status = 'pending',
              approval_revision = revision + 1,
              approval_requested_at = NOW(),
              approved_at = NULL,
              approved_by = NULL,
              approval_note = $1,
              revision = revision + 1,
              updated_at = NOW()
        WHERE id = $2 AND revision = $3 AND status = 'draft' AND approval_status <> 'pending'
        RETURNING id, revision, approval_status AS "approvalStatus",
                  approval_revision AS "approvalRevision",
                  approval_requested_at AS "approvalRequestedAt", approval_note AS "approvalNote"`,
      [note, mappingSetId, expectedRevision]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'O mapeamento mudou durante a solicitação.' });
    }
    reviewRequest = result.rows[0];
    await recordMappingChange({
      db: client,
      mappingSetId,
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'review_request',
      entityType: 'mapping_set',
      entityId: mappingSetId,
      summary: note ? `Aprovação solicitada: ${note}` : 'Aprovação solicitada',
      beforeData: { approvalStatus: mappingSet.approval_status, revision: expectedRevision },
      afterData: reviewRequest,
      mappingRevision: reviewRequest.revision,
      clientVisible: true
    });
    await enqueueGenericWebhookEvent({
      db: client,
      companyId: mappingSet.company_id,
      eventId: `mapping-review-request:${mappingSetId}:${reviewRequest.revision}`,
      type: 'mapping.review.requested',
      subject: { type: 'mapping-set', id: String(mappingSetId), externalReference: `lambda-pulse:mapping-set:${mappingSetId}` },
      data: { mappingSetId, previousRevision: expectedRevision, revision: reviewRequest.revision },
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  await logAudit({
    companyId: mappingSet.company_id,
    userId: req.user.id,
    action: 'mapping.approval.request',
    resourceType: 'mapping_set',
    resourceId: String(mappingSetId),
    metadata: { previousRevision: expectedRevision, revision: reviewRequest.revision, note },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
  res.json({ reviewRequest });
});

router.post('/mappings/:mappingSetId/approval', authenticateToken, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const mappingSetId = Number(req.params.mappingSetId);
  const mappingSet = await getMappingSet(mappingSetId, req.user);
  if (!mappingSet) return res.status(404).json({ error: 'Mapeamento não encontrado' });
  const expectedRevision = expectedRevisionFrom(req.body);
  if (!Number.isInteger(expectedRevision) || expectedRevision !== Number(mappingSet.revision)) {
    return res.status(409).json({ error: 'A revisão submetida mudou. Recarregue antes de decidir.' });
  }
  if (mappingSet.status !== 'draft' || mappingSet.approval_status !== 'pending' ||
      Number(mappingSet.approval_revision) !== expectedRevision) {
    return res.status(409).json({ error: 'Esta revisão não está aguardando aprovação.' });
  }
  const decision = String(req.body.decision || '').trim().toLowerCase();
  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: 'A decisão deve ser approved ou rejected.' });
  }
  let note = null;
  try {
    note = normalizeText(req.body.note, 'Observação da aprovação', 2000);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  if (decision === 'rejected' && !note) {
    return res.status(400).json({ error: 'Informe o ajuste necessário ao rejeitar uma revisão.' });
  }

  const client = await pool.connect();
  let approval;
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE integration_mapping_sets
          SET approval_status = $1,
              approved_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE NULL END,
              approved_by = CASE WHEN $1 = 'approved' THEN $2::INTEGER ELSE NULL END,
              approval_note = $3,
              updated_at = NOW()
        WHERE id = $4
          AND revision = $5
          AND status = 'draft'
          AND approval_status = 'pending'
          AND approval_revision = $5
        RETURNING id, revision, approval_status AS "approvalStatus",
                  approval_revision AS "approvalRevision", approved_at AS "approvedAt",
                  approved_by AS "approvedBy", approval_note AS "approvalNote", updated_at AS "updatedAt"`,
      [decision, req.user.id, note, mappingSetId, expectedRevision]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'A revisão mudou durante a aprovação.' });
    }
    approval = result.rows[0];
    await recordMappingChange({
      db: client,
      mappingSetId,
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'review',
      entityType: 'mapping_set',
      entityId: mappingSetId,
      summary: decision === 'approved'
        ? 'Revisão aprovada para publicação'
        : `Revisão rejeitada: ${note}`,
      beforeData: { approvalStatus: mappingSet.approval_status, approvalRevision: mappingSet.approval_revision },
      afterData: approval,
      mappingRevision: expectedRevision,
      clientVisible: true
    });
    await enqueueGenericWebhookEvent({
      db: client,
      companyId: mappingSet.company_id,
      eventId: `mapping-approval:${mappingSetId}:${expectedRevision}:${decision}`,
      type: decision === 'approved' ? 'mapping.review.approved' : 'mapping.review.rejected',
      subject: { type: 'mapping-set', id: String(mappingSetId), externalReference: `lambda-pulse:mapping-set:${mappingSetId}` },
      data: { mappingSetId, revision: expectedRevision, decision, approvedBy: approval.approvedBy },
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  await logAudit({
    companyId: mappingSet.company_id,
    userId: req.user.id,
    action: decision === 'approved' ? 'mapping.approval.approve' : 'mapping.approval.reject',
    resourceType: 'mapping_set',
    resourceId: String(mappingSetId),
    metadata: { revision: expectedRevision, note },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
  res.json({ approval });
});

router.post('/mappings/:mappingSetId/review', authenticateToken, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const mappingSetId = Number(req.params.mappingSetId);
  const mappingSet = await getMappingSet(mappingSetId, req.user);
  if (!mappingSet) return res.status(404).json({ error: 'Mapeamento não encontrado' });
  if (!mappingSet.last_client_edited_at ||
      (mappingSet.last_reviewed_at &&
       new Date(mappingSet.last_reviewed_at) >= new Date(mappingSet.last_client_edited_at))) {
    return res.status(409).json({ error: 'Não há alterações do cliente aguardando revisão' });
  }
  const expectedRevision = expectedRevisionFrom(req.body);
  if (!Number.isInteger(expectedRevision) || expectedRevision !== Number(mappingSet.revision)) {
    return res.status(409).json({ error: 'O mapeamento mudou. Recarregue antes de concluir a revisão.' });
  }
  let note = null;
  try {
    note = normalizeText(req.body.note, 'Observação da revisão', 2000);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const client = await pool.connect();
  let reviewed;
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE integration_mapping_sets
          SET last_reviewed_by = $1,
              last_reviewed_at = NOW(),
              revision = revision + 1,
              updated_at = NOW()
        WHERE id = $2 AND revision = $3
        RETURNING revision, last_reviewed_at AS "lastReviewedAt"`,
      [req.user.id, mappingSetId, expectedRevision]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'O mapeamento mudou durante a revisão.' });
    }
    reviewed = result.rows[0];
    await recordMappingChange({
      db: client,
      mappingSetId,
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'review',
      entityType: 'mapping_set',
      entityId: mappingSetId,
      summary: note ? `Alterações do cliente revisadas: ${note}` : 'Alterações do cliente revisadas',
      beforeData: { lastReviewedAt: mappingSet.last_reviewed_at || null },
      afterData: { lastReviewedAt: reviewed.lastReviewedAt, note },
      mappingRevision: reviewed.revision,
      clientVisible: true
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  res.json({
    review: reviewed,
    hasUnreviewedClientChanges: false
  });
});

router.post('/mappings/:mappingSetId/history/:changeId/restore', authenticateToken, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const mappingSetId = Number(req.params.mappingSetId);
  const changeId = Number(req.params.changeId);
  const mappingSet = await getMappingSet(mappingSetId, req.user);
  if (!mappingSet) return res.status(404).json({ error: 'Mapeamento não encontrado' });
  const expectedRevision = expectedRevisionFrom(req.body);
  if (!Number.isInteger(expectedRevision) || expectedRevision !== Number(mappingSet.revision)) {
    return res.status(409).json({ error: 'O mapeamento mudou. Recarregue o histórico antes de restaurar.' });
  }
  const changeResult = await query(
    `SELECT *
       FROM integration_mapping_changes
      WHERE id = $1 AND mapping_set_id = $2`,
    [changeId, mappingSetId]
  );
  const change = changeResult.rows[0];
  if (!change) return res.status(404).json({ error: 'Alteração não encontrada' });
  const canUndoCreatedEntry = change.entity_type === 'mapping_entry' && change.action === 'create';
  if (!['mapping_set', 'mapping_entry'].includes(change.entity_type) ||
      (!change.before_data && !canUndoCreatedEntry)) {
    return res.status(409).json({ error: 'Esta alteração não possui um estado anterior restaurável' });
  }
  if (mappingSet.status !== 'draft' && change.actor_role !== 'client') {
    return res.status(409).json({ error: 'Crie uma nova versão para restaurar alterações administrativas antigas' });
  }

  const client = await pool.connect();
  let restoredEntityId = change.entity_id;
  let restoredData;
  let currentData = null;
  let nextRevision;
  try {
    await client.query('BEGIN');
    if (change.entity_type === 'mapping_set') {
      if (!Object.prototype.hasOwnProperty.call(change.before_data, 'contentMarkdown')) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Somente alterações anteriores do documento podem ser restauradas por aqui' });
      }
      currentData = { contentMarkdown: mappingSet.content_markdown ?? null };
      restoredData = { contentMarkdown: change.before_data.contentMarkdown ?? null };
      await client.query(
        'UPDATE integration_mapping_sets SET content_markdown = $1 WHERE id = $2',
        [restoredData.contentMarkdown, mappingSetId]
      );
    } else {
      const originalEntryId = Number(change.entity_id);
      const currentEntryResult = await client.query(
        'SELECT * FROM integration_mapping_entries WHERE id = $1 AND mapping_set_id = $2',
        [originalEntryId, mappingSetId]
      );
      currentData = entrySnapshot(currentEntryResult.rows[0]);
      if (change.action === 'create') {
        if (!currentEntryResult.rowCount) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'O vínculo criado por esta alteração já não existe' });
        }
        await client.query(
          'DELETE FROM integration_mapping_entries WHERE id = $1 AND mapping_set_id = $2',
          [originalEntryId, mappingSetId]
        );
        restoredData = null;
      } else {
        const restoredEntry = normalizeEntryInput(change.before_data, {
          allowClientEditableFields: true
        });
        restoredEntry.sortOrder = Number.isInteger(Number(change.before_data.sortOrder))
          ? Number(change.before_data.sortOrder)
          : 0;
        if (currentEntryResult.rowCount) {
        const updateResult = await client.query(
          `UPDATE integration_mapping_entries
              SET source_path = $1, source_type = $2, target_path = $3, target_type = $4,
                  direction = $5, transformation = $6, fallback_value = $7, is_required = $8,
                  notes = $9, examples = $10, sort_order = $11, section = $12,
                  mapping_status = $13, client_editable_fields = $14, updated_at = NOW()
            WHERE id = $15 AND mapping_set_id = $16
            RETURNING *`,
          [
            restoredEntry.sourcePath, restoredEntry.sourceType, restoredEntry.targetPath,
            restoredEntry.targetType, restoredEntry.direction, restoredEntry.transformation,
            restoredEntry.fallbackValue, restoredEntry.isRequired, restoredEntry.notes,
            JSON.stringify(restoredEntry.examples), restoredEntry.sortOrder, restoredEntry.section,
            restoredEntry.mappingStatus, JSON.stringify(restoredEntry.clientEditableFields),
            originalEntryId, mappingSetId
          ]
        );
        restoredData = entrySnapshot(updateResult.rows[0]);
        } else {
          const insertResult = await client.query(
          `INSERT INTO integration_mapping_entries
            (mapping_set_id, source_path, source_type, target_path, target_type, direction,
             transformation, fallback_value, is_required, notes, examples, sort_order, section,
             mapping_status, client_editable_fields)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           RETURNING *`,
          [
            mappingSetId, restoredEntry.sourcePath, restoredEntry.sourceType,
            restoredEntry.targetPath, restoredEntry.targetType, restoredEntry.direction,
            restoredEntry.transformation, restoredEntry.fallbackValue, restoredEntry.isRequired,
            restoredEntry.notes, JSON.stringify(restoredEntry.examples), restoredEntry.sortOrder,
            restoredEntry.section, restoredEntry.mappingStatus,
            JSON.stringify(restoredEntry.clientEditableFields)
          ]
        );
          restoredEntityId = insertResult.rows[0].id;
          restoredData = entrySnapshot(insertResult.rows[0]);
        }
      }
    }
    const setUpdate = await client.query(
      `UPDATE integration_mapping_sets
          SET revision = revision + 1,
              last_reviewed_by = CASE WHEN $1 = 'client' THEN $2 ELSE last_reviewed_by END,
              last_reviewed_at = CASE WHEN $1 = 'client' THEN NOW() ELSE last_reviewed_at END,
              updated_at = NOW()
        WHERE id = $3 AND revision = $4
        RETURNING revision`,
      [change.actor_role, req.user.id, mappingSetId, expectedRevision]
    );
    if (!setUpdate.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'O mapeamento mudou durante a restauração' });
    }
    nextRevision = setUpdate.rows[0].revision;
    await recordMappingChange({
      db: client,
      mappingSetId,
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'restore',
      entityType: change.entity_type,
      entityId: restoredEntityId,
      summary: `Estado anterior restaurado a partir da alteração #${changeId}`,
      beforeData: currentData,
      afterData: restoredData,
      mappingRevision: nextRevision,
      clientVisible: true
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  res.json({ success: true, revision: nextRevision, entityId: restoredEntityId });
});

router.post('/mappings/:mappingSetId/entries', authenticateToken, async (req, res) => {
  const mappingSetId = Number(req.params.mappingSetId);
  const mappingSet = await getMappingSet(mappingSetId, req.user);
  if (!mappingSet) return res.status(404).json({ error: 'Mapeamento não encontrado' });
  const isClient = req.user.role === 'client';
  const requestExpectedRevision = expectedRevisionFrom(req.body);
  if (Number.isNaN(requestExpectedRevision)) {
    return res.status(400).json({ error: 'Revisão esperada inválida' });
  }
  if (requestExpectedRevision !== null && requestExpectedRevision !== Number(mappingSet.revision)) {
    return res.status(409).json({ error: 'O mapeamento foi atualizado. Recarregue antes de salvar este vínculo.' });
  }
  if (isClient && (mappingSet.status !== 'published' || mappingSet.client_edit_mode !== 'all' || !mappingSet.client_can_add_entries)) {
    return res.status(403).json({ error: 'A inclusão de vínculos não está liberada para o cliente' });
  }
  if (!isClient && mappingSet.status !== 'draft') {
    return res.status(409).json({ error: 'Crie uma nova versão antes de alterar um mapa publicado' });
  }
  if (isClient && !Number.isInteger(requestExpectedRevision)) {
    return res.status(409).json({ error: 'O mapeamento foi atualizado. Recarregue antes de adicionar um vínculo.' });
  }
  let normalizedEntry;
  try {
    normalizedEntry = normalizeEntryInput(req.body, { allowClientEditableFields: !isClient });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const client = await pool.connect();
  let createdEntry;
  let nextRevision;
  try {
    await client.query('BEGIN');
    const sortResult = await client.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS "sortOrder" FROM integration_mapping_entries WHERE mapping_set_id = $1',
      [mappingSetId]
    );
    const inserted = await client.query(
      `INSERT INTO integration_mapping_entries
        (mapping_set_id, source_path, source_type, target_path, target_type, direction,
         transformation, fallback_value, is_required, notes, examples, sort_order, section, mapping_status,
         client_editable_fields, last_client_edited_by, last_client_edited_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING id, source_path AS "sourcePath", source_type AS "sourceType",
                 target_path AS "targetPath", target_type AS "targetType", direction,
                 transformation, fallback_value AS "fallbackValue",
                 is_required AS "isRequired", notes, examples, section,
                 mapping_status AS "mappingStatus", client_editable_fields AS "clientEditableFields",
                 last_client_edited_at AS "lastClientEditedAt", sort_order AS "sortOrder",
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        mappingSetId, normalizedEntry.sourcePath, normalizedEntry.sourceType,
        normalizedEntry.targetPath, normalizedEntry.targetType, normalizedEntry.direction,
        normalizedEntry.transformation, normalizedEntry.fallbackValue, normalizedEntry.isRequired,
        normalizedEntry.notes, JSON.stringify(normalizedEntry.examples),
        Number(sortResult.rows[0].sortOrder), normalizedEntry.section, normalizedEntry.mappingStatus,
        JSON.stringify(normalizedEntry.clientEditableFields),
        isClient ? req.user.id : null, isClient ? new Date() : null
      ]
    );
    createdEntry = inserted.rows[0];
    const enforceRevision = requestExpectedRevision !== null;
    const setUpdate = await client.query(
      `UPDATE integration_mapping_sets
          SET revision = revision + 1,
              last_client_edited_by = CASE WHEN $1 THEN $2 ELSE last_client_edited_by END,
              last_client_edited_at = CASE WHEN $1 THEN NOW() ELSE last_client_edited_at END,
              updated_at = NOW()
        WHERE id = $3 ${enforceRevision ? 'AND revision = $4' : ''}
        RETURNING revision`,
      enforceRevision
        ? [isClient, req.user.id, mappingSetId, requestExpectedRevision]
        : [isClient, req.user.id, mappingSetId]
    );
    if (!setUpdate.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'O mapeamento mudou enquanto você adicionava o vínculo.' });
    }
    nextRevision = setUpdate.rows[0].revision;
    await recordMappingChange({
      db: client,
      mappingSetId,
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'create',
      entityType: 'mapping_entry',
      entityId: createdEntry.id,
      summary: `${isClient ? 'Cliente adicionou' : 'Vínculo adicionado'}: ${normalizedEntry.sourcePath} → ${normalizedEntry.targetPath}`,
      afterData: entrySnapshot(createdEntry),
      mappingRevision: nextRevision
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logAudit({
    companyId: mappingSet.company_id,
    userId: req.user.id,
    action: isClient ? 'mapping.client.entry.create' : 'mapping.entry.create',
    resourceType: 'mapping_entry',
    resourceId: String(createdEntry.id),
    metadata: { mappingSetId, revision: nextRevision },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
  res.status(201).json({ entry: createdEntry, revision: nextRevision });
});

router.post('/mappings/:mappingSetId/entries/bulk', authenticateToken, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const mappingSetId = Number(req.params.mappingSetId);
  const mappingSet = await getMappingSet(mappingSetId, req.user);
  if (!mappingSet) return res.status(404).json({ error: 'Mapeamento não encontrado' });
  if (mappingSet.status !== 'draft') {
    return res.status(409).json({ error: 'Crie uma nova versão antes de importar vínculos' });
  }
  if (!Array.isArray(req.body.entries) || !req.body.entries.length || req.body.entries.length > 500) {
    return res.status(400).json({ error: 'Informe de 1 a 500 vínculos para importação' });
  }

  let entries;
  try {
    entries = req.body.entries.map((entry) => normalizeEntryInput(entry, {
      allowClientEditableFields: true
    }));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sortResult = await client.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS "sortOrder" FROM integration_mapping_entries WHERE mapping_set_id = $1',
      [mappingSetId]
    );
    const firstSortOrder = Number(sortResult.rows[0].sortOrder);
    await insertEntries(client, mappingSetId, entries, firstSortOrder);
    const setUpdate = await client.query(
      'UPDATE integration_mapping_sets SET revision = revision + 1, updated_at = NOW() WHERE id = $1 RETURNING revision',
      [mappingSetId]
    );
    await recordMappingChange({
      db: client,
      mappingSetId,
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'bulk_import',
      entityType: 'mapping_set',
      entityId: mappingSetId,
      summary: `${entries.length} vínculo(s) importado(s)`,
      changedFields: [{
        field: 'entries',
        before: firstSortOrder,
        after: firstSortOrder + entries.length
      }],
      afterData: { importedEntries: entries.map(entrySnapshot) },
      mappingRevision: setUpdate.rows[0].revision,
      clientVisible: false
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logAudit({
    companyId: mappingSet.company_id,
    userId: req.user.id,
    action: 'mapping.entry.bulk_import',
    resourceType: 'mapping_set',
    resourceId: String(mappingSetId),
    metadata: { imported: entries.length },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
  res.status(201).json({ imported: entries.length });
});

router.patch('/mappings/:mappingSetId/entries/bulk', authenticateToken, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const mappingSetId = Number(req.params.mappingSetId);
  const mappingSet = await getMappingSet(mappingSetId, req.user);
  if (!mappingSet) return res.status(404).json({ error: 'Mapeamento não encontrado' });
  if (mappingSet.status !== 'draft') {
    return res.status(409).json({ error: 'Crie uma nova versão antes de alterar vínculos em lote' });
  }
  const entryIds = [...new Set((Array.isArray(req.body.entryIds) ? req.body.entryIds : [])
    .map(Number)
    .filter(id => Number.isInteger(id) && id > 0))];
  if (!entryIds.length || entryIds.length > 200) {
    return res.status(400).json({ error: 'Selecione de 1 a 200 vínculos' });
  }
  const changes = req.body.changes;
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    return res.status(400).json({ error: 'Alterações em lote inválidas' });
  }
  const fields = [];
  const values = [];
  const add = (column, value) => {
    values.push(value);
    fields.push(`${column} = $${values.length}`);
  };
  try {
    if (changes.section !== undefined) add('section', normalizeText(changes.section, 'Seção', 240));
    if (changes.mappingStatus !== undefined) {
      if (!validMappingStatuses.has(changes.mappingStatus)) throw new Error('Situação inválida');
      add('mapping_status', changes.mappingStatus);
    }
    if (changes.isRequired !== undefined) add('is_required', Boolean(changes.isRequired));
    if (changes.clientEditableFields !== undefined) {
      add('client_editable_fields', JSON.stringify(normalizeClientEditableFields(changes.clientEditableFields)));
    }
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  if (!fields.length) return res.status(400).json({ error: 'Nenhuma alteração em lote informada' });

  const client = await pool.connect();
  let updatedEntries;
  let nextRevision;
  try {
    await client.query('BEGIN');
    const beforeResult = await client.query(
      'SELECT * FROM integration_mapping_entries WHERE mapping_set_id = $1 AND id = ANY($2::int[]) ORDER BY sort_order, id',
      [mappingSetId, entryIds]
    );
    if (beforeResult.rowCount !== entryIds.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Um ou mais vínculos selecionados não existem mais' });
    }
    values.push(entryIds, mappingSetId);
    const updatedResult = await client.query(
      `UPDATE integration_mapping_entries
          SET ${fields.join(', ')}, updated_at = NOW()
        WHERE id = ANY($${values.length - 1}::int[]) AND mapping_set_id = $${values.length}
        RETURNING *`,
      values
    );
    updatedEntries = updatedResult.rows.map(entrySnapshot);
    const setUpdate = await client.query(
      'UPDATE integration_mapping_sets SET revision = revision + 1, updated_at = NOW() WHERE id = $1 RETURNING revision',
      [mappingSetId]
    );
    nextRevision = setUpdate.rows[0].revision;
    await recordMappingChange({
      db: client,
      mappingSetId,
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'bulk_update',
      entityType: 'mapping_set',
      entityId: mappingSetId,
      summary: `${entryIds.length} vínculo(s) atualizado(s) em lote`,
      beforeData: { entries: beforeResult.rows.map(entrySnapshot) },
      afterData: { entries: updatedEntries },
      changedFields: Object.keys(changes).map(field => ({
        field,
        before: 'valores anteriores variados',
        after: changes[field]
      })),
      mappingRevision: nextRevision,
      clientVisible: true
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  res.json({ updated: updatedEntries.length, entries: updatedEntries, revision: nextRevision });
});

router.patch('/mappings/:mappingSetId/entries/:entryId', authenticateToken, async (req, res) => {
  const mappingSetId = Number(req.params.mappingSetId);
  const entryId = Number(req.params.entryId);
  const mappingSet = await getMappingSet(mappingSetId, req.user);
  if (!mappingSet) return res.status(404).json({ error: 'Mapeamento não encontrado' });
  const isClient = req.user.role === 'client';
  const requestExpectedRevision = expectedRevisionFrom(req.body);
  if (Number.isNaN(requestExpectedRevision)) {
    return res.status(400).json({ error: 'Revisão esperada inválida' });
  }
  if (requestExpectedRevision !== null && requestExpectedRevision !== Number(mappingSet.revision)) {
    return res.status(409).json({ error: 'O mapeamento foi atualizado. Recarregue antes de salvar este vínculo.' });
  }
  if (!isClient && mappingSet.status !== 'draft') {
    return res.status(409).json({ error: 'Crie uma nova versão antes de alterar um mapa publicado' });
  }
  const entryResult = await query(
    'SELECT * FROM integration_mapping_entries WHERE id = $1 AND mapping_set_id = $2',
    [entryId, mappingSetId]
  );
  const existingEntry = entryResult.rows[0];
  if (!existingEntry) return res.status(404).json({ error: 'Campo não encontrado' });
  if (isClient) {
    if (mappingSet.status !== 'published' || mappingSet.client_edit_mode === 'none') {
      return res.status(403).json({ error: 'Este de-para não está liberado para edição' });
    }
    if (!Number.isInteger(requestExpectedRevision)) {
      return res.status(409).json({ error: 'O de-para foi atualizado. Reabra o vínculo para carregar a versão mais recente.' });
    }
    const requestedFields = Object.keys(req.body).filter(key => !['expectedVersion', 'expectedRevision'].includes(key));
    const forbiddenField = requestedFields.find(field => !canClientEditEntryField(mappingSet, existingEntry, field));
    if (!requestedFields.length || forbiddenField) {
      return res.status(403).json({
        error: forbiddenField
          ? `O campo "${forbiddenField}" não está liberado para edição`
          : 'Nenhuma alteração permitida foi informada'
      });
    }
  }
  const allowedFields = {
    sourcePath: ['source_path', 500],
    sourceType: ['source_type', 80],
    targetPath: ['target_path', 500],
    targetType: ['target_type', 80],
    transformation: ['transformation', 5000],
    fallbackValue: ['fallback_value', 2000],
    notes: ['notes', 3000],
    section: ['section', 240]
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
  if (req.body.mappingStatus !== undefined) {
    if (!validMappingStatuses.has(req.body.mappingStatus)) {
      return res.status(400).json({ error: 'Situação do vínculo inválida' });
    }
    add('mapping_status', req.body.mappingStatus);
  }
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
  if (!isClient && req.body.clientEditableFields !== undefined) {
    try {
      add('client_editable_fields', JSON.stringify(normalizeClientEditableFields(req.body.clientEditableFields)));
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }
  if (!fields.length) return res.status(400).json({ error: 'Nenhuma alteração informada' });
  if (isClient) {
    add('last_client_edited_by', req.user.id);
    add('last_client_edited_at', new Date());
  }
  fields.push('updated_at = NOW()');
  values.push(entryId, mappingSetId);
  const client = await pool.connect();
  let updatedEntry;
  let nextRevision;
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE integration_mapping_entries
          SET ${fields.join(', ')}
        WHERE id = $${values.length - 1} AND mapping_set_id = $${values.length}
        RETURNING id, source_path AS "sourcePath", source_type AS "sourceType",
                  target_path AS "targetPath", target_type AS "targetType", direction,
                  transformation, fallback_value AS "fallbackValue",
                  is_required AS "isRequired", notes, examples, section,
                  mapping_status AS "mappingStatus", client_editable_fields AS "clientEditableFields",
                  last_client_edited_at AS "lastClientEditedAt", sort_order AS "sortOrder",
                  created_at AS "createdAt", updated_at AS "updatedAt"`,
      values
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Campo não encontrado' });
    }
    updatedEntry = result.rows[0];
    const enforceRevision = requestExpectedRevision !== null;
    const setUpdate = await client.query(
      `UPDATE integration_mapping_sets
          SET revision = revision + 1,
              last_client_edited_by = CASE WHEN $1 THEN $2 ELSE last_client_edited_by END,
              last_client_edited_at = CASE WHEN $1 THEN NOW() ELSE last_client_edited_at END,
              updated_at = NOW()
        WHERE id = $3 ${enforceRevision ? 'AND revision = $4' : ''}
        RETURNING revision`,
      enforceRevision
        ? [isClient, req.user.id, mappingSetId, requestExpectedRevision]
        : [isClient, req.user.id, mappingSetId]
    );
    if (!setUpdate.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'O mapeamento mudou enquanto você salvava. Recarregue e tente novamente.' });
    }
    nextRevision = setUpdate.rows[0].revision;
    const beforeData = entrySnapshot(existingEntry);
    const afterData = entrySnapshot(updatedEntry);
    await recordMappingChange({
      db: client,
      mappingSetId,
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'update',
      entityType: 'mapping_entry',
      entityId: entryId,
      summary: `${isClient ? 'Cliente atualizou' : 'Vínculo atualizado'}: ${afterData.sourcePath} → ${afterData.targetPath}`,
      beforeData,
      afterData,
      changedFields: buildChangedFields(beforeData, afterData),
      mappingRevision: nextRevision
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logAudit({
    companyId: mappingSet.company_id,
    userId: req.user.id,
    action: isClient ? 'mapping.client.entry.update' : 'mapping.entry.update',
    resourceType: 'mapping_entry',
    resourceId: String(entryId),
    metadata: {
      mappingSetId,
      fields: Object.keys(req.body).filter(field => !['expectedVersion', 'expectedRevision'].includes(field)),
      revision: nextRevision
    },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
  res.json({ entry: updatedEntry, revision: nextRevision });
});

router.delete('/mappings/:mappingSetId/entries/:entryId', authenticateToken, async (req, res) => {
  const mappingSetId = Number(req.params.mappingSetId);
  const entryId = Number(req.params.entryId);
  const mappingSet = await getMappingSet(mappingSetId, req.user);
  if (!mappingSet) return res.status(404).json({ error: 'Mapeamento não encontrado' });
  const isClient = req.user.role === 'client';
  if (isClient && (mappingSet.status !== 'published' || mappingSet.client_edit_mode !== 'all' || !mappingSet.client_can_delete_entries)) {
    return res.status(403).json({ error: 'A exclusão de vínculos não está liberada para o cliente' });
  }
  if (!isClient && mappingSet.status !== 'draft') {
    return res.status(409).json({ error: 'Crie uma nova versão antes de alterar um mapa publicado' });
  }
  const expectedRevision = expectedRevisionFrom({
    ...req.body,
    expectedRevision: req.query.expectedRevision ?? req.body.expectedRevision
  });
  if (isClient && (!Number.isInteger(expectedRevision) || expectedRevision !== Number(mappingSet.revision))) {
    return res.status(409).json({ error: 'O mapeamento foi atualizado. Recarregue antes de excluir um vínculo.' });
  }
  const client = await pool.connect();
  let deletedEntry;
  let nextRevision;
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'DELETE FROM integration_mapping_entries WHERE id = $1 AND mapping_set_id = $2 RETURNING *',
      [entryId, mappingSetId]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Campo não encontrado' });
    }
    deletedEntry = entrySnapshot(result.rows[0]);
    const setUpdate = await client.query(
      `UPDATE integration_mapping_sets
          SET revision = revision + 1,
              last_client_edited_by = CASE WHEN $1 THEN $2 ELSE last_client_edited_by END,
              last_client_edited_at = CASE WHEN $1 THEN NOW() ELSE last_client_edited_at END,
              updated_at = NOW()
        WHERE id = $3 ${isClient ? 'AND revision = $4' : ''}
        RETURNING revision`,
      isClient
        ? [true, req.user.id, mappingSetId, expectedRevision]
        : [false, req.user.id, mappingSetId]
    );
    if (!setUpdate.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'O mapeamento mudou enquanto você excluía o vínculo.' });
    }
    nextRevision = setUpdate.rows[0].revision;
    await recordMappingChange({
      db: client,
      mappingSetId,
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'delete',
      entityType: 'mapping_entry',
      entityId: entryId,
      summary: `${isClient ? 'Cliente excluiu' : 'Vínculo excluído'}: ${deletedEntry.sourcePath} → ${deletedEntry.targetPath}`,
      beforeData: deletedEntry,
      mappingRevision: nextRevision
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logAudit({
    companyId: mappingSet.company_id,
    userId: req.user.id,
    action: isClient ? 'mapping.client.entry.delete' : 'mapping.entry.delete',
    resourceType: 'mapping_entry',
    resourceId: String(entryId),
    metadata: { mappingSetId, revision: nextRevision },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
  res.json({ success: true, revision: nextRevision });
});

router.post('/mappings/:mappingSetId/attachments', authenticateToken, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const mappingSetId = Number(req.params.mappingSetId);
  const mappingSet = await getMappingSet(mappingSetId, req.user);
  if (!mappingSet) return res.status(404).json({ error: 'Mapeamento não encontrado' });
  if (mappingSet.status !== 'draft') {
    return res.status(409).json({ error: 'Crie uma nova versão antes de anexar arquivos' });
  }

  let attachment;
  try {
    attachment = normalizeAttachment(req.body);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const appendToDocument = Boolean(req.body.appendToDocument && attachment.extractedText);
  const client = await pool.connect();
  let created;
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO integration_mapping_attachments
        (mapping_set_id, uploaded_by, file_name, mime_type, file_size, file_data, extracted_text)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, file_name AS "fileName", mime_type AS "mimeType",
                 file_size AS "fileSize", extracted_text IS NOT NULL AS "hasExtractedText",
                 created_at AS "createdAt"`,
      [
        mappingSetId, req.user.id, attachment.fileName, attachment.mimeType,
        attachment.fileData.length, attachment.fileData, attachment.extractedText
      ]
    );
    created = result.rows[0];
    let setUpdate;
    if (appendToDocument) {
      setUpdate = await client.query(
        `UPDATE integration_mapping_sets
            SET content_markdown = CONCAT_WS(
                  E'\n\n---\n\n',
                  NULLIF(content_markdown, ''),
                  $1
                ),
                revision = revision + 1,
                updated_at = NOW()
          WHERE id = $2
          RETURNING revision`,
        [attachment.extractedText, mappingSetId]
      );
    } else {
      setUpdate = await client.query(
        'UPDATE integration_mapping_sets SET revision = revision + 1, updated_at = NOW() WHERE id = $1 RETURNING revision',
        [mappingSetId]
      );
    }
    if (!setUpdate.rows?.[0]?.revision) {
      const revisionResult = await client.query(
        'SELECT revision FROM integration_mapping_sets WHERE id = $1',
        [mappingSetId]
      );
      setUpdate.rows = revisionResult.rows;
    }
    await recordMappingChange({
      db: client,
      mappingSetId,
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'upload',
      entityType: 'attachment',
      entityId: created.id,
      summary: `Arquivo anexado: ${attachment.fileName}`,
      afterData: created,
      changedFields: [{
        field: 'attachments',
        before: null,
        after: attachment.fileName
      }],
      mappingRevision: setUpdate.rows[0].revision,
      clientVisible: true
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logAudit({
    companyId: mappingSet.company_id,
    userId: req.user.id,
    action: 'mapping.attachment.upload',
    resourceType: 'mapping_set',
    resourceId: String(mappingSetId),
    metadata: {
      attachmentId: created.id,
      fileName: attachment.fileName,
      fileSize: attachment.fileData.length,
      appendedToDocument: appendToDocument
    },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
  res.status(201).json({ attachment: created, appendedToDocument: appendToDocument });
});

router.get('/mappings/:mappingSetId/attachments/:attachmentId', authenticateToken, async (req, res) => {
  const mappingSetId = Number(req.params.mappingSetId);
  const attachmentId = Number(req.params.attachmentId);
  const mappingSet = await getMappingSet(mappingSetId, req.user);
  if (!mappingSet) return res.status(404).json({ error: 'Mapeamento não encontrado' });
  const result = await query(
    `SELECT file_name, mime_type, file_data
       FROM integration_mapping_attachments
      WHERE id = $1 AND mapping_set_id = $2`,
    [attachmentId, mappingSetId]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Arquivo não encontrado' });
  const item = result.rows[0];
  const fallbackName = String(item.file_name || 'arquivo').replace(/["\r\n]/g, '_');
  res.setHeader('Content-Type', item.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(item.file_name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.send(item.file_data);
});

router.delete('/mappings/:mappingSetId/attachments/:attachmentId', authenticateToken, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const mappingSetId = Number(req.params.mappingSetId);
  const attachmentId = Number(req.params.attachmentId);
  const mappingSet = await getMappingSet(mappingSetId, req.user);
  if (!mappingSet) return res.status(404).json({ error: 'Mapeamento não encontrado' });
  if (mappingSet.status !== 'draft') {
    return res.status(409).json({ error: 'Crie uma nova versão antes de remover arquivos' });
  }
  const client = await pool.connect();
  let result;
  try {
    await client.query('BEGIN');
    result = await client.query(
      `DELETE FROM integration_mapping_attachments
        WHERE id = $1 AND mapping_set_id = $2
        RETURNING id, file_name AS "fileName", mime_type AS "mimeType",
                  file_size AS "fileSize", created_at AS "createdAt"`,
      [attachmentId, mappingSetId]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Arquivo não encontrado' });
    }
    const setUpdate = await client.query(
      'UPDATE integration_mapping_sets SET revision = revision + 1, updated_at = NOW() WHERE id = $1 RETURNING revision',
      [mappingSetId]
    );
    await recordMappingChange({
      db: client,
      mappingSetId,
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'delete',
      entityType: 'attachment',
      entityId: attachmentId,
      summary: `Arquivo removido: ${result.rows[0].fileName}`,
      beforeData: result.rows[0],
      changedFields: [{
        field: 'attachments',
        before: result.rows[0].fileName,
        after: null
      }],
      mappingRevision: setUpdate.rows[0].revision,
      clientVisible: true
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logAudit({
    companyId: mappingSet.company_id,
    userId: req.user.id,
    action: 'mapping.attachment.delete',
    resourceType: 'mapping_set',
    resourceId: String(mappingSetId),
    metadata: { attachmentId, fileName: result.rows[0].fileName },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
  res.json({ success: true });
});

router.delete('/mappings/:mappingSetId', authenticateToken, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const mappingSetId = Number(req.params.mappingSetId);
  if (!Number.isInteger(mappingSetId) || mappingSetId <= 0) {
    return res.status(400).json({ error: 'Mapeamento inválido' });
  }
  const mappingSet = await getMappingSet(mappingSetId, req.user);
  if (!mappingSet) return res.status(404).json({ error: 'Mapeamento não encontrado' });
  if (mappingSet.status === 'published') {
    return res.status(409).json({ error: 'Arquive o de-para antes de excluí-lo definitivamente' });
  }
  const result = await query(
    'DELETE FROM integration_mapping_sets WHERE id = $1 RETURNING id, name',
    [mappingSetId]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Mapeamento não encontrado' });
  await logAudit({
    companyId: mappingSet.company_id,
    userId: req.user.id,
    action: 'mapping.delete',
    resourceType: 'mapping_set',
    resourceId: String(mappingSetId),
    metadata: { name: result.rows[0].name, previousStatus: mappingSet.status },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
  res.json({ success: true });
});

router.post('/mappings/:mappingSetId/clone', authenticateToken, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const mappingSetId = Number(req.params.mappingSetId);
  const mappingSet = await getMappingSet(mappingSetId, req.user);
  if (!mappingSet) return res.status(404).json({ error: 'Mapeamento não encontrado' });
  let clonedName;
  try {
    clonedName = normalizeText(req.body.name || mappingSet.name, 'Nome', 160, true);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const client = await pool.connect();
  let clonedId;
  try {
    await client.query('BEGIN');
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [`mapping-version:${mappingSet.integration_id}:${clonedName}`]
    );
    const created = await client.query(
      `INSERT INTO integration_mapping_sets
        (company_id, integration_id, process_id, created_by, name, description,
         content_markdown, source_system, target_system, version, revision, status, client_edit_mode,
         client_can_add_entries, client_can_delete_entries, client_instructions,
         validation_rules, cloned_from_mapping_set_id)
       SELECT company_id, integration_id, process_id, $1, $2, description,
              content_markdown, source_system, target_system,
              (
                SELECT COALESCE(MAX(existing_versions.version), 0) + 1
                  FROM integration_mapping_sets existing_versions
                 WHERE existing_versions.integration_id = integration_mapping_sets.integration_id
                   AND existing_versions.name = $2
              ),
              1, 'draft', client_edit_mode,
              client_can_add_entries, client_can_delete_entries, client_instructions,
              validation_rules, $3
         FROM integration_mapping_sets
        WHERE id = $3
       RETURNING id, version, revision`,
      [req.user.id, clonedName, mappingSetId]
    );
    clonedId = created.rows[0].id;
    await client.query(
      `INSERT INTO integration_mapping_entries
        (mapping_set_id, source_path, source_type, target_path, target_type, direction,
         transformation, fallback_value, is_required, notes, examples, sort_order, section,
         mapping_status, client_editable_fields)
       SELECT $1, source_path, source_type, target_path, target_type, direction,
              transformation, fallback_value, is_required, notes, examples, sort_order, section,
              mapping_status, client_editable_fields
         FROM integration_mapping_entries
        WHERE mapping_set_id = $2`,
      [clonedId, mappingSetId]
    );
    await client.query(
      `INSERT INTO integration_mapping_attachments
        (mapping_set_id, uploaded_by, file_name, mime_type, file_size, file_data, extracted_text)
       SELECT $1, $2, file_name, mime_type, file_size, file_data, extracted_text
         FROM integration_mapping_attachments
        WHERE mapping_set_id = $3`,
      [clonedId, req.user.id, mappingSetId]
    );
    await recordMappingChange({
      db: client,
      mappingSetId: clonedId,
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'clone',
      entityType: 'mapping_set',
      entityId: clonedId,
      summary: `Versão ${created.rows[0].version} criada a partir da versão ${mappingSet.version}`,
      beforeData: { sourceMappingSetId: mappingSetId, version: mappingSet.version },
      afterData: { mappingSetId: clonedId, version: created.rows[0].version },
      mappingRevision: created.rows[0].revision,
      clientVisible: false
    });
    await recordMappingChange({
      db: client,
      mappingSetId,
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'clone',
      entityType: 'mapping_set',
      entityId: clonedId,
      summary: `Versão ${created.rows[0].version} criada como novo rascunho`,
      beforeData: { sourceMappingSetId: mappingSetId, version: mappingSet.version },
      afterData: { mappingSetId: clonedId, version: created.rows[0].version },
      mappingRevision: mappingSet.revision,
      clientVisible: false
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await logAudit({
    companyId: mappingSet.company_id,
    userId: req.user.id,
    action: 'mapping.clone',
    resourceType: 'mapping_set',
    resourceId: String(clonedId),
    metadata: { sourceMappingSetId: mappingSetId, name: clonedName },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });
  res.status(201).json({ mappingSetId: clonedId });
});

module.exports = router;
