const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeRegion,
  plainConnectionCredentials,
  sanitizeAwsConnectionError
} = require('../services/awsConnections');

test('normaliza regiões AWS válidas e rejeita valores fora do contrato', () => {
  assert.equal(normalizeRegion(' US-EAST-2 '), 'us-east-2');
  assert.equal(normalizeRegion(undefined, 'sa-east-1'), 'sa-east-1');
  assert.throws(() => normalizeRegion('http://localhost'), /Região AWS inválida/);
});

test('valida o par completo de credenciais sem retorná-lo em erros', () => {
  assert.deepEqual(
    plainConnectionCredentials({ accessKeyId: 'TEST_ACCESS_ID_123456', secretAccessKey: 'test-secret-with-more-than-twenty-characters' }),
    { accessKeyId: 'TEST_ACCESS_ID_123456', secretAccessKey: 'test-secret-with-more-than-twenty-characters' }
  );
  assert.throws(() => plainConnectionCredentials({ accessKeyId: 'AKIA', secretAccessKey: 'segredo' }), /Credenciais AWS inválidas/);
});

test('sanitiza falhas da AWS para não expor detalhes das credenciais', () => {
  assert.deepEqual(sanitizeAwsConnectionError({ name: 'InvalidClientTokenId', message: 'token secreto' }), {
    code: 'AWS_CREDENTIALS_REJECTED',
    message: 'A AWS rejeitou as credenciais informadas.'
  });
  assert.equal(sanitizeAwsConnectionError({ name: 'AccessDeniedException' }).code, 'AWS_ACCESS_DENIED');
});
