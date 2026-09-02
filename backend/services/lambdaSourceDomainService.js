const { withIdempotentEffect, domainError } = require('./processDomainService');
const { normalizeDraftFiles, normalizeDeletedFiles } = require('./lambdaSource');

const positiveId = (value, label) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw domainError(`${label} inválido.`);
  return id;
};

const requiredText = (value, label, max) => {
  const text = String(value || '').trim();
  if (!text) throw domainError(`${label} é obrigatório.`);
  if (text.length > max) throw domainError(`${label} excede ${max} caracteres.`);
  return text;
};

const sourceRevisionReference = (id) => ({
  type: 'lambda-source-revision',
  id: String(id),
  externalReference: `lambda-pulse:lambda-source-revision:${id}`
});

async function proposeLambdaSourceRevision({ companyId, input }) {
  const integrationId = positiveId(input.integrationId, 'integrationId');
  const baseCodeSha256 = requiredText(input.baseCodeSha256, 'baseCodeSha256', 200);
  const summary = requiredText(input.summary, 'summary', 1000);
  const files = normalizeDraftFiles(input.files);
  const deletedFiles = normalizeDeletedFiles(input.deletedFiles);
  if (deletedFiles.some(name => Object.hasOwn(files, name))) throw domainError('Um arquivo não pode ser alterado e removido na mesma revisão.');

  return withIdempotentEffect({
    companyId,
    toolName: 'propose_lambda_source_revision',
    idempotencyKey: input.idempotencyKey,
    input,
    execute: async (client) => {
      const integration = await client.query('SELECT id FROM integrations WHERE id = $1 AND company_id = $2', [integrationId, companyId]);
      if (!integration.rows[0]) throw domainError('Integração não encontrada nesta empresa.', 'NOT_FOUND', 404);
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`lambda-source-revision:${integrationId}`]);
      const created = await client.query(
        `INSERT INTO lambda_source_revisions
          (integration_id, revision, status, base_code_sha256, files, deleted_files, summary, created_by)
         VALUES ($1, (SELECT COALESCE(MAX(revision), 0) + 1 FROM lambda_source_revisions WHERE integration_id = $1),
                 'draft', $2, $3, $4, $5, NULL)
         RETURNING id, integration_id, revision, status, base_code_sha256, summary, created_at`,
        [integrationId, baseCodeSha256, JSON.stringify(files), JSON.stringify(deletedFiles), summary]
      );
      const revision = created.rows[0];
      await client.query(
        `INSERT INTO audit_logs (company_id, action, resource_type, resource_id, metadata)
         VALUES ($1, 'lambda.source.mcp.propose', 'lambda_source_revision', $2, $3)`,
        [companyId, String(revision.id), JSON.stringify({ integrationId, revision: revision.revision, changedFiles: Object.keys(files), deletedFiles, baseCodeSha256 })]
      );
      return { revision, ...sourceRevisionReference(revision.id), evidence: { companyId, integrationId, revision: revision.revision, status: revision.status, approvalRequired: true } };
    }
  });
}

async function requestLambdaSourceReview({ companyId, input }) {
  const integrationId = positiveId(input.integrationId, 'integrationId');
  const revisionId = positiveId(input.revisionId, 'revisionId');
  return withIdempotentEffect({
    companyId,
    toolName: 'request_lambda_source_review',
    idempotencyKey: input.idempotencyKey,
    input,
    execute: async (client) => {
      const result = await client.query(
        `UPDATE lambda_source_revisions revision
            SET status = 'pending_review', review_requested_at = NOW(), updated_at = NOW()
           FROM integrations
          WHERE revision.id = $1 AND revision.integration_id = $2
            AND integrations.id = revision.integration_id AND integrations.company_id = $3
            AND revision.status = 'draft'
          RETURNING revision.id, revision.integration_id, revision.revision, revision.status, revision.review_requested_at`,
        [revisionId, integrationId, companyId]
      );
      if (!result.rows[0]) throw domainError('Somente um rascunho da empresa pode ser enviado para revisão.', 'INVALID_STATE', 409);
      const revision = result.rows[0];
      await client.query(
        `INSERT INTO audit_logs (company_id, action, resource_type, resource_id, metadata)
         VALUES ($1, 'lambda.source.mcp.request_review', 'lambda_source_revision', $2, $3)`,
        [companyId, String(revisionId), JSON.stringify({ integrationId, revision: revision.revision })]
      );
      return { revision, ...sourceRevisionReference(revisionId), evidence: { companyId, integrationId, revision: revision.revision, status: revision.status, approvalRequired: true } };
    }
  });
}

module.exports = { proposeLambdaSourceRevision, requestLambdaSourceReview, sourceRevisionReference };
