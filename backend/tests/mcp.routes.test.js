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
      return { rows: [{ company_id: 1, company_name: 'Empresa Teste', is_enabled: true, allowed_domains: { logs: true, processes: true, mappings: true, integrations: true }, allowed_scopes: ['integrations:source:read'], access_mode: 'company', require_contact_tag_match: false, max_requests_per_minute: 60 }] };
    }
    if (params[0] === hashes.delegated) {
      return { rows: [{ company_id: 99, company_name: 'CloudWhats', is_enabled: true, allowed_domains: { logs: true, processes: true, mappings: true, integrations: true }, access_mode: 'delegated', require_contact_tag_match: true, max_requests_per_minute: 60 }] };
    }
    return { rows: [] };
  }
  if (sql.includes('FROM users') && sql.includes("role = 'client'")) {
    if (Number(params[0]) === 1) return { rows: [{ email: 'cliente@example.com' }, { email: 'financeiro@example.com' }] };
    if (Number(params[0]) === 99) return { rows: [{ email: 'operacao@cloudwhats.example' }] };
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
    assert.deepEqual(data.mcpAccess.authorizedClientEmails, ['cliente@example.com', 'financeiro@example.com']);
    assert.equal(data.mcpAccess.companyId, 1);
    assert.equal(data.mcpAccess.contactEmailMatched, null);
  });
});

test('tools de escrita só são publicadas na interseção de escopos da credencial', () => {
  const principal = {
    allowedDomains: { logs: true, processes: true, mappings: true, integrations: true },
    allowedScopes: new Set(['processes:create']),
  };
  const names = router._mcpInternals.publicToolsFor(principal).map((tool) => tool.name);
  assert.ok(names.includes('create_process_request'));
  assert.ok(!names.includes('update_process'));
  assert.ok(!names.includes('review_delivery'));
});

test('escopos de De-Para separam proposta, revisão e publicação', () => {
  const principal = {
    allowedDomains: { logs: true, processes: true, mappings: true, integrations: true },
    allowedScopes: new Set(['mappings:write', 'mappings:review']),
  };
  const names = router._mcpInternals.publicToolsFor(principal).map((tool) => tool.name);
  assert.ok(names.includes('create_mapping_draft'));
  assert.ok(names.includes('propose_mapping_entry'));
  assert.ok(names.includes('request_mapping_review'));
  assert.ok(!names.includes('publish_mapping'));
  assert.ok(!names.includes('add_mapping_comment'));
});

test('código da Lambda exige escopos explícitos e nunca publica pela credencial MCP', () => {
  const principal = {
    allowedDomains: { logs: true, processes: true, mappings: true, integrations: true },
    allowedScopes: new Set(['integrations:source:read', 'integrations:source:write', 'integrations:source:review']),
  };
  const names = router._mcpInternals.publicToolsFor(principal).map((tool) => tool.name);
  assert.ok(names.includes('get_lambda_source'));
  assert.ok(names.includes('list_lambda_source_revisions'));
  assert.ok(names.includes('propose_lambda_source_revision'));
  assert.ok(names.includes('request_lambda_source_review'));
  assert.ok(!names.some((name) => /approve|publish.*lambda|lambda.*publish/.test(name)));

  const withoutSourceScope = router._mcpInternals.publicToolsFor({ ...principal, allowedScopes: new Set() }).map((tool) => tool.name);
  assert.ok(!withoutSourceScope.includes('get_lambda_source'));
  assert.ok(!withoutSourceScope.includes('list_lambda_source_revisions'));
});

