const { pool } = require('../db');
const { withIdempotentEffect, domainError } = require('./processDomainService');
const { recordMappingChange } = require('./mappingHistory');
const { enqueueGenericWebhookEvent } = require('./genericWebhookPublisher');

const DIRECTIONS = new Set(['source_to_target', 'target_to_source', 'bidirectional']);
const MAPPING_STATUSES = new Set(['mapped', 'pending', 'attention', 'ignored']);
const DEFAULT_VALIDATION_RULES = Object.freeze({
  requireStructuredEntries: false,
  blockUnresolved: false,
  blockDuplicateSources: false,
  requireTypes: false,
});

function requiredText(value, label, max) {
  const normalized = String(value || '').trim();
  if (!normalized) throw domainError(`${label} é obrigatório.`);
  if (normalized.length > max) throw domainError(`${label} excede ${max} caracteres.`);
  return normalized;
}

function optionalText(value, max) {
  if (value === undefined) return undefined;
  const normalized = String(value || '').trim();
  if (normalized.length > max) throw domainError(`O texto excede ${max} caracteres.`);
  return normalized || null;
}

function positiveId(value, label) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw domainError(`${label} inválido.`);
  return id;
}

function requiredRevision(value) {
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision <= 0) throw domainError('expectedRevision é obrigatório e deve ser positivo.');
  return revision;
}

function mappingReference(mappingSetId) {
  return {
    type: 'mapping-set',
    id: String(mappingSetId),
    externalReference: `lambda-pulse:mapping-set:${mappingSetId}`,
  };
}

function entryReference(entryId) {
  return {
    type: 'mapping-entry',
    id: String(entryId),
    externalReference: `lambda-pulse:mapping-entry:${entryId}`,
  };
}

function normalizeValidationRules(value) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw domainError('Regras de validação inválidas.');
  return Object.fromEntries(Object.keys(DEFAULT_VALIDATION_RULES).map(key => [key, Boolean(value[key])]));
}

function normalizeExamples(value) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw domainError('Exemplos devem formar um objeto JSON.');
  return value;
}

async function lockMapping(client, companyId, mappingSetId, expectedRevision, { requireDraft = false } = {}) {
  const result = await client.query(
    `SELECT mapping_sets.*
       FROM integration_mapping_sets mapping_sets
       JOIN integrations ON integrations.id = mapping_sets.integration_id
      WHERE mapping_sets.id = $1
        AND mapping_sets.company_id = $2
        AND integrations.company_id = $2
      FOR UPDATE`,
    [mappingSetId, companyId],
  );
  const mapping = result.rows[0];
  if (!mapping) throw domainError('Mapeamento não encontrado nesta empresa.', 'NOT_FOUND', 404);
  if (Number(mapping.revision) !== Number(expectedRevision)) {
    throw domainError('O mapeamento foi atualizado por outra operação.', 'REVISION_CONFLICT', 409);
  }
  if (requireDraft && mapping.status !== 'draft') {
    throw domainError('Somente um rascunho pode ser alterado pelo agente.', 'INVALID_STATE', 409);
  }
  return mapping;
}

async function writeAudit(client, { companyId, action, resourceType, resourceId, metadata }) {
  await client.query(
    `INSERT INTO audit_logs (company_id, user_id, action, resource_type, resource_id, metadata)
     VALUES ($1, NULL, $2, $3, $4, $5)`,
    [companyId, action, resourceType, String(resourceId), JSON.stringify(metadata || {})],
  );
}

async function enqueueMappingEvent(client, { companyId, mappingSetId, type, eventId, data = {} }) {
  return enqueueGenericWebhookEvent({
    db: client,
    companyId,
    type,
    eventId,
    subject: { ...mappingReference(mappingSetId) },
    data: { mappingSetId, mappingReference: mappingReference(mappingSetId).externalReference, ...data },
  });
}

async function invalidateApprovalAndAdvance(client, mappingSetId, expectedRevision) {
  const result = await client.query(
    `UPDATE integration_mapping_sets
        SET revision = revision + 1,
            approval_status = 'not_requested',
            approval_revision = NULL,
            approval_requested_at = NULL,
            approved_at = NULL,
            approved_by = NULL,
            approval_note = NULL,
            updated_at = NOW()
      WHERE id = $1 AND revision = $2
      RETURNING revision, updated_at AS "updatedAt"`,
    [mappingSetId, expectedRevision],
  );
  if (!result.rowCount) throw domainError('O mapeamento mudou durante a operação.', 'REVISION_CONFLICT', 409);
  return result.rows[0];
}

