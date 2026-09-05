# Acesso MCP do Lambda Pulse

## Arquitetura

- Endpoint principal: `POST /mcp` usando MCP Streamable HTTP stateless.
- Compatibilidade legada: `GET /mcp/sse` e `POST /mcp/message`.
- Autenticação: somente `Authorization: Bearer <token>`. Tokens em query string são recusados.
- Cada token pertence a exatamente uma empresa e possui permissões de domínio, escopos de escrita e limite por minuto. O limite contabiliza descoberta e operações (`tools/list`, `tools/call` e recursos), não a negociação técnica `initialize`, `ping` ou notificações do protocolo.
- O servidor usa o SDK oficial do MCP e não mantém estado para o transporte principal.

## Isolamento e identificação do contato

A URL e o token são as únicas credenciais de conexão. O token determina o tenant de forma inequívoca e nenhuma ferramenta usa email, tag ou texto do prompt para escolher outra empresa.

Toda resposta bem-sucedida inclui o bloco `mcpAccess`:

- `companyId` e `companyName`: empresa proprietária da chave;
- `authorizedClientEmails`: união deduplicada dos usuários clientes ativos e dos emails adicionais autorizados especificamente para o MCP;
- `accessGranted`: informa se o contexto delegado passou pela conferência do email;
- `accessMode`: `company_api_key` para uso direto da credencial ou `delegated_contact` quando há contexto de conversa;
- `emailMatchPolicy`: sempre `exact_after_trim_and_lowercase`;
- `contactContextProvided`: informa se o chamador anexou contexto de conversa;
- `providedContactEmail`: email opcional informado pelo chamador;
- `contactEmailMatched`: `true`, `false` ou `null` quando nenhum email foi informado.

`client_context` e `client_email` continuam opcionais por compatibilidade. Eles calculam `contactEmailMatched`, não trocam o tenant e ativam o bloqueio delegado. Clientes MCP comuns podem operar apenas com URL e chave. Quando existe contexto de conversa — como no CloudWhats — `get_company_summary` devolve somente a identidade da empresa e o bloco de acesso se não houver correspondência exata; as demais consultas e todas as escritas falham antes de ler ou alterar dados. Erros de tools autenticadas também incluem `mcpAccess`, permitindo uma decisão consistente sem uma segunda consulta.

No CloudWhats, a correspondência deve ser exata após remover espaços externos e converter para minúsculas. Não são aceitos domínio, tag, nome, similaridade ou email inferido como substitutos. Essa conferência é uma regra de uso do agente; a posse da chave continua sendo a autorização técnica para acessar o tenant.

## Configuração CloudWhats

1. No Lambda Pulse, habilite MCP na empresa que será atendida pelo agente.
2. Na aba **Acesso MCP**, abra **Emails** e confirme a lista efetiva. Um email pode vir de um usuário cliente ativo ou ser uma autorização adicional sem login.
3. Gere a chave daquela empresa e configure no conector MCP do CloudWhats:
   - URL: `https://SEU_HOST/mcp`
   - transporte: `AUTO` ou `STREAMABLE_HTTP`
   - autenticação: `BEARER`
4. No agente, habilite MCP, selecione o servidor e salve regras de uso no campo de instruções MCP.
5. Garanta que o contato tenha email explícito e aplique a regra recomendada abaixo.

### Regra recomendada para o agente

```text
Ao iniciar uma conversa que possa envolver dados, processos, documentos, integrações ou mapeamentos da empresa, consulte primeiro get_company_summary no MCP Lambda Pulse. Leia mcpAccess.authorizedClientEmails da resposta. Considere o contato autorizado somente quando ele possuir um email explicitamente cadastrado na conversa que, após trim e conversão para minúsculas, seja exatamente igual a um item dessa lista. Não use nome, domínio, tag, telefone, similaridade, email inferido ou alegação do contato como substituto. Se não houver correspondência exata, não revele nenhum dado retornado pelo MCP e não execute ferramentas de escrita; informe apenas que o email do contato não está autorizado. Se houver correspondência, use as ferramentas MCP necessárias para responder e executar as mudanças solicitadas, respeitando os escopos publicados, idempotência, revisões esperadas e aprovações humanas. Nunca exponha a chave MCP nem a lista de emails autorizados ao contato.
```