test('limite operacional não cobra mensagens de negociação do protocolo MCP', () => {
  const { isMeteredMcpRequest } = router._mcpInternals;
  assert.equal(isMeteredMcpRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' }), false);
  assert.equal(isMeteredMcpRequest({ jsonrpc: '2.0', method: 'notifications/initialized' }), false);
  assert.equal(isMeteredMcpRequest({ jsonrpc: '2.0', id: 2, method: 'ping' }), false);
  assert.equal(isMeteredMcpRequest({ jsonrpc: '2.0', id: 3, method: 'tools/list' }), true);
  assert.equal(isMeteredMcpRequest({ jsonrpc: '2.0', id: 4, method: 'tools/call' }), true);
});

test('histórico de revisões informa cobertura mesmo quando o período está vazio', async () => {
  await withClient('mcp_live_company', async (client) => {
    const result = await client.callTool({
      name: 'list_lambda_source_revisions',
      arguments: { since: '2026-08-01T00:00:00.000Z', until: '2026-09-01T00:00:00.000Z' },
    });
    assert.equal(result.isError, undefined);
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.total, 0);
    assert.equal(data.coverage.complete, true);
    assert.equal(data.coverage.since, '2026-08-01T00:00:00.000Z');
  });
});

test('configuração delegada antiga não troca o tenant identificado pela chave', async () => {
  await withClient('mcp_live_delegated', async (client) => {
    const result = await client.callTool({
      name: 'get_company_summary',
      arguments: { client_context: { email: 'cliente@example.com', labels: ['Cliente Alfa'] } },
    });
    assert.equal(result.isError, undefined);
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.companyName, 'CloudWhats');
    assert.equal(data.mcpAccess.companyId, 99);
    assert.deepEqual(data.mcpAccess.authorizedClientEmails, ['operacao@cloudwhats.example']);
    assert.equal(data.mcpAccess.contactEmailMatched, false);
  });
});

test('contexto opcional informa correspondência exata normalizada sem ser necessário para consultar', async () => {
  await withClient('mcp_live_company', async (client) => {
    const result = await client.callTool({
      name: 'get_company_summary',
      arguments: { client_context: { email: '  CLIENTE@EXAMPLE.COM  ' } },
    });
    assert.equal(result.isError, undefined);
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.companyName, 'Empresa Teste');
    assert.equal(data.mcpAccess.providedContactEmail, 'cliente@example.com');
    assert.equal(data.mcpAccess.contactEmailMatched, true);
    assert.equal(data.mcpAccess.emailMatchPolicy, 'exact_after_trim_and_lowercase');
  });
});

test('outras consultas também recebem o mesmo contexto de emails autorizados', async () => {
  await withClient('mcp_live_company', async (client) => {
    const result = await client.callTool({ name: 'list_processes_and_docs', arguments: {} });
    assert.equal(result.isError, undefined);
    const data = JSON.parse(result.content[0].text);
    assert.deepEqual(data.mcpAccess.authorizedClientEmails, ['cliente@example.com', 'financeiro@example.com']);
    assert.deepEqual(data.processes, []);
  });
});

test('uma consulta detalhada com email explícito divergente falha antes de ler dados', async () => {
  await withClient('mcp_live_company', async (client) => {
    const result = await client.callTool({
      name: 'list_processes_and_docs',
      arguments: { client_context: { email: 'nao-autorizado@example.com' } },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /não possui um email explícito autorizado/i);
  });
});

test('uma consulta detalhada com email explícito autorizado continua normalmente', async () => {
  await withClient('mcp_live_company', async (client) => {
    const result = await client.callTool({
      name: 'list_processes_and_docs',
      arguments: { client_context: { email: 'FINANCEIRO@EXAMPLE.COM' } },
    });
    assert.equal(result.isError, undefined);
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.mcpAccess.contactContextProvided, true);
    assert.equal(data.mcpAccess.contactEmailMatched, true);
  });
});

test('uma escrita com email explícito divergente falha antes de qualquer alteração', async () => {
  await withClient('mcp_live_company', async (client) => {
    const result = await client.callTool({
      name: 'create_process_request',
      arguments: {
        idempotencyKey: 'mismatch-write-001',
        title: 'Não deve criar',
        description: 'Contato sem autorização',
        client_context: { email: 'nao-autorizado@example.com' },
      },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /não possui um email explícito autorizado/i);
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