async function createMappingDraft({ companyId, input }) {
  const integrationId = positiveId(input.integrationId, 'integrationId');
  const name = requiredText(input.name, 'Nome', 160);
  const sourceSystem = requiredText(input.sourceSystem, 'Sistema de origem', 160);
  const targetSystem = requiredText(input.targetSystem, 'Sistema de destino', 160);
  const processId = input.processId == null ? null : positiveId(input.processId, 'processId');
  const validationRules = normalizeValidationRules(input.validationRules) || DEFAULT_VALIDATION_RULES;

  return withIdempotentEffect({
    companyId,
    toolName: 'create_mapping_draft',
    idempotencyKey: input.idempotencyKey,
    input,
    execute: async client => {
      const integration = await client.query(
        'SELECT id FROM integrations WHERE id = $1 AND company_id = $2',
        [integrationId, companyId],
      );
      if (!integration.rowCount) throw domainError('Integração não encontrada nesta empresa.', 'NOT_FOUND', 404);
      if (processId) {
        const process = await client.query('SELECT id FROM process_items WHERE id = $1 AND company_id = $2', [processId, companyId]);
        if (!process.rowCount) throw domainError('Processo relacionado não encontrado nesta empresa.', 'NOT_FOUND', 404);
      }
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`mapping-version:${integrationId}:${name}`]);
      const created = await client.query(
        `INSERT INTO integration_mapping_sets
          (company_id, integration_id, process_id, created_by, name, description, content_markdown,
           source_system, target_system, version, revision, status, validation_rules, approval_status)
         VALUES (
           $1, $2, $3, NULL, $4, $5, $6, $7, $8,
           (SELECT COALESCE(MAX(version), 0) + 1 FROM integration_mapping_sets WHERE integration_id = $2 AND name = $4),
           1, 'draft', $9, 'not_requested'
         )
         RETURNING id, integration_id AS "integrationId", process_id AS "processId", name, description,
                   source_system AS "sourceSystem", target_system AS "targetSystem", version, revision, status,
                   approval_status AS "approvalStatus", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          companyId,
          integrationId,
          processId,
          name,
          optionalText(input.description, 3000) ?? null,
          optionalText(input.contentMarkdown, 250000) ?? null,
          sourceSystem,
          targetSystem,
          JSON.stringify(validationRules),
        ],
      );
      const mapping = created.rows[0];
      await recordMappingChange({
        db: client,
        mappingSetId: mapping.id,
        actorUserId: null,
        actorRole: 'system',
        action: 'create',
        entityType: 'mapping_set',
        entityId: mapping.id,
        summary: 'Rascunho criado pelo agente via MCP',
        afterData: mapping,
        mappingRevision: mapping.revision,
        clientVisible: true,
      });
      await writeAudit(client, {
        companyId,
        action: 'mapping.mcp.create_draft',
        resourceType: 'mapping_set',
        resourceId: mapping.id,
        metadata: { integrationId, processId, version: mapping.version, revision: mapping.revision },
      });
      await enqueueMappingEvent(client, {
        companyId,
        mappingSetId: mapping.id,
        type: 'mapping.draft.created',
        eventId: `mcp:${companyId}:create_mapping_draft:${input.idempotencyKey}`,
        data: { integrationId, processId, version: mapping.version, revision: mapping.revision },
      });
      return { mappingSet: mapping, ...mappingReference(mapping.id), evidence: { companyId, integrationId, processId, version: mapping.version, revision: mapping.revision } };
    },
  });
}

async function updateMappingDraft({ companyId, input }) {
  const mappingSetId = positiveId(input.mappingSetId, 'mappingSetId');
  const expectedRevision = requiredRevision(input.expectedRevision);
  return withIdempotentEffect({
    companyId,
    toolName: 'update_mapping_draft',
    idempotencyKey: input.idempotencyKey,
    input,
    execute: async client => {
      const before = await lockMapping(client, companyId, mappingSetId, expectedRevision, { requireDraft: true });
      const fields = [];
      const values = [];
      const changed = {};
      const add = (column, key, value) => { values.push(value); fields.push(`${column} = $${values.length}`); changed[key] = value; };
      if (input.name !== undefined) add('name', 'name', requiredText(input.name, 'Nome', 160));
      if (input.description !== undefined) add('description', 'description', optionalText(input.description, 3000));
      if (input.contentMarkdown !== undefined) add('content_markdown', 'contentMarkdown', optionalText(input.contentMarkdown, 250000));
      if (input.sourceSystem !== undefined) add('source_system', 'sourceSystem', requiredText(input.sourceSystem, 'Sistema de origem', 160));
      if (input.targetSystem !== undefined) add('target_system', 'targetSystem', requiredText(input.targetSystem, 'Sistema de destino', 160));
      if (input.validationRules !== undefined) add('validation_rules', 'validationRules', JSON.stringify(normalizeValidationRules(input.validationRules)));
      if (input.processId !== undefined) {
        const processId = input.processId == null ? null : positiveId(input.processId, 'processId');
        if (processId) {
          const process = await client.query('SELECT id FROM process_items WHERE id = $1 AND company_id = $2', [processId, companyId]);
          if (!process.rowCount) throw domainError('Processo relacionado não encontrado nesta empresa.', 'NOT_FOUND', 404);
        }
        add('process_id', 'processId', processId);
      }
      if (!fields.length) throw domainError('Nenhuma alteração informada.');
      fields.push(
        'revision = revision + 1',
        "approval_status = 'not_requested'",
        'approval_revision = NULL',
        'approval_requested_at = NULL',
        'approved_at = NULL',
        'approved_by = NULL',
        'approval_note = NULL',
        'updated_at = NOW()',
      );
      values.push(mappingSetId, expectedRevision);
      const updated = await client.query(
        `UPDATE integration_mapping_sets SET ${fields.join(', ')}
          WHERE id = $${values.length - 1} AND revision = $${values.length}
          RETURNING id, integration_id AS "integrationId", process_id AS "processId", name, description,
                    content_markdown AS "contentMarkdown", source_system AS "sourceSystem", target_system AS "targetSystem",
                    version, revision, status, validation_rules AS "validationRules",
                    approval_status AS "approvalStatus", updated_at AS "updatedAt"`,
        values,
      );
      if (!updated.rowCount) throw domainError('O mapeamento mudou durante a operação.', 'REVISION_CONFLICT', 409);
      const mapping = updated.rows[0];
      await recordMappingChange({
        db: client,
        mappingSetId,
        actorUserId: null,
        actorRole: 'system',
        action: 'update',
        entityType: 'mapping_set',
        entityId: mappingSetId,
        summary: 'Rascunho atualizado pelo agente via MCP',
        beforeData: before,
        afterData: mapping,
        mappingRevision: mapping.revision,
        clientVisible: true,
      });
      await writeAudit(client, { companyId, action: 'mapping.mcp.update_draft', resourceType: 'mapping_set', resourceId: mappingSetId, metadata: { fields: Object.keys(changed), previousRevision: expectedRevision, revision: mapping.revision } });
      await enqueueMappingEvent(client, { companyId, mappingSetId, type: 'mapping.draft.updated', eventId: `mcp:${companyId}:update_mapping_draft:${input.idempotencyKey}`, data: { previousRevision: expectedRevision, revision: mapping.revision, fields: Object.keys(changed) } });
      return { mappingSet: mapping, ...mappingReference(mappingSetId), evidence: { companyId, previousRevision: expectedRevision, revision: mapping.revision } };
    },
  });
}

function normalizedEntry(input, { partial = false } = {}) {
  const result = {};
  const set = (key, value) => { if (!partial || input[key] !== undefined) result[key] = value; };
  if (!partial || input.sourcePath !== undefined) set('sourcePath', requiredText(input.sourcePath, 'Campo de origem', 500));
  if (!partial || input.targetPath !== undefined) set('targetPath', requiredText(input.targetPath, 'Campo de destino', 500));
  if (input.sourceType !== undefined) set('sourceType', optionalText(input.sourceType, 80));
  if (input.targetType !== undefined) set('targetType', optionalText(input.targetType, 80));
  if (!partial || input.direction !== undefined) {
    const direction = input.direction || 'source_to_target';
    if (!DIRECTIONS.has(direction)) throw domainError('Direção inválida.');
    set('direction', direction);
  }
  if (input.transformation !== undefined) set('transformation', optionalText(input.transformation, 5000));
  if (input.fallbackValue !== undefined) set('fallbackValue', optionalText(input.fallbackValue, 2000));
  if (input.isRequired !== undefined) set('isRequired', Boolean(input.isRequired));
  if (input.notes !== undefined) set('notes', optionalText(input.notes, 3000));
  if (input.examples !== undefined) set('examples', normalizeExamples(input.examples));
  if (input.section !== undefined) set('section', optionalText(input.section, 240));
  if (!partial || input.mappingStatus !== undefined) {
    const mappingStatus = input.mappingStatus || 'pending';
    if (!MAPPING_STATUSES.has(mappingStatus)) throw domainError('Situação do vínculo inválida.');
    set('mappingStatus', mappingStatus);
  }
  return result;
}

async function proposeMappingEntry({ companyId, input }) {
  const mappingSetId = positiveId(input.mappingSetId, 'mappingSetId');
  const expectedRevision = requiredRevision(input.expectedRevision);
  const entry = normalizedEntry(input);
  return withIdempotentEffect({
    companyId,
    toolName: 'propose_mapping_entry',
    idempotencyKey: input.idempotencyKey,
    input,
    execute: async client => {
      await lockMapping(client, companyId, mappingSetId, expectedRevision, { requireDraft: true });
      const sort = await client.query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM integration_mapping_entries WHERE mapping_set_id = $1', [mappingSetId]);
      const created = await client.query(
        `INSERT INTO integration_mapping_entries
          (mapping_set_id, source_path, source_type, target_path, target_type, direction, transformation,
           fallback_value, is_required, notes, examples, section, mapping_status, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id, source_path AS "sourcePath", source_type AS "sourceType", target_path AS "targetPath",
                   target_type AS "targetType", direction, transformation, fallback_value AS "fallbackValue",
                   is_required AS "isRequired", notes, examples, section, mapping_status AS "mappingStatus",
                   sort_order AS "sortOrder", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [mappingSetId, entry.sourcePath, entry.sourceType ?? null, entry.targetPath, entry.targetType ?? null,
          entry.direction, entry.transformation ?? null, entry.fallbackValue ?? null, entry.isRequired ?? false,
          entry.notes ?? null, JSON.stringify(entry.examples || {}), entry.section ?? null, entry.mappingStatus,
          Number(sort.rows[0].value)],
      );
      const revision = await invalidateApprovalAndAdvance(client, mappingSetId, expectedRevision);
      const createdEntry = created.rows[0];
      await recordMappingChange({ db: client, mappingSetId, actorUserId: null, actorRole: 'system', action: 'create', entityType: 'mapping_entry', entityId: createdEntry.id, summary: 'Vínculo proposto pelo agente via MCP', afterData: createdEntry, mappingRevision: revision.revision, clientVisible: true });
      await writeAudit(client, { companyId, action: 'mapping.mcp.propose_entry', resourceType: 'mapping_entry', resourceId: createdEntry.id, metadata: { mappingSetId, previousRevision: expectedRevision, revision: revision.revision } });
      await enqueueMappingEvent(client, { companyId, mappingSetId, type: 'mapping.entry.proposed', eventId: `mcp:${companyId}:propose_mapping_entry:${input.idempotencyKey}`, data: { entryId: createdEntry.id, entryReference: entryReference(createdEntry.id).externalReference, previousRevision: expectedRevision, revision: revision.revision } });
      return { mappingEntry: createdEntry, ...entryReference(createdEntry.id), evidence: { companyId, mappingSetId, mappingReference: mappingReference(mappingSetId).externalReference, previousRevision: expectedRevision, revision: revision.revision } };
    },
  });
}

