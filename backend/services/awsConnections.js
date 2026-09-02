const { LambdaClient, ListFunctionsCommand } = require('@aws-sdk/client-lambda');
const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
const { decrypt } = require('../security/crypto');

const REGION_PATTERN = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/;

const normalizeRegion = (value, fallback = 'us-east-1') => {
  const region = String(value || fallback).trim().toLowerCase();
  if (!REGION_PATTERN.test(region)) {
    const error = new Error('Região AWS inválida.');
    error.statusCode = 400;
    throw error;
  }
  return region;
};

const encryptedConnectionCredentials = (connection) => ({
  accessKeyId: decrypt(connection.access_key_encrypted),
  secretAccessKey: decrypt(connection.secret_key_encrypted)
});

const plainConnectionCredentials = ({ accessKeyId, secretAccessKey }) => {
  const access = String(accessKeyId || '').trim();
  const secret = String(secretAccessKey || '').trim();
  if (access.length < 16 || secret.length < 20) {
    const error = new Error('Credenciais AWS inválidas.');
    error.statusCode = 400;
    throw error;
  }
  return { accessKeyId: access, secretAccessKey: secret };
};

const validateAwsIdentity = async ({ credentials, region }) => {
  const client = new STSClient({ region: normalizeRegion(region), credentials });
  const identity = await client.send(new GetCallerIdentityCommand({}));
  return {
    accountId: identity.Account || null,
    arn: identity.Arn || null,
    userId: identity.UserId || null
  };
};

const listLambdaFunctions = async ({ credentials, region, maxFunctions = 1000 }) => {
  const client = new LambdaClient({ region: normalizeRegion(region), credentials });
  const functions = [];
  let marker;
  do {
    const response = await client.send(new ListFunctionsCommand({
      Marker: marker,
      MaxItems: Math.min(50, maxFunctions - functions.length)
    }));
    functions.push(...(response.Functions || []));
    marker = response.NextMarker;
  } while (marker && functions.length < maxFunctions);
  return functions;
};

const sanitizeAwsConnectionError = (error) => {
  const name = String(error?.name || 'UnknownError');
  if (['InvalidClientTokenId', 'UnrecognizedClientException', 'SignatureDoesNotMatch'].includes(name)) {
    return { code: 'AWS_CREDENTIALS_REJECTED', message: 'A AWS rejeitou as credenciais informadas.' };
  }
  if (['AccessDenied', 'AccessDeniedException', 'UnauthorizedOperation'].includes(name)) {
    return { code: 'AWS_ACCESS_DENIED', message: 'A credencial não possui a permissão necessária para esta operação.' };
  }
  if (['TimeoutError', 'RequestTimeout', 'NetworkingError'].includes(name)) {
    return { code: 'AWS_CONNECTION_FAILED', message: 'Não foi possível alcançar a AWS agora.' };
  }
  return { code: 'AWS_CONNECTION_FAILED', message: 'Não foi possível validar a conexão AWS.' };
};

module.exports = {
  normalizeRegion,
  encryptedConnectionCredentials,
  plainConnectionCredentials,
  validateAwsIdentity,
  listLambdaFunctions,
  sanitizeAwsConnectionError
};
