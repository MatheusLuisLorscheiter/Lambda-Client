const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const { query, pool } = require('../db');

function encryptionKey() {
  const secret = process.env.WEBHOOK_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error('WEBHOOK_ENCRYPTION_KEY ou JWT_SECRET deve estar configurado.');
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptSecret(value) {
  const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); const tag = cipher.getAuthTag();
  return [iv, encrypted, tag].map(item => item.toString('base64url')).join('.');
}

function decryptSecret(value) {
  const [iv, encrypted, tag] = String(value).split('.').map(item => Buffer.from(item, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv); decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function privateIp(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168;
  }
  const normalized = address.toLowerCase();
  return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb');
}

async function assertSafeUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:')) throw new Error('O webhook deve usar HTTPS.');
  if (url.username || url.password || url.hash) throw new Error('A URL do webhook não pode conter credenciais ou fragmento.');
  const addresses = net.isIP(url.hostname) ? [url.hostname] : (await dns.lookup(url.hostname, { all: true })).map(item => item.address);
  if (!addresses.length || addresses.some(privateIp)) throw new Error('O destino do webhook aponta para rede privada ou reservada.');
  return url.toString();
}

function newSecret() { return `whsec_${crypto.randomBytes(32).toString('base64url')}`; }

function safeHeaderName(value, fallback) {
  const header = String(value || fallback).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(header) || ['authorization', 'cookie', 'host', 'content-length', 'content-type'].includes(header)) throw new Error('Nome de cabeçalho inválido.');
  return header;
}

async function listWebhookEndpoints(companyId) {
  const result = await query(`SELECT id, name, url, event_types AS "eventTypes", is_active AS "isActive", signature_header AS "signatureHeader", timestamp_header AS "timestampHeader", last_success_at AS "lastSuccessAt", last_error AS "lastError", created_at AS "createdAt", updated_at AS "updatedAt" FROM generic_webhook_endpoints WHERE company_id = $1 ORDER BY created_at DESC`, [companyId]);
  return result.rows;
}

async function createWebhookEndpoint({ companyId, name, url, eventTypes = [], signatureHeader = 'x-webhook-signature', timestampHeader = 'x-webhook-timestamp' }) {
  const safeUrl = await assertSafeUrl(url); const secret = newSecret(); const safeName = String(name || '').trim();
  if (!safeName) throw new Error('Nome é obrigatório.');
  if (!Array.isArray(eventTypes) || eventTypes.some(item => typeof item !== 'string')) throw new Error('Tipos de evento inválidos.');
  signatureHeader = safeHeaderName(signatureHeader, 'x-webhook-signature'); timestampHeader = safeHeaderName(timestampHeader, 'x-webhook-timestamp');
  const result = await query(`INSERT INTO generic_webhook_endpoints (company_id, name, url, encrypted_secret, event_types, signature_header, timestamp_header) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, url, event_types AS "eventTypes", is_active AS "isActive", signature_header AS "signatureHeader", timestamp_header AS "timestampHeader", created_at AS "createdAt"`, [companyId, safeName, safeUrl, encryptSecret(secret), eventTypes, signatureHeader, timestampHeader]);
  return { endpoint: result.rows[0], secret };
}

async function rotateWebhookSecret(companyId, endpointId) {
  const secret = newSecret(); const result = await query('UPDATE generic_webhook_endpoints SET encrypted_secret = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3 RETURNING id', [encryptSecret(secret), endpointId, companyId]);
  if (!result.rowCount) throw Object.assign(new Error('Endpoint não encontrado.'), { status: 404 });
  return { secret };
}

async function updateWebhookEndpoint(companyId, endpointId, input) {
  const fields = []; const values = []; const add = (column, value) => { values.push(value); fields.push(`${column} = $${values.length}`); };
  if (input.name !== undefined) { const name = String(input.name || '').trim(); if (!name) throw new Error('Nome inválido.'); add('name', name); }
  if (input.url !== undefined) add('url', await assertSafeUrl(input.url));
  if (input.eventTypes !== undefined) { if (!Array.isArray(input.eventTypes) || input.eventTypes.some(item => typeof item !== 'string')) throw new Error('Tipos de evento inválidos.'); add('event_types', Array.from(new Set(input.eventTypes.map(item => item.trim()).filter(Boolean)))); }
  if (input.isActive !== undefined) add('is_active', Boolean(input.isActive));
  if (!fields.length) throw new Error('Nenhuma alteração informada.');
  values.push(endpointId, companyId); fields.push('updated_at = NOW()');
  const result = await query(`UPDATE generic_webhook_endpoints SET ${fields.join(', ')} WHERE id = $${values.length - 1} AND company_id = $${values.length} RETURNING id, name, url, event_types AS "eventTypes", is_active AS "isActive", updated_at AS "updatedAt"`, values);
  if (!result.rowCount) throw Object.assign(new Error('Endpoint não encontrado.'), { status: 404 });
  return result.rows[0];
}