async function updateMappingEntry({ companyId, input }) {
  const mappingSetId = positiveId(input.mappingSetId, 'mappingSetId');
  const entryId = positiveId(input.entryId, 'entryId');
  const expectedRevision = requiredRevision(input.expectedRevision);
  const changes = normalizedEntry(input, { partial: true });
  if (!Object.keys(changes).length) throw domainError('Nenhuma alteração informada.');
  const columns = {
    sourcePath: 'source_path', sourceType: 'source_type', targetPath: 'target_path', targetType: 'target_type',
    direction: 'direction', transformation: 'transformation', fallbackValue: 'fallback_value', isRequired: 'is_required',
    notes: 'notes', examples: 'examples', section: 'section', mappingStatus: 'mapping_status',
  };
  return withIdempotentEffect({
    companyId,
    toolName: 'update_mapping_entry',
    idempotencyKey: input.idempotencyKey,
    input,
    execute: async client => {
      await lockMapping(client, companyId, mappingSetId, expectedRevision, { requireDraft: true });
      const before = await client.query('SELECT * FROM integration_mapping_entries WHERE id = $1 AND mapping_set_id = $2 FOR UPDATE', [entryId, mappingSetId]);
      if (!before.rowCount) throw domainError('Vínculo não encontrado neste mapeamento.', 'NOT_FOUND', 404);
      const values = [];
      const fields = Object.entries(changes).map(([key, value]) => {
        values.push(key === 'examples' ? JSON.stringify(value) : value);
        return `${columns[key]} = $${values.length}`;
      });
      fields.push('updated_at = NOW()');
      values.push(entryId, mappingSetId);
      const updated = await client.query(
        `UPDATE integration_mapping_entries SET ${fields.join(', ')}
          WHERE id = $${values.length - 1} AND mapping_set_id = $${values.length}
          RETURNING id, source_path AS "sourcePath", source_type AS "sourceType", target_path AS "targetPath",
                    target_type AS "targetType", direction, transformation, fallback_value AS "fallbackValue",
                    is_required AS "isRequired", notes, examples, section, mapping_status AS "mappingStatus",
                    sort_order AS "sortOrder", updated_at AS "updatedAt"`,
        values,
      );
      const revision = await invalidateApprovalAndAdvance(client, mappingSetId, expectedRevision);
      const updatedEntry = updated.rows[0];
      await recordMappingChange({ db: client, mappingSetId, actorUserId: null, actorRole: 'system', action: 'update', entityType: 'mapping_entry', entityId: entryId, summary: 'Vínculo atualizado pelo agente via MCP', beforeData: before.rows[0], afterData: updatedEntry, mappingRevision: revision.revision, clientVisible: true });
      await writeAudit(client, { companyId, action: 'mapping.mcp.update_entry', resourceType: 'mapping_entry', resourceId: entryId, metadata: { mappingSetId, fields: Object.keys(changes), previousRevision: expectedRevision, revision: revision.revision } });
      await enqueueMappingEvent(client, { companyId, mappingSetId, type: 'mapping.entry.updated', eventId: `mcp:${companyId}:update_mapping_entry:${input.idempotencyKey}`, data: { entryId, entryReference: entryReference(entryId).externalReference, fields: Object.keys(changes), previousRevision: expectedRevision, revision: revision.revision } });
      return { mappingEntry: updatedEntry, ...entryReference(entryId), evidence: { companyId, mappingSetId, mappingReference: mappingReference(mappingSetId).externalReference, previousRevision: expectedRevision, revision: revision.revision } };
    },
  });
}

