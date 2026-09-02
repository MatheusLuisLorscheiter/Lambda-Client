const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyIntegrationHealthError,
  integrationHealthStatusForFailure
} = require('../services/integrationHealth');

test('identifica chave de criptografia divergente sem expor o erro bruto', () => {
  const result = classifyIntegrationHealthError(new Error('Unsupported state or unable to authenticate data'));
  assert.equal(result.code, 'CREDENTIAL_DECRYPTION_FAILED');
  assert.match(result.message, /ENCRYPTION_KEY/);
  assert.doesNotMatch(result.message, /authenticate data/i);
});

test('diferencia credencial rejeitada, falta de permissao e funcao inexistente', () => {
  assert.equal(classifyIntegrationHealthError({ name: 'InvalidClientTokenId' }).code, 'AWS_CREDENTIALS_REJECTED');
  assert.equal(classifyIntegrationHealthError({ name: 'AccessDeniedException' }).code, 'AWS_ACCESS_DENIED');
  assert.equal(classifyIntegrationHealthError({ name: 'ResourceNotFoundException' }).code, 'FUNCTION_NOT_FOUND');
});

test('mantem fallback sanitizado para falhas desconhecidas', () => {
  const result = classifyIntegrationHealthError(new Error('segredo que nao pode aparecer'));
  assert.equal(result.code, 'AWS_HEALTH_CHECK_FAILED');
  assert.doesNotMatch(result.message, /segredo/);
});

test('falta de permissao degrada o monitoramento sem declarar a Lambda indisponivel', () => {
  assert.equal(integrationHealthStatusForFailure('AWS_ACCESS_DENIED'), 'degraded');
  assert.equal(integrationHealthStatusForFailure('AWS_CREDENTIALS_REJECTED'), 'unavailable');
  assert.equal(integrationHealthStatusForFailure('AWS_CONNECTION_FAILED'), 'unavailable');
});