async function enqueueGenericWebhookEvent({ companyId, endpointId = null, type, subject, data = {}, eventId, occurredAt }) {
  const envelope = { id: eventId || crypto.randomUUID(), type, occurredAt: occurredAt || new Date().toISOString(), subject, data };
  await query(`INSERT INTO generic_webhook_outbox (endpoint_id, company_id, event_id, event_type, payload)
    SELECT endpoint.id, $1, $2, $3, $4 FROM generic_webhook_endpoints endpoint
    WHERE endpoint.company_id = $1 AND endpoint.is_active = TRUE
      AND ($5::bigint IS NULL OR endpoint.id = $5)
      AND (cardinality(endpoint.event_types) = 0 OR $3 = ANY(endpoint.event_types))
    ON CONFLICT (endpoint_id, event_id) DO NOTHING`, [companyId, envelope.id, type, JSON.stringify(envelope), endpointId]);
  return envelope;
}

async function claimOutbox(limit) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`WITH due AS (
      SELECT id FROM generic_webhook_outbox WHERE status IN ('pending', 'failed') AND available_at <= NOW() AND (locked_until IS NULL OR locked_until <= NOW()) ORDER BY available_at, id FOR UPDATE SKIP LOCKED LIMIT $1
    ) UPDATE generic_webhook_outbox outbox SET status = 'processing', attempts = attempts + 1, locked_until = NOW() + INTERVAL '30 seconds', updated_at = NOW() FROM due WHERE outbox.id = due.id
    RETURNING outbox.*`, [limit]);
    await client.query('COMMIT'); return result.rows;
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
}

async function dispatchPendingWebhookEvents(limit = 50) {
  const rows = await claimOutbox(limit); let succeeded = 0; let failed = 0;
  for (const row of rows) {
    const endpoint = await query('SELECT * FROM generic_webhook_endpoints WHERE id = $1 AND is_active = TRUE', [row.endpoint_id]);
    if (!endpoint.rows[0]) { await query("UPDATE generic_webhook_outbox SET status = 'dead_letter', last_error = 'Endpoint removido ou inativo', locked_until = NULL WHERE id = $1", [row.id]); failed += 1; continue; }
    const target = endpoint.rows[0]; const body = JSON.stringify(row.payload); const timestamp = new Date().toISOString();
    const signature = `v1=${crypto.createHmac('sha256', decryptSecret(target.encrypted_secret)).update(`${timestamp}.${body}`).digest('hex')}`;
    try {
      await assertSafeUrl(target.url);
      const response = await fetch(target.url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000), headers: { 'content-type': 'application/json', [target.timestamp_header]: timestamp, [target.signature_header]: signature, 'x-webhook-id': row.event_id }, body });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await query("UPDATE generic_webhook_outbox SET status = 'delivered', delivered_at = NOW(), locked_until = NULL, last_error = NULL, updated_at = NOW() WHERE id = $1", [row.id]);
      await query('UPDATE generic_webhook_endpoints SET last_success_at = NOW(), last_error = NULL WHERE id = $1', [row.endpoint_id]); succeeded += 1;
    } catch (error) {
      const dead = Number(row.attempts) >= 8; const delay = Math.min(3600, 2 ** Number(row.attempts) * 5);
      await query(`UPDATE generic_webhook_outbox SET status = $1, available_at = NOW() + ($2 * INTERVAL '1 second'), locked_until = NULL, last_error = $3, updated_at = NOW() WHERE id = $4`, [dead ? 'dead_letter' : 'failed', delay, String(error.message || error).slice(0, 2000), row.id]);
      await query('UPDATE generic_webhook_endpoints SET last_error = $1 WHERE id = $2', [String(error.message || error).slice(0, 2000), row.endpoint_id]); failed += 1;
    }
  }
  return { processed: rows.length, succeeded, failed };
}

module.exports = { assertSafeUrl, listWebhookEndpoints, createWebhookEndpoint, updateWebhookEndpoint, rotateWebhookSecret, enqueueGenericWebhookEvent, dispatchPendingWebhookEvents };
