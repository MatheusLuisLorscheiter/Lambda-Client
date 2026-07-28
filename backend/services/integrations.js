const { query } = require('../db');

const getIntegrationForUser = async (integrationId, user) => {
  const result = await query(
    'SELECT id, name, function_name, region, memory_mb, show_cost_estimate, lifecycle_status, last_check_status, last_check_message, last_checked_at, documentation_links, access_key_encrypted, secret_key_encrypted, owner_user_id, client_user_id, company_id FROM integrations WHERE id = $1',
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
  normalizeDocumentationLinks
};
