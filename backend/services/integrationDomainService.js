const { domainError, withIdempotentEffect } = require('./processDomainService');
const { normalizeDocumentationLinks } = require('./integrations');

const LIFECYCLE_STATUSES = new Set(['active', 'paused', 'maintenance']);

function optionalName(value) {
  if (value === undefined) return undefined;
  const name = String(value || '').trim();
  if (!name || name.length > 160) throw domainError('Nome da integração inválido.');
  return name;
}

async function updateIntegrationMetadata({ companyId, input }) {
  const integrationId = Number(input.integrationId);
  const expectedVersion = Number(input.expectedVersion);
  if (!Number.isInteger(integrationId) || integrationId <= 0) throw domainError('integrationId inválido.');
  if (!Number.isInteger(expectedVersion) || expectedVersion <= 0) throw domainError('expectedVersion é obrigatório.');

  const name = optionalName(input.name);
  const lifecycleStatus = input.lifecycleStatus === undefined ? undefined : String(input.lifecycleStatus);
  if (lifecycleStatus !== undefined && !LIFECYCLE_STATUSES.has(lifecycleStatus)) throw domainError('Estado operacional inválido.');
  const documentationLinks = input.documentationLinks === undefined
    ? undefined
    : normalizeDocumentationLinks(input.documentationLinks);
  if (documentationLinks?.some((link) => link.length > 2000)) throw domainError('Um link de documentação excede 2000 caracteres.');
  if (name === undefined && lifecycleStatus === undefined && documentationLinks === undefined) {
    throw domainError('Nenhuma alteração de metadados foi informada.');
  }

  return withIdempotentEffect({
    companyId,
    toolName: 'update_integration_metadata',
    idempotencyKey: input.idempotencyKey,
    input,
    execute: async (client) => {
      const currentResult = await client.query(
        'SELECT id, metadata_version FROM integrations WHERE id = $1 AND company_id = $2 FOR UPDATE',
        [integrationId, companyId],
      );
      const current = currentResult.rows[0];
      if (!current) throw domainError('Integração não encontrada nesta empresa.', 'NOT_FOUND', 404);
      if (Number(current.metadata_version) !== expectedVersion) {
        throw domainError('Os metadados da integração foram atualizados por outra operação.', 'VERSION_CONFLICT', 409);
      }

      const updated = await client.query(`
        UPDATE integrations
           SET name = COALESCE($1, name),
               lifecycle_status = COALESCE($2, lifecycle_status),
               documentation_links = COALESCE($3::jsonb, documentation_links),
               metadata_version = metadata_version + 1,
               updated_at = NOW()
         WHERE id = $4 AND company_id = $5 AND metadata_version = $6
         RETURNING id, name, function_name AS "functionName", region,
                   memory_mb AS "memoryMb", lifecycle_status AS "lifecycleStatus",
                   documentation_links AS "documentationLinks", metadata_version AS "metadataVersion",
                   updated_at AS "updatedAt"
      `, [
        name ?? null,
        lifecycleStatus ?? null,
        documentationLinks === undefined ? null : JSON.stringify(documentationLinks),
        integrationId,
        companyId,
        expectedVersion,
      ]);
      if (!updated.rowCount) throw domainError('Os metadados da integração foram atualizados por outra operação.', 'VERSION_CONFLICT', 409);

      const changedFields = [
        name !== undefined ? 'name' : null,
        lifecycleStatus !== undefined ? 'lifecycleStatus' : null,
        documentationLinks !== undefined ? 'documentationLinks' : null,
      ].filter(Boolean);
      await client.query(`
        INSERT INTO audit_logs (company_id, action, resource_type, resource_id, metadata)
        VALUES ($1, 'mcp.integration.metadata.update', 'integration', $2, $3)
      `, [companyId, String(integrationId), JSON.stringify({ changedFields, previousVersion: expectedVersion, version: updated.rows[0].metadataVersion })]);

      return {
        integration: updated.rows[0],
        type: 'integration',
        id: String(integrationId),
        externalReference: `lambda-pulse:integration:${integrationId}`,
        evidence: {
          companyId,
          previousVersion: expectedVersion,
          version: updated.rows[0].metadataVersion,
          updatedAt: updated.rows[0].updatedAt,
        },
      };
    },
  });
}

module.exports = { updateIntegrationMetadata };
