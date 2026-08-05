# Acesso MCP do Lambda Pulse

## Arquitetura

- Endpoint principal: `POST /mcp` usando MCP Streamable HTTP stateless.
- Compatibilidade legada: `GET /mcp/sse` e `POST /mcp/message`.
- Autenticação: somente `Authorization: Bearer <token>`. Tokens em query string são recusados.
- Cada token pertence a uma empresa principal e possui permissões de domínio e limite por minuto.
- O servidor usa o SDK oficial do MCP e não mantém estado para o transporte principal.

## Modos de acesso

### Somente a própria empresa

A credencial consulta exclusivamente a empresa proprietária. Qualquer email enviado nos argumentos é ignorado para a escolha do tenant.

### Acesso delegado

O acesso a outra empresa exige, simultaneamente:

1. uma concessão ativa de `principal_company_id` para `target_company_id`;
2. MCP ativo na empresa-alvo;
3. um usuário cliente ativo cujo email corresponda ao contato;
4. quando configurado, uma tag do contato igual ao nome da empresa;
5. permissão de domínio tanto na credencial principal quanto na empresa-alvo.

Não existe empresa “Master” por ID ou variável de ambiente. Email e instruções do prompt não concedem autorização.

## Configuração CloudWhats

1. No Lambda Pulse, habilite MCP nas empresas-alvo.
2. Na empresa que representa o CloudWhats, escolha **Acesso delegado**, selecione as empresas autorizadas e habilite a validação de tag.
3. Gere a chave e configure no conector MCP do CloudWhats:
   - URL: `https://SEU_HOST/mcp`
   - transporte: `AUTO` ou `STREAMABLE_HTTP`
   - autenticação: `BEARER`
4. No agente, habilite MCP, selecione o servidor e salve regras de uso no campo de instruções MCP.
5. Garanta que o contato tenha email e, quando exigido, uma tag com o nome exato da empresa no Lambda Pulse.

O CloudWhats sobrescreve `client_email` e `client_context` com o contato carregado no servidor antes de executar a ferramenta. As instruções do agente ajudam na escolha das ferramentas, mas nunca substituem as validações do Lambda Pulse.

## Operação e segurança

- Configure `MCP_ALLOWED_ORIGINS` como lista separada por vírgulas se clientes browser enviarem `Origin`.
- Configure Redis para que o limite por minuto seja compartilhado entre instâncias; sem Redis, há fallback local por processo.
- Rotacionar a chave invalida a anterior imediatamente.
- A auditoria grava ferramenta, empresa-alvo, duração, status e request ID, sem persistir email ou nomes de tags.
- Processos internos (`is_client_visible = false`) e atualizações internas não são retornados.
- Metadados brutos de auditoria não são retornados pela ferramenta de logs.