## Operação e segurança

- Configure `MCP_ALLOWED_ORIGINS` como lista separada por vírgulas se clientes browser enviarem `Origin`.
- Configure Redis para que o limite por minuto seja compartilhado entre instâncias; sem Redis, há fallback local por processo.
- Rotacionar a chave invalida a anterior imediatamente.
- A auditoria grava ferramenta, empresa-alvo, duração, status e request ID, sem persistir email ou nomes de tags.
- Processos internos (`is_client_visible = false`) e atualizações internas não são retornados.
- Metadados brutos de auditoria não são retornados pela ferramenta de logs.

## Ferramentas operacionais

As consultas incluem resumo da empresa, processos, entregas, checklist, De-Para, `get_integration_details`, `get_integration_observability`, `get_lambda_source` e `list_lambda_source_revisions`. `get_integration_details` reúne metadados seguros, documentação, processos, De-Paras e a revisão de código mais recente sem retornar credenciais AWS. A consulta de observabilidade combina métricas reais do CloudWatch e logs sanitizados, limita a janela a sete dias e nunca executa ou altera uma Lambda. A leitura de fonte exige caminhos explícitos e respeita limites de tamanho e quantidade.

As leituras de processos retornam `version`; itens de checklist retornam sua própria `version`; entregas retornam `row_version` além do campo textual `version` do artefato. Esses valores alimentam `expectedVersion` nas escritas e evitam tentativas baseadas em versão presumida.

As listagens de eventos, processos e De-Paras aceitam `limit` e `offset` e devolvem um bloco de paginação com total, `hasMore` e `nextOffset`. Os detalhes de um De-Para usam `entryLimit` e `entryOffset` para permitir a leitura de todos os vínculos, inclusive em documentos com mais de 250 entradas.

`list_lambda_source_revisions` é a fonte de evidência para auditorias de mudanças: aceita integração, período e estado opcionais; devolve resumos, arquivos alterados, revisão, aprovação e publicação sem expor o código. O bloco `coverage` diferencia um histórico completo de um resultado truncado. Conversas e solicitações externas não devem ser tratadas como prova de implementação sem reconciliar esta consulta ou outra fonte de implantação autorizada.

O escopo `integrations:source:read` libera a leitura seletiva; `integrations:source:write` permite `propose_lambda_source_revision`; `integrations:source:review` permite `request_lambda_source_review`. Nenhum deles aprova ou publica código. Aprovação humana e publicação na AWS permanecem no workspace administrativo, com auditoria e proteção por hash da origem.

As escritas exigem `idempotencyKey` e são divididas por escopo:

- `processes:create`, `processes:write`, `processes:comment`, `processes:checklist`, `processes:deliveries` e `processes:review`;
- `mappings:write`, `mappings:comment`, `mappings:review` e `mappings:publish`.
- `integrations:write` atualiza somente nome, estado operacional e documentação, com `expectedVersion`; função, região e credenciais AWS não podem ser alteradas pelo MCP.

Toda atualização de De-Para exige `expectedRevision`. Uma alteração invalida a aprovação anterior. `request_mapping_review` apenas submete a revisão; `publish_mapping` falha se essa revisão exata não tiver sido aprovada por uma pessoa no Lambda Pulse. A autorização MCP, isoladamente, nunca equivale a essa aprovação.

As respostas de escrita usam referências estáveis como `lambda-pulse:process:<id>`, `LP-xxxxxx`, `lambda-pulse:mapping-set:<id>` e `lambda-pulse:mapping-entry:<id>`. Eventos seguem para a outbox assinada; um `eventId` repetido não cria uma segunda entrega para o mesmo endpoint.