async function addMappingComment({ companyId, input }) {
  const mappingSetId = positiveId(input.mappingSetId, 'mappingSetId');
  const expectedRevision = requiredRevision(input.expectedRevision);
  const message = requiredText(input.message, 'Comentário', 2000);
  return withIdempotentEffect({
    companyId,
    toolName: 'add_mapping_comment',
    idempotencyKey: input.idempotencyKey,
    input,
    execute: async client => {
      const mapping = await lockMapping(client, companyId, mappingSetId, expectedRevision);
      if (mapping.status === 'archived') throw domainError('Não é possível comentar um mapeamento arquivado.', 'INVALID_STATE', 409);
      const change = await recordMappingChange({ db: client, mappingSetId, actorUserId: null, actorRole: 'system', action: 'comment', entityType: 'comment', summary: message, afterData: { message, source: 'mcp' }, changedFields: [], mappingRevision: expectedRevision, clientVisible: true });
      await writeAudit(client, { companyId, action: 'mapping.mcp.comment', resourceType: 'mapping_set', resourceId: mappingSetId, metadata: { changeId: change.id, revision: expectedRevision } });
      await enqueueMappingEvent(client, { companyId, mappingSetId, type: 'mapping.comment.created', eventId: `mcp:${companyId}:add_mapping_comment:${input.idempotencyKey}`, data: { changeId: change.id, revision: expectedRevision } });
      return { comment: { id: change.id, message, mappingRevision: expectedRevision, createdAt: change.createdAt }, type: 'mapping-comment', id: String(change.id), externalReference: `lambda-pulse:mapping-comment:${change.id}`, evidence: { companyId, mappingSetId, mappingReference: mappingReference(mappingSetId).externalReference, revision: expectedRevision } };
    },
  });
}

