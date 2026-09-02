# Conexões AWS e workspace de código

## Modelo operacional

Uma chave AWS não pertence a uma função. Ela representa uma identidade IAM e pode acessar todas as Lambdas autorizadas pela policy. O Lambda Pulse, portanto, separa:

- **Conexão AWS**: credencial criptografada, conta, empresa e região padrão;
- **Integração**: uma função selecionada, sua região, processos, documentação e saúde.

A conexão é sempre vinculada a uma empresa. Ela nunca pode ser reutilizada por outra empresa, mesmo por correspondência de nome. O administrador cadastra a chave uma vez, valida a identidade com STS, consulta `ListFunctions` na região e importa apenas as funções escolhidas. Credenciais antigas por função continuam funcionando durante a migração.

As respostas da API exibem somente os quatro últimos caracteres do Access Key ID. O segredo e o valor completo não são devolvidos.

## Permissões AWS

Para descoberta e monitoramento, a identidade precisa de `sts:GetCallerIdentity`, `lambda:ListFunctions`, `lambda:GetFunction`, `cloudwatch:GetMetricData`, `logs:FilterLogEvents`, `logs:StartQuery` e `logs:GetQueryResults`. `lambda:InvokeFunction` é necessária apenas para o teste de invocação manual.

Para publicar pelo workspace, adicione `lambda:UpdateFunctionCode` e restrinja o `Resource` aos ARNs autorizados. O botão de publicação falha de modo seguro quando essa permissão não existe.

## Workspace e governanção

O editor atende Lambdas empacotadas como ZIP. Ele baixa o pacote temporário fornecido pela AWS e apresenta somente arquivos-fonte textuais dentro dos limites definidos. Dependências, binários e demais arquivos excluídos do editor são preservados ao remontar o ZIP. Imagens de contêiner não são editadas por esse fluxo.

Cada alteração segue estes estados:

1. `draft`: arquivos alterados e resumo foram salvos;
2. `pending_review`: revisão encaminhada para decisão humana;
3. `approved` ou `rejected`: decisão registrada em auditoria;
4. `publishing`: publicação foi reclamada atomicamente;
5. `published` ou `failed`: resultado final e hash AWS registrados.

Ao criar a revisão, o Lambda Pulse registra o `CodeSha256` da origem. Antes de publicar, consulta a AWS novamente e rejeita a operação se o código tiver mudado. A chamada usa também o `RevisionId` da AWS e uma revisão aprovada só pode ser reclamada uma vez.

## Agentes MCP

Com o domínio `integrations` habilitado, o escopo `integrations:source:read` publica `get_lambda_source`, que lista os caminhos editáveis e lê somente os arquivos solicitados. Os escopos de escrita são independentes:

- `integrations:source:write`: publica `propose_lambda_source_revision`;
- `integrations:source:review`: publica `request_lambda_source_review`.

O MCP não expõe ferramenta de aprovação nem de publicação AWS. O agente prepara a correção e solicita revisão; uma pessoa avalia no Lambda Pulse e decide se a versão deve ser enviada à AWS.

## Limites atuais

- pacote ZIP baixado: 50 MB;
- arquivo editável: 512 KB;
- conjunto de alterações textuais: 3 MB;
- arquivos editáveis: 150;
- funções importadas por operação: 100.

Variáveis de ambiente, secrets, camadas, gatilhos e configurações de runtime não são alterados pelo editor de fonte.
