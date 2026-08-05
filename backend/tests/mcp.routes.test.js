const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

delete process.env.REDIS_URL;

const hashes = {
  company: crypto.createHash('sha256').update('mcp_live_company').digest('hex'),
  delegated: crypto.createHash('sha256').update('mcp_live_delegated').digest('hex'),
};

const query = async (sql, params = []) => {
  if (sql.includes('WHERE cfg.api_key_hash')) {
    if (params[0] === hashes.company) {
      return { rows: [{ company_id: 1, company_name: 'Empresa Teste', is_enabled: true, allowed_domains: { logs: true, processes: true, mappings: true, integrations: true }, access_mode: 'company', require_contact_tag_match: false, max_requests_per_minute: 60 }] };
    }
    if (params[0] === hashes.delegated) {
      return { rows: [{ company_id: 99, company_name: 'CloudWhats', is_enabled: true, allowed_domains: { logs: true, processes: true, mappings: true, integrations: true }, access_mode: 'delegated', require_contact_tag_match: true, max_requests_per_minute: 60 }] };
    }
    return { rows: [] };
  }
  if (sql.includes('JOIN company_mcp_access_grants')) {
    if (String(params[1]).toLowerCase() === 'cliente@example.com') {
      return { rows: [{ id: 7, name: 'Cliente Alfa', allowed_domains: { logs: false, processes: true, mappings: true, integrations: true } }] };
    }
    return { rows: [] };
  }
  if (sql.includes('COUNT(*)::int AS count FROM integrations')) return { rows: [{ count: 3 }] };
  if (sql.includes('COUNT(*)::int AS count FROM process_items')) return { rows: [{ count: 5 }] };
  if (sql.includes('COUNT(*)::int AS count FROM integration_mapping_sets')) return { rows: [{ count: 2 }] };
  return { rows: [], rowCount: 0 };
};

const dbPath = require.resolve('../db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query } };
const router = require('../routes/mcp.routes');

const app = express();
app.use(express.json());
app.use((req, res, next) => { req.requestId = 'test-request'; next(); });
app.use('/mcp', router);
const httpServer = app.listen(0);
const port = httpServer.address().port;
const endpoint = new URL(`http://127.0.0.1:${port}/mcp`);

test.after(() => new Promise((resolve) => httpServer.close(resolve)));

async function withClient(token, handler) {
  const client = new Client({ name: 'lambda-pulse-test', version: '1.0.0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  try {
    return await handler(client);
  } finally {
    await client.close();
  }
}

test('bloqueia requisição sem Bearer e não aceita token em query string', async () => {
  const response = await fetch(`${endpoint}?token=mcp_live_company`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }),
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, -32001);
});

test('cliente MCP oficial inicializa, lista tools e executa chamada stateless', async () => {
  await withClient('mcp_live_company', async (client) => {
    const listed = await client.listTools();
    assert.ok(listed.tools.some((tool) => tool.name === 'get_company_summary'));
    const result = await client.callTool({ name: 'get_company_summary', arguments: {} });
    assert.equal(result.isError, undefined);
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.companyName, 'Empresa Teste');
    assert.equal(data.totalIntegrations, 3);
    assert.equal(data.totalVisibleProcesses, 5);
  });
});

test('acesso delegado falha fechado quando não há tag exata', async () => {
  await withClient('mcp_live_delegated', async (client) => {
    const result = await client.callTool({
      name: 'get_company_summary',
      arguments: { client_context: { email: 'cliente@example.com', labels: ['Outra Empresa'] } },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /tag do contato/i);
  });
});

test('concessão explícita e tag exata resolvem a empresa, aplicando as permissões do alvo', async () => {
  await withClient('mcp_live_delegated', async (client) => {
    const result = await client.callTool({
      name: 'get_company_summary',
      arguments: { client_context: { email: 'cliente@example.com', labels: ['Cliente Alfa'] } },
    });
    assert.equal(result.isError, undefined);
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.companyName, 'Cliente Alfa');
    assert.equal(data.totalIntegrations, 3);
    assert.equal(data.totalVisibleProcesses, 5);
    assert.equal(data.allowedDomains.logs, false);
  });
});

test('uma credencial diferente não pode publicar na sessão SSE de outra empresa', async () => {
  router._mcpInternals.legacySseSessions.set('session-company-1', {
    principalId: 1,
    tokenHash: hashes.company,
    transport: { handlePostMessage: async () => { throw new Error('não deveria executar'); } },
  });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/mcp/message?sessionId=session-company-1`, {
      method: 'POST',
      headers: { authorization: 'Bearer mcp_live_delegated', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/list' }),
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, -32007);
  } finally {
    router._mcpInternals.legacySseSessions.delete('session-company-1');
  }
});