async function assertMappingHasContent(client, mappingSetId) {
  const result = await client.query(
    `SELECT
       NULLIF(BTRIM(content_markdown), '') IS NOT NULL
       OR EXISTS(SELECT 1 FROM integration_mapping_entries WHERE mapping_set_id = $1)
       OR EXISTS(SELECT 1 FROM integration_mapping_attachments WHERE mapping_set_id = $1) AS has_content
     FROM integration_mapping_sets WHERE id = $1`,
    [mappingSetId],
  );
  if (!result.rows[0]?.has_content) throw domainError('Adicione conteúdo, vínculos ou arquivos antes de solicitar revisão.', 'INVALID_STATE', 409);
}

async function requestMappingReview({ companyId, input }) {
  const mappingSetId = positiveId(input.mappingSetId, 'mappingSetId');
  const expectedRevision = requiredRevision(input.expectedRevision);
  const note = optionalText(input.note, 2000);
  return withIdempotentEffect({
    companyId,
    toolName: 'request_mapping_review',
    idempotencyKey: input.idempotencyKey,
    input,
    execute: async client => {
      await lockMapping(client, companyId, mappingSetId, expectedRevision, { requireDraft: true });
      await assertMappingHasContent(client, mappingSetId);
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
          WHERE id = $2 AND revision = $3
          RETURNING id, version, revision, status, approval_status AS "approvalStatus",
                    approval_revision AS "approvalRevision", approval_requested_at AS "approvalRequestedAt",
                    updated_at AS "updatedAt"`,
        [note ?? null, mappingSetId, expectedRevision],
      );
      if (!result.rowCount) throw domainError('O mapeamento mudou durante a solicitação.', 'REVISION_CONFLICT', 409);
      const mapping = result.rows[0];
      await recordMappingChange({ db: client, mappingSetId, actorUserId: null, actorRole: 'system', action: 'review_request', entityType: 'mapping_set', entityId: mappingSetId, summary: note ? `Revisão solicitada pelo agente: ${note}` : 'Revisão solicitada pelo agente via MCP', beforeData: { approvalStatus: 'not_requested', revision: expectedRevision }, afterData: mapping, mappingRevision: mapping.revision, clientVisible: true });
      await writeAudit(client, { companyId, action: 'mapping.mcp.request_review', resourceType: 'mapping_set', resourceId: mappingSetId, metadata: { previousRevision: expectedRevision, revision: mapping.revision, approvalRevision: mapping.approvalRevision } });
      await enqueueMappingEvent(client, { companyId, mappingSetId, type: 'mapping.review.requested', eventId: `mcp:${companyId}:request_mapping_review:${input.idempotencyKey}`, data: { previousRevision: expectedRevision, revision: mapping.revision, approvalRevision: mapping.approvalRevision } });
      return { mappingSet: mapping, ...mappingReference(mappingSetId), evidence: { companyId, previousRevision: expectedRevision, revision: mapping.revision, approvalRevision: mapping.approvalRevision, approvalRequired: true } };
    },
  });
}

async function validatePublicationQuality(client, mapping) {
  const rules = { ...DEFAULT_VALIDATION_RULES, ...(mapping.validation_rules || {}) };
  const result = await client.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE mapping_status IN ('pending', 'attention'))::int AS unresolved,
            COUNT(*) FILTER (WHERE NULLIF(source_type, '') IS NULL OR NULLIF(target_type, '') IS NULL)::int AS missing_types,
            (SELECT COUNT(*)::int FROM (
              SELECT section, LOWER(source_path)
                FROM integration_mapping_entries
               WHERE mapping_set_id = $1 AND mapping_status <> 'ignored'
               GROUP BY section, LOWER(source_path) HAVING COUNT(*) > 1
            ) duplicates) AS duplicate_sources
       FROM integration_mapping_entries WHERE mapping_set_id = $1`,
    [mapping.id],
  );
  const quality = result.rows[0];
  const issues = [];
  if (rules.requireStructuredEntries && !Number(quality.total)) issues.push('adicione ao menos um vínculo estruturado');
  if (rules.blockUnresolved && Number(quality.unresolved)) issues.push(`resolva ${quality.unresolved} pendência(s)`);
  if (rules.blockDuplicateSources && Number(quality.duplicate_sources)) issues.push(`revise ${quality.duplicate_sources} origem(ns) duplicada(s)`);
  if (rules.requireTypes && Number(quality.missing_types)) issues.push(`informe os tipos de ${quality.missing_types} vínculo(s)`);
  if (issues.length) throw domainError(`A política de publicação exige que você ${issues.join('; ')}.`, 'PUBLICATION_POLICY_FAILED', 409);
  return quality;
}

async function publishMapping({ companyId, input }) {
  const mappingSetId = positiveId(input.mappingSetId, 'mappingSetId');
  const expectedRevision = requiredRevision(input.expectedRevision);
  return withIdempotentEffect({
    companyId,
    toolName: 'publish_mapping',
    idempotencyKey: input.idempotencyKey,
    input,
    execute: async client => {
      const mapping = await lockMapping(client, companyId, mappingSetId, expectedRevision, { requireDraft: true });
      if (mapping.approval_status !== 'approved' || Number(mapping.approval_revision) !== expectedRevision || !mapping.approved_by) {
        throw domainError('A publicação exige aprovação humana explícita para esta revisão exata.', 'APPROVAL_REQUIRED', 409);
      }
      await assertMappingHasContent(client, mappingSetId);
      const quality = await validatePublicationQuality(client, mapping);
      const archived = await client.query(
        `UPDATE integration_mapping_sets
            SET status = 'archived', closed_at = NOW(), revision = revision + 1, updated_at = NOW()
          WHERE integration_id = $1 AND name = $2 AND status = 'published' AND id <> $3
          RETURNING id, revision`,
        [mapping.integration_id, mapping.name, mappingSetId],
      );
      for (const previous of archived.rows || []) {
        await recordMappingChange({ db: client, mappingSetId: previous.id, actorUserId: null, actorRole: 'system', action: 'archive', entityType: 'mapping_set', entityId: previous.id, summary: 'Versão substituída por publicação aprovada via MCP', beforeData: { status: 'published' }, afterData: { status: 'archived' }, mappingRevision: previous.revision, clientVisible: true });
      }
      const published = await client.query(
        `UPDATE integration_mapping_sets
            SET status = 'published', published_at = NOW(),
                closed_at = CASE WHEN client_edit_mode = 'none' THEN NOW() ELSE NULL END,
                revision = revision + 1, updated_at = NOW()
          WHERE id = $1 AND revision = $2
          RETURNING id, integration_id AS "integrationId", process_id AS "processId", name, version, revision,
                    status, approval_status AS "approvalStatus", approval_revision AS "approvedRevision",
                    approved_at AS "approvedAt", approved_by AS "approvedBy", published_at AS "publishedAt",
                    updated_at AS "updatedAt"`,
        [mappingSetId, expectedRevision],
      );
      if (!published.rowCount) throw domainError('O mapeamento mudou durante a publicação.', 'REVISION_CONFLICT', 409);
      const result = published.rows[0];
      await recordMappingChange({ db: client, mappingSetId, actorUserId: null, actorRole: 'system', action: 'publish', entityType: 'mapping_set', entityId: mappingSetId, summary: 'Versão aprovada publicada pelo agente via MCP', beforeData: { status: mapping.status, revision: expectedRevision }, afterData: result, mappingRevision: result.revision, clientVisible: true });
      await writeAudit(client, { companyId, action: 'mapping.mcp.publish', resourceType: 'mapping_set', resourceId: mappingSetId, metadata: { approvedRevision: expectedRevision, publishedRevision: result.revision, approvedBy: result.approvedBy, archivedMappingSetIds: (archived.rows || []).map(item => item.id), quality } });
      await enqueueMappingEvent(client, { companyId, mappingSetId, type: 'mapping.published', eventId: `mcp:${companyId}:publish_mapping:${input.idempotencyKey}`, data: { integrationId: result.integrationId, processId: result.processId, version: result.version, approvedRevision: expectedRevision, revision: result.revision, approvedBy: result.approvedBy } });
      return { mappingSet: result, ...mappingReference(mappingSetId), evidence: { companyId, integrationId: result.integrationId, processId: result.processId, version: result.version, approvedRevision: expectedRevision, revision: result.revision, approvedBy: result.approvedBy, publishedAt: result.publishedAt } };
    },
  });
}

module.exports = {
  createMappingDraft,
  updateMappingDraft,
  proposeMappingEntry,
  updateMappingEntry,
  addMappingComment,
  requestMappingReview,
  publishMapping,
  mappingReference,
  entryReference,
};
