const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const dbPath = require.resolve('../db');

const query = async (sql, params = []) => {
  if (sql.includes('FROM company_mcp_configs')) {
    if (params[0] === crypto.createHash('sha256').update('mcp_live_validtoken').digest('hex')) {
      return {
        rows: [{
          company_id: 1,
          is_enabled: true,
          allowed_domains: { logs: true, processes: true, mappings: true, integrations: true },
          company_name: 'Empresa Teste'
        }]
      };
    }
    return { rows: [] };
  }

  if (sql.includes('SELECT COUNT(*)::int FROM integrations')) {
    return { rows: [{ count: 3 }] };
  }
  if (sql.includes('SELECT COUNT(*)::int FROM process_items')) {
    return { rows: [{ count: 5 }] };
  }
  if (sql.includes('SELECT COUNT(*)::int FROM integration_mapping_sets')) {
    return { rows: [{ count: 2 }] };
  }
  if (sql.includes('SELECT COUNT(*)::int FROM audit_logs')) {
    return { rows: [{ count: 10 }] };
  }

  if (sql.includes('FROM process_items')) {
    return {
      rows: [
        { id: 101, reference_code: 'PROC-1', title: 'Automação Financeira', status: 'in_progress', progress: 50 }
      ]
    };
  }

  if (sql.includes('FROM process_deliveries')) {
    return {
      rows: [
        { id: 1, title: 'Release 1.0', summary: 'Versão Inicial', artifact_links: ['https://doc.com/v1'] }
      ]
    };
  }

  return { rows: [], rowCount: 0 };
};

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: { query }
};

const router = require('../routes/mcp.routes');

const invokeMcp = async (headers = {}, body = {}) => {
  let statusCode = 200;
  let responseBody;

  const req = {
    url: '/',
    method: 'POST',
    get: (headerName) => headers[headerName.toLowerCase()] || headers[headerName],
    body,
    ip: '127.0.0.1',
    protocol: 'https'
  };

  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { responseBody = payload; return this; }
  };

  await new Promise((resolve) => {
    router(req, res, () => {
      resolve();
    });
  });

  return { statusCode, body: responseBody };
};

test('MCP blocks requests without Bearer token', async () => {
  const res = await invokeMcp({}, { jsonrpc: '2.0', method: 'initialize', id: 1 });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error.code, -32001);
});

test('MCP initializes successfully with valid Bearer token', async () => {
  const res = await invokeMcp(
    { authorization: 'Bearer mcp_live_validtoken' },
    { jsonrpc: '2.0', method: 'initialize', id: 1 }
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.result.serverInfo.name, 'Lambda Pulse MCP Server');
  assert.equal(res.body.result.serverInfo.company, 'Empresa Teste');
});

test('MCP tools/list returns available tools', async () => {
  const res = await invokeMcp(
    { authorization: 'Bearer mcp_live_validtoken' },
    { jsonrpc: '2.0', method: 'tools/list', id: 2 }
  );

  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.body.result.tools));
  const toolNames = res.body.result.tools.map(t => t.name);
  assert.ok(toolNames.includes('get_company_summary'));
  assert.ok(toolNames.includes('list_integration_logs'));
  assert.ok(toolNames.includes('list_processes_and_docs'));
  assert.ok(toolNames.includes('list_mappings_and_entries'));
});

test('MCP tools/call executes get_company_summary tool safely', async () => {
  const res = await invokeMcp(
    { authorization: 'Bearer mcp_live_validtoken' },
    {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: 'get_company_summary', arguments: {} },
      id: 3
    }
  );

  assert.equal(res.statusCode, 200);
  const contentText = res.body.result.content[0].text;
  const data = JSON.parse(contentText);
  assert.equal(data.companyName, 'Empresa Teste');
  assert.equal(data.totalIntegrations, 3);
  assert.equal(data.totalProcesses, 5);
});
