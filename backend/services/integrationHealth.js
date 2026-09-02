const DECRYPTION_PATTERNS = [
  /unable to authenticate data/i,
  /unsupported state/i,
  /invalid authentication tag/i,
  /bad decrypt/i
];

const classifyIntegrationHealthError = (error) => {
  const name = String(error?.name || 'UnknownError');
  const message = String(error?.message || '');

  if (DECRYPTION_PATTERNS.some(pattern => pattern.test(message))) {
    return {
      code: 'CREDENTIAL_DECRYPTION_FAILED',
      message: 'As credenciais AWS salvas não puderam ser descriptografadas. Verifique a ENCRYPTION_KEY original do Lambda Pulse.'
    };
  }

  if (name === 'ResourceNotFoundException') {
    return { code: 'FUNCTION_NOT_FOUND', message: 'Função não encontrada na região configurada.' };
  }

  if (['InvalidClientTokenId', 'UnrecognizedClientException', 'SignatureDoesNotMatch'].includes(name)) {
    return { code: 'AWS_CREDENTIALS_REJECTED', message: 'A AWS rejeitou as credenciais configuradas para esta integração.' };
  }

  if (['AccessDenied', 'AccessDeniedException', 'UnauthorizedOperation'].includes(name)) {
    return { code: 'AWS_ACCESS_DENIED', message: 'As credenciais AWS não possuem permissão lambda:GetFunction para esta função.' };
  }

  if (['TimeoutError', 'RequestTimeout', 'NetworkingError'].includes(name)) {
    return { code: 'AWS_CONNECTION_FAILED', message: 'A consulta à AWS excedeu o tempo limite. Tente novamente em alguns instantes.' };
  }

  return { code: 'AWS_HEALTH_CHECK_FAILED', message: 'Não foi possível acessar a função com as credenciais configuradas.' };
};

module.exports = { classifyIntegrationHealthError };
