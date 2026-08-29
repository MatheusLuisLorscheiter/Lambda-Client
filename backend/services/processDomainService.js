const crypto = require('crypto');
const { pool } = require('../db');

const PROCESS_STATUSES = new Set(['requested', 'analysis', 'queued', 'in_progress', 'validation', 'delivered', 'paused', 'cancelled']);
const PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);
const HEALTH = new Set(['on_track', 'at_risk', 'off_track', 'blocked']);
const CHECKLIST_STATUSES = new Set(['todo', 'in_progress', 'done', 'blocked']);
const DELIVERY_STATUSES = new Set(['draft', 'ready', 'accepted', 'rejected']);
const DELIVERY_ENVIRONMENTS = new Set(['development', 'staging', 'production']);

function domainError(message, code = 'VALIDATION_ERROR', status = 400) {
  return Object.assign(new Error(message), { code, status });
}

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

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(',')}}`;
}

function hash(value) { return crypto.createHash('sha256').update(stable(value)).digest('hex'); }
function reference(entity, id) { return { type: entity, id: String(id), externalReference: `lambda-pulse:${entity}:${id}` }; }

async function withIdempotentEffect({ companyId, toolName, idempotencyKey, input, execute }) {
  const key = requiredText(idempotencyKey, 'idempotencyKey', 240);
  const requestHash = hash(input);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [String(companyId), `${toolName}:${key}`]);
    const existing = await client.query(
      'SELECT request_hash, status, response FROM mcp_tool_effects WHERE company_id = $1 AND tool_name = $2 AND idempotency_key = $3',
      [companyId, toolName, key]
    );
    if (existing.rows[0]) {
      if (existing.rows[0].request_hash !== requestHash) throw domainError('A chave de idempotência já foi usada com outros argumentos.', 'IDEMPOTENCY_CONFLICT', 409);
      if (existing.rows[0].status === 'committed') { await client.query('COMMIT'); return { ...existing.rows[0].response, idempotentReplay: true }; }
      throw domainError('O efeito desta chave ainda está em processamento.', 'EFFECT_IN_PROGRESS', 409);
    }
    await client.query(
      `INSERT INTO mcp_tool_effects (company_id, tool_name, idempotency_key, request_hash, status)
       VALUES ($1, $2, $3, $4, 'processing')`,
      [companyId, toolName, key, requestHash]
    );
    const result = await execute(client);
    await client.query(
      `UPDATE mcp_tool_effects SET status = 'committed', response = $1, updated_at = NOW()
       WHERE company_id = $2 AND tool_name = $3 AND idempotency_key = $4`,
      [JSON.stringify(result), companyId, toolName, key]
    );
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

async function lockProcess(client, companyId, processId, expectedVersion) {
  const result = await client.query('SELECT id, company_id, status, progress, version FROM process_items WHERE id = $1 AND company_id = $2 FOR UPDATE', [processId, companyId]);
  const process = result.rows[0];
  if (!process) throw domainError('Processo não encontrado nesta empresa.', 'NOT_FOUND', 404);
  if (expectedVersion !== undefined && Number(expectedVersion) !== Number(process.version)) throw domainError('O processo foi atualizado por outra operação.', 'VERSION_CONFLICT', 409);
  return process;
}

async function createProcessRequest({ companyId, input }) {
  const title = requiredText(input.title, 'Título', 160);
  const description = requiredText(input.description, 'Descrição', 5000);
  const category = ['automation', 'integration', 'maintenance', 'improvement', 'support'].includes(input.category) ? input.category : 'automation';
  return withIdempotentEffect({ companyId, toolName: 'create_process_request', idempotencyKey: input.idempotencyKey, input, execute: async client => {
    const created = await client.query(
      `INSERT INTO process_items
        (company_id, requested_by, title, description, objective, scope, acceptance_criteria, category, status,
         priority, impact, health, progress, tags, is_client_visible, client_can_comment, client_can_manage_effort)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, 'requested', 'normal', 'medium', 'on_track', 0, $8, TRUE, TRUE, TRUE)
       RETURNING id, version`,
      [companyId, title, description, optionalText(input.objective, 3000) ?? null, optionalText(input.scope, 5000) ?? null, optionalText(input.acceptanceCriteria, 5000) ?? null, category, JSON.stringify(Array.isArray(input.tags) ? input.tags.slice(0, 20) : [])]
    );
    const processId = created.rows[0].id;
    await client.query(`UPDATE process_items SET reference_code = 'LP-' || LPAD(id::text, 6, '0') WHERE id = $1`, [processId]);
    const entity = await client.query('SELECT id, reference_code AS "referenceCode", title, description, status, version, created_at AS "createdAt", updated_at AS "updatedAt" FROM process_items WHERE id = $1', [processId]);
    return { process: entity.rows[0], ...reference('process', processId), evidence: { companyId, version: entity.rows[0].version, createdAt: entity.rows[0].createdAt } };
  }});
}

async function updateProcess({ companyId, input }) {
  const processId = positiveId(input.processId, 'processId');
  if (input.expectedVersion === undefined) throw domainError('expectedVersion é obrigatório.');
  return withIdempotentEffect({ companyId, toolName: 'update_process', idempotencyKey: input.idempotencyKey, input, execute: async client => {
    await lockProcess(client, companyId, processId, input.expectedVersion);
    const fields = []; const values = [];
    const add = (column, value) => { values.push(value); fields.push(`${column} = $${values.length}`); };
    if (input.title !== undefined) add('title', requiredText(input.title, 'Título', 160));
    if (input.description !== undefined) add('description', requiredText(input.description, 'Descrição', 5000));
    if (input.status !== undefined) { if (!PROCESS_STATUSES.has(input.status)) throw domainError('Status inválido.'); add('status', input.status); }
    if (input.priority !== undefined) { if (!PRIORITIES.has(input.priority)) throw domainError('Prioridade inválida.'); add('priority', input.priority); }
    if (input.health !== undefined) { if (!HEALTH.has(input.health)) throw domainError('Saúde inválida.'); add('health', input.health); }
    if (input.progress !== undefined) { const progress = Number(input.progress); if (!Number.isInteger(progress) || progress < 0 || progress > 100) throw domainError('Progresso inválido.'); add('progress', progress); }
    if (input.latestUpdate !== undefined) add('latest_update', optionalText(input.latestUpdate, 5000));
    if (!fields.length) throw domainError('Nenhuma alteração informada.');
    fields.push('version = version + 1', 'updated_at = NOW()'); values.push(processId, companyId, Number(input.expectedVersion));
    const updated = await client.query(
      `UPDATE process_items SET ${fields.join(', ')} WHERE id = $${values.length - 2} AND company_id = $${values.length - 1} AND version = $${values.length}
       RETURNING id, reference_code AS "referenceCode", title, status, priority, health, progress, latest_update AS "latestUpdate", version, updated_at AS "updatedAt"`, values
    );
    if (!updated.rowCount) throw domainError('O processo foi atualizado por outra operação.', 'VERSION_CONFLICT', 409);
    return { process: updated.rows[0], ...reference('process', processId), evidence: { companyId, previousVersion: Number(input.expectedVersion), version: updated.rows[0].version, updatedAt: updated.rows[0].updatedAt } };
  }});
}

async function addProcessComment({ companyId, input }) {
  const processId = positiveId(input.processId, 'processId'); const message = requiredText(input.message, 'Comentário', 5000);
  if (input.expectedVersion === undefined) throw domainError('expectedVersion é obrigatório.');
  return withIdempotentEffect({ companyId, toolName: 'add_process_comment', idempotencyKey: input.idempotencyKey, input, execute: async client => {
    await lockProcess(client, companyId, processId, input.expectedVersion);
    const result = await client.query(`INSERT INTO process_updates (process_id, author_user_id, kind, visibility, message, metadata) VALUES ($1, NULL, 'comment', 'client', $2, $3) RETURNING id, kind, visibility, message, created_at AS "createdAt"`, [processId, message, JSON.stringify({ source: 'mcp' })]);
    const version = await client.query('UPDATE process_items SET version = version + 1, updated_at = NOW() WHERE id = $1 RETURNING version, updated_at AS "updatedAt"', [processId]);
    return { comment: result.rows[0], ...reference('process-comment', result.rows[0].id), evidence: { companyId, processId, version: version.rows[0].version, updatedAt: version.rows[0].updatedAt } };
  }});
}

async function createChecklistItem({ companyId, input }) {
  const processId = positiveId(input.processId, 'processId'); const title = requiredText(input.title, 'Título', 240);
  if (input.expectedVersion === undefined) throw domainError('expectedVersion é obrigatório.');
  return withIdempotentEffect({ companyId, toolName: 'create_checklist_item', idempotencyKey: input.idempotencyKey, input, execute: async client => {
    await lockProcess(client, companyId, processId, input.expectedVersion);
    const sort = await client.query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM process_checklist_items WHERE process_id = $1', [processId]);
    const result = await client.query(`INSERT INTO process_checklist_items (process_id, title, description, status, sort_order, version) VALUES ($1, $2, $3, 'todo', $4, 1) RETURNING id, title, description, status, sort_order AS "sortOrder", version, created_at AS "createdAt"`, [processId, title, optionalText(input.description, 3000) ?? null, Number(sort.rows[0].value)]);
    const version = await client.query('UPDATE process_items SET version = version + 1, updated_at = NOW() WHERE id = $1 RETURNING version', [processId]);
    return { checklistItem: result.rows[0], ...reference('checklist-item', result.rows[0].id), evidence: { companyId, processId, processVersion: version.rows[0].version, version: result.rows[0].version } };
  }});
}

async function updateChecklistItem({ companyId, input }) {
  const processId = positiveId(input.processId, 'processId'); const itemId = positiveId(input.itemId, 'itemId');
  if (input.expectedVersion === undefined) throw domainError('expectedVersion é obrigatório.');
  return withIdempotentEffect({ companyId, toolName: 'update_checklist_item', idempotencyKey: input.idempotencyKey, input, execute: async client => {
    await lockProcess(client, companyId, processId);
    const fields = []; const values = []; const add = (column, value) => { values.push(value); fields.push(`${column} = $${values.length}`); };
    if (input.title !== undefined) add('title', requiredText(input.title, 'Título', 240));
    if (input.description !== undefined) add('description', optionalText(input.description, 3000));
    if (input.status !== undefined) { if (!CHECKLIST_STATUSES.has(input.status)) throw domainError('Status inválido.'); add('status', input.status); add('completed_at', input.status === 'done' ? new Date() : null); }
    if (!fields.length) throw domainError('Nenhuma alteração informada.');
    fields.push('version = version + 1', 'updated_at = NOW()'); values.push(itemId, processId, Number(input.expectedVersion));
    const result = await client.query(`UPDATE process_checklist_items SET ${fields.join(', ')} WHERE id = $${values.length - 2} AND process_id = $${values.length - 1} AND version = $${values.length} RETURNING id, title, description, status, sort_order AS "sortOrder", version, updated_at AS "updatedAt"`, values);
    if (!result.rowCount) throw domainError('O item foi atualizado por outra operação.', 'VERSION_CONFLICT', 409);
    return { checklistItem: result.rows[0], ...reference('checklist-item', itemId), evidence: { companyId, processId, previousVersion: Number(input.expectedVersion), version: result.rows[0].version, updatedAt: result.rows[0].updatedAt } };
  }});
}

async function createDelivery({ companyId, input }) {
  const processId = positiveId(input.processId, 'processId'); const title = requiredText(input.title, 'Título', 240); const summary = requiredText(input.summary, 'Resumo', 5000);
  if (input.expectedVersion === undefined) throw domainError('expectedVersion é obrigatório.');
  const environment = DELIVERY_ENVIRONMENTS.has(input.environment) ? input.environment : 'production'; const status = input.status === 'draft' ? 'draft' : 'ready';
  return withIdempotentEffect({ companyId, toolName: 'create_delivery', idempotencyKey: input.idempotencyKey, input, execute: async client => {
    await lockProcess(client, companyId, processId, input.expectedVersion);
    const result = await client.query(`INSERT INTO process_deliveries (process_id, created_by, title, summary, version, environment, status, artifact_links, release_notes, rollback_plan, delivered_at, row_version) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1) RETURNING id, title, summary, version, environment, status, artifact_links AS "artifactLinks", row_version AS "rowVersion", delivered_at AS "deliveredAt", created_at AS "createdAt"`, [processId, title, summary, optionalText(input.version, 120) ?? null, environment, status, JSON.stringify(Array.isArray(input.artifactLinks) ? input.artifactLinks.slice(0, 20) : []), optionalText(input.releaseNotes, 5000) ?? null, optionalText(input.rollbackPlan, 5000) ?? null, status === 'ready' ? new Date() : null]);
    const processUpdate = await client.query(`UPDATE process_items SET status = CASE WHEN $1 = 'ready' THEN 'validation' ELSE status END, progress = CASE WHEN $1 = 'ready' THEN GREATEST(progress, 95) ELSE progress END, version = version + 1, updated_at = NOW() WHERE id = $2 RETURNING version`, [status, processId]);
    return { delivery: result.rows[0], ...reference('delivery', result.rows[0].id), evidence: { companyId, processId, processVersion: processUpdate.rows[0].version, version: result.rows[0].rowVersion, deliveredAt: result.rows[0].deliveredAt } };
  }});
}

async function reviewDelivery({ companyId, input }) {
  const processId = positiveId(input.processId, 'processId'); const deliveryId = positiveId(input.deliveryId, 'deliveryId');
  if (!['accepted', 'rejected'].includes(input.status)) throw domainError('A revisão deve aceitar ou rejeitar a entrega.');
  if (input.expectedVersion === undefined) throw domainError('expectedVersion é obrigatório.');
  const note = optionalText(input.acceptanceNote, 5000); if (input.status === 'rejected' && !note) throw domainError('Informe o ajuste necessário.');
  return withIdempotentEffect({ companyId, toolName: 'review_delivery', idempotencyKey: input.idempotencyKey, input, execute: async client => {
    const process = await lockProcess(client, companyId, processId);
    const result = await client.query(`UPDATE process_deliveries SET status = $1, acceptance_note = $2, accepted_at = CASE WHEN $1 = 'accepted' THEN NOW() ELSE NULL END, accepted_by = NULL, row_version = row_version + 1, updated_at = NOW() WHERE id = $3 AND process_id = $4 AND status = 'ready' AND row_version = $5 RETURNING id, title, status, acceptance_note AS "acceptanceNote", row_version AS "rowVersion", accepted_at AS "acceptedAt", updated_at AS "updatedAt"`, [input.status, note, deliveryId, processId, Number(input.expectedVersion)]);
    if (!result.rowCount) throw domainError('A entrega mudou ou não está aguardando revisão.', 'VERSION_CONFLICT', 409);
    const accepted = input.status === 'accepted';
    const processUpdate = await client.query(`UPDATE process_items SET status = $1, progress = $2, health = $3, delivered_at = $4, version = version + 1, updated_at = NOW() WHERE id = $5 RETURNING version, updated_at AS "updatedAt"`, [accepted ? 'delivered' : 'in_progress', accepted ? 100 : Math.min(Number(process.progress), 90), accepted ? 'on_track' : 'at_risk', accepted ? new Date() : null, processId]);
    return { delivery: result.rows[0], ...reference('delivery', deliveryId), evidence: { companyId, processId, processVersion: processUpdate.rows[0].version, previousVersion: Number(input.expectedVersion), version: result.rows[0].rowVersion, updatedAt: result.rows[0].updatedAt } };
  }});
}

module.exports = { createProcessRequest, updateProcess, addProcessComment, createChecklistItem, updateChecklistItem, createDelivery, reviewDelivery, domainError };
