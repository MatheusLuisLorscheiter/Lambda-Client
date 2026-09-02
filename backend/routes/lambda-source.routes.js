const express = require('express');
const { authenticateToken } = require('./auth');
const { pool, query } = require('../db');
const { logAudit } = require('../audit/logger');
const { getIntegrationForUser } = require('../services/integrations');
const {
  fetchLambdaArchive,
  extractEditableFiles,
  normalizeDraftFiles,
  normalizeDeletedFiles,
  publishSourceRevision
} = require('../services/lambdaSource');

const router = express.Router();

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Acesso de administrador obrigatório' });
  next();
};

const positiveId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const serializeRevision = (row, includeFiles = false) => ({
  id: Number(row.id),
  integrationId: row.integration_id,
  revision: row.revision,
  status: row.status,
  baseCodeSha256: row.base_code_sha256,
  summary: row.summary,
  changedFiles: Object.keys(row.files || {}),
  deletedFiles: row.deleted_files || [],
  ...(includeFiles ? { files: row.files || {} } : {}),
  createdBy: row.created_by,
  reviewRequestedAt: row.review_requested_at,
  approvedAt: row.approved_at,
  approvedBy: row.approved_by,
  approvalNote: row.approval_note,
  publishedAt: row.published_at,
  publishedBy: row.published_by,
  awsCodeSha256: row.aws_code_sha256,
  errorMessage: row.error_message,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const getRevision = async (revisionId, integrationId) => {
  const result = await query('SELECT * FROM lambda_source_revisions WHERE id = $1 AND integration_id = $2', [revisionId, integrationId]);
  return result.rows[0] || null;
};

router.get('/integrations/:integrationId/source', authenticateToken, requireAdmin, async (req, res) => {
  const integrationId = positiveId(req.params.integrationId);
  const integration = integrationId && await getIntegrationForUser(integrationId, req.user);
  if (!integration) return res.status(404).json({ error: 'Integração não encontrada.' });
  try {
    const snapshot = await fetchLambdaArchive(integration);
    const source = extractEditableFiles(snapshot.archive);
    await logAudit({ companyId: integration.company_id, userId: req.user.id, action: 'lambda.source.read', resourceType: 'integration', resourceId: String(integrationId), metadata: { codeSha256: snapshot.configuration.CodeSha256, editableFileCount: Object.keys(source.files).length, excludedFileCount: source.excluded.length }, ipAddress: req.ip, userAgent: req.get('user-agent') });
    res.json({
      integrationId,
      functionName: integration.function_name,
      region: integration.region,
      runtime: snapshot.configuration.Runtime || null,
      handler: snapshot.configuration.Handler || null,
      codeSha256: snapshot.configuration.CodeSha256 || null,
      revisionId: snapshot.configuration.RevisionId || null,
      lastModified: snapshot.configuration.LastModified || null,
      files: source.files,
      excludedFiles: source.excluded,
      editableBytes: source.editableBytes
    });
  } catch (error) {
    res.status(error.statusCode || 502).json({ error: error.message || 'Não foi possível carregar o código da função.' });
  }
});

router.get('/integrations/:integrationId/source/revisions', authenticateToken, requireAdmin, async (req, res) => {
  const integrationId = positiveId(req.params.integrationId);
  const integration = integrationId && await getIntegrationForUser(integrationId, req.user);
  if (!integration) return res.status(404).json({ error: 'Integração não encontrada.' });
  const result = await query('SELECT * FROM lambda_source_revisions WHERE integration_id = $1 ORDER BY revision DESC LIMIT 50', [integrationId]);
  res.json({ revisions: result.rows.map(row => serializeRevision(row, false)) });
});

router.get('/integrations/:integrationId/source/revisions/:revisionId', authenticateToken, requireAdmin, async (req, res) => {
  const integrationId = positiveId(req.params.integrationId);
  const revisionId = positiveId(req.params.revisionId);
  const integration = integrationId && await getIntegrationForUser(integrationId, req.user);
  if (!integration) return res.status(404).json({ error: 'Integração não encontrada.' });
  const revision = revisionId && await getRevision(revisionId, integrationId);
  if (!revision) return res.status(404).json({ error: 'Revisão não encontrada.' });
  res.json({ revision: serializeRevision(revision, true) });
});

router.post('/integrations/:integrationId/source/revisions', authenticateToken, requireAdmin, async (req, res) => {
  const integrationId = positiveId(req.params.integrationId);
  const integration = integrationId && await getIntegrationForUser(integrationId, req.user);
  if (!integration) return res.status(404).json({ error: 'Integração não encontrada.' });
  try {
    const files = normalizeDraftFiles(req.body.files);
    const deletedFiles = normalizeDeletedFiles(req.body.deletedFiles);
    const summary = String(req.body.summary || '').trim();
    if (!summary || summary.length > 1000) return res.status(400).json({ error: 'Informe um resumo de até 1.000 caracteres.' });
    if (deletedFiles.some(name => Object.hasOwn(files, name))) return res.status(400).json({ error: 'Um arquivo não pode ser alterado e removido na mesma revisão.' });

    const snapshot = await fetchLambdaArchive(integration);
    const baseCodeSha256 = snapshot.configuration.CodeSha256;
    if (!baseCodeSha256) throw new Error('A AWS não retornou o hash do código atual.');
    if (req.body.baseCodeSha256 && req.body.baseCodeSha256 !== baseCodeSha256) {
      return res.status(409).json({ error: 'O código na AWS mudou. Recarregue o workspace antes de salvar.' });
    }

    const client = await pool.connect();
    let created;
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`lambda-source-revision:${integrationId}`]);
      created = await client.query(
        `INSERT INTO lambda_source_revisions
          (integration_id, revision, status, base_code_sha256, files, deleted_files, summary, created_by)
         VALUES ($1, (SELECT COALESCE(MAX(revision), 0) + 1 FROM lambda_source_revisions WHERE integration_id = $1),
                 'draft', $2, $3, $4, $5, $6)
         RETURNING *`,
        [integrationId, baseCodeSha256, JSON.stringify(files), JSON.stringify(deletedFiles), summary, req.user.id]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    const revision = created.rows[0];
    await logAudit({ companyId: integration.company_id, userId: req.user.id, action: 'lambda.source.revision.create', resourceType: 'lambda_source_revision', resourceId: String(revision.id), metadata: { integrationId, revision: revision.revision, changedFiles: Object.keys(files), deletedFiles, baseCodeSha256 }, ipAddress: req.ip, userAgent: req.get('user-agent') });
    res.status(201).json({ revision: serializeRevision(revision, true) });
  } catch (error) {
    res.status(error.statusCode || 502).json({ error: error.message || 'Não foi possível criar a revisão.' });
  }
});

router.post('/integrations/:integrationId/source/revisions/:revisionId/request-review', authenticateToken, requireAdmin, async (req, res) => {
  const integrationId = positiveId(req.params.integrationId);
  const revisionId = positiveId(req.params.revisionId);
  const integration = integrationId && await getIntegrationForUser(integrationId, req.user);
  if (!integration) return res.status(404).json({ error: 'Integração não encontrada.' });
  const result = await query("UPDATE lambda_source_revisions SET status = 'pending_review', review_requested_at = NOW(), updated_at = NOW() WHERE id = $1 AND integration_id = $2 AND status = 'draft' RETURNING *", [revisionId, integrationId]);
  if (!result.rowCount) return res.status(409).json({ error: 'Somente um rascunho pode ser enviado para revisão.' });
  await logAudit({ companyId: integration.company_id, userId: req.user.id, action: 'lambda.source.review.request', resourceType: 'lambda_source_revision', resourceId: String(revisionId), metadata: { integrationId, revision: result.rows[0].revision }, ipAddress: req.ip, userAgent: req.get('user-agent') });
  res.json({ revision: serializeRevision(result.rows[0]) });
});

router.post('/integrations/:integrationId/source/revisions/:revisionId/approve', authenticateToken, requireAdmin, async (req, res) => {
  const integrationId = positiveId(req.params.integrationId);
  const revisionId = positiveId(req.params.revisionId);
  const integration = integrationId && await getIntegrationForUser(integrationId, req.user);
  if (!integration) return res.status(404).json({ error: 'Integração não encontrada.' });
  const note = String(req.body.note || '').trim().slice(0, 1000);
  const result = await query("UPDATE lambda_source_revisions SET status = 'approved', approved_at = NOW(), approved_by = $1, approval_note = $2, updated_at = NOW() WHERE id = $3 AND integration_id = $4 AND status = 'pending_review' RETURNING *", [req.user.id, note || null, revisionId, integrationId]);
  if (!result.rowCount) return res.status(409).json({ error: 'Somente uma revisão pendente pode ser aprovada.' });
  await logAudit({ companyId: integration.company_id, userId: req.user.id, action: 'lambda.source.review.approve', resourceType: 'lambda_source_revision', resourceId: String(revisionId), metadata: { integrationId, revision: result.rows[0].revision }, ipAddress: req.ip, userAgent: req.get('user-agent') });
  res.json({ revision: serializeRevision(result.rows[0]) });
});

router.post('/integrations/:integrationId/source/revisions/:revisionId/reject', authenticateToken, requireAdmin, async (req, res) => {
  const integrationId = positiveId(req.params.integrationId);
  const revisionId = positiveId(req.params.revisionId);
  const integration = integrationId && await getIntegrationForUser(integrationId, req.user);
  if (!integration) return res.status(404).json({ error: 'Integração não encontrada.' });
  const note = String(req.body.note || '').trim().slice(0, 1000);
  if (!note) return res.status(400).json({ error: 'Informe o motivo da rejeição.' });
  const result = await query("UPDATE lambda_source_revisions SET status = 'rejected', approval_note = $1, updated_at = NOW() WHERE id = $2 AND integration_id = $3 AND status = 'pending_review' RETURNING *", [note, revisionId, integrationId]);
  if (!result.rowCount) return res.status(409).json({ error: 'Somente uma revisão pendente pode ser rejeitada.' });
  await logAudit({ companyId: integration.company_id, userId: req.user.id, action: 'lambda.source.review.reject', resourceType: 'lambda_source_revision', resourceId: String(revisionId), metadata: { integrationId, revision: result.rows[0].revision, note }, ipAddress: req.ip, userAgent: req.get('user-agent') });
  res.json({ revision: serializeRevision(result.rows[0]) });
});

router.post('/integrations/:integrationId/source/revisions/:revisionId/publish', authenticateToken, requireAdmin, async (req, res) => {
  const integrationId = positiveId(req.params.integrationId);
  const revisionId = positiveId(req.params.revisionId);
  const integration = integrationId && await getIntegrationForUser(integrationId, req.user);
  if (!integration) return res.status(404).json({ error: 'Integração não encontrada.' });
  const claimed = await query("UPDATE lambda_source_revisions SET status = 'publishing', error_message = NULL, updated_at = NOW() WHERE id = $1 AND integration_id = $2 AND status IN ('approved', 'failed') RETURNING *", [revisionId, integrationId]);
  if (!claimed.rowCount) return res.status(409).json({ error: 'A publicação exige uma revisão aprovada (ou uma tentativa anterior que falhou).' });
  const revision = claimed.rows[0];
  try {
    const awsResult = await publishSourceRevision({ integration, revision });
    const updated = await query("UPDATE lambda_source_revisions SET status = 'published', published_at = NOW(), published_by = $1, aws_code_sha256 = $2, updated_at = NOW() WHERE id = $3 RETURNING *", [req.user.id, awsResult.CodeSha256 || null, revisionId]);
    await logAudit({ companyId: integration.company_id, userId: req.user.id, action: 'lambda.source.publish', resourceType: 'lambda_source_revision', resourceId: String(revisionId), metadata: { integrationId, revision: revision.revision, functionVersion: awsResult.Version || null, awsCodeSha256: awsResult.CodeSha256 || null }, ipAddress: req.ip, userAgent: req.get('user-agent') });
    res.json({ revision: serializeRevision(updated.rows[0]), functionVersion: awsResult.Version || null, lastUpdateStatus: awsResult.LastUpdateStatus || null });
  } catch (error) {
    await query("UPDATE lambda_source_revisions SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2", [String(error.message || 'Falha na publicação').slice(0, 2000), revisionId]);
    await logAudit({ companyId: integration.company_id, userId: req.user.id, action: 'lambda.source.publish_failed', resourceType: 'lambda_source_revision', resourceId: String(revisionId), metadata: { integrationId, revision: revision.revision, errorCode: error.code || error.name || 'UNKNOWN' }, ipAddress: req.ip, userAgent: req.get('user-agent') });
    res.status(error.statusCode || 502).json({ error: error.message || 'Não foi possível publicar a revisão.', code: error.code || 'AWS_PUBLISH_FAILED' });
  }
});

module.exports = router;
