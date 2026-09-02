const { query } = require('../db');

const getIntegrationForUser = async (integrationId, user) => {
  const result = await query(
    `SELECT integrations.id, integrations.name, integrations.function_name, integrations.region,
            integrations.memory_mb, integrations.show_cost_estimate, integrations.lifecycle_status,
            integrations.last_check_status, integrations.last_check_message, integrations.last_checked_at,
            integrations.documentation_links, integrations.owner_user_id, integrations.client_user_id,
            integrations.company_id, integrations.aws_connection_id,
            aws_connections.name AS aws_connection_name,
            COALESCE(integrations.access_key_encrypted, aws_connections.access_key_encrypted) AS access_key_encrypted,
            COALESCE(integrations.secret_key_encrypted, aws_connections.secret_key_encrypted) AS secret_key_encrypted
       FROM integrations
       LEFT JOIN aws_connections ON aws_connections.id = integrations.aws_connection_id
      WHERE integrations.id = $1`,
    [integrationId]
  );

  const integration = result.rows[0];
  if (!integration) {
    return null;
  }

  if (user.role === 'admin') {
    return integration;
  }

  if (user.role === 'client' && integration.company_id === user.companyId) {
    return integration;
  }

  return null;
};

const buildAwsClientCredentials = (integration) => {
  if (!integration?.access_key_encrypted || !integration?.secret_key_encrypted) {
    const error = new Error('A integração não possui uma conexão AWS válida.');
    error.code = 'AWS_CONNECTION_MISSING';
    error.statusCode = 409;
    throw error;
  }
  const { decrypt } = require('../security/crypto');
  return {
    accessKeyId: decrypt(integration.access_key_encrypted),
    secretAccessKey: decrypt(integration.secret_key_encrypted)
  };
};

const normalizeDocumentationLinks = (input) => {
  if (input === undefined || input === null) {
    return [];
  }

  let items = [];
  if (Array.isArray(input)) {
    items = input;
  } else if (typeof input === 'string') {
    items = input.split(/\r?\n|,/g);
  } else {
    throw new Error('Formato de documentação inválido');
  }

  const normalized = items
    .map(item => String(item).trim())
    .filter(item => item.length > 0)
    .map(item => {
      let parsed;
      try {
        parsed = new URL(item);
      } catch {
        throw new Error(`Link inválido: ${item}`);
      }

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error(`Link inválido (protocolo): ${item}`);
      }

      return parsed.toString();
    });

  if (normalized.length > 20) {
    throw new Error('Limite de 20 links excedido');
  }

  return normalized;
};

module.exports = {
  getIntegrationForUser,
  buildAwsClientCredentials,
  normalizeDocumentationLinks
};
