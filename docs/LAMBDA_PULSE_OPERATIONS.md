# Lambda Pulse — produto e operação

## Objetivo

O Lambda Pulse é a fonte da verdade das automações, integrações e intermediações operadas pela Chave Mestra. O produto conecta quatro contextos que antes ficavam dispersos:

1. solicitação e qualificação da demanda;
2. planejamento, fila e execução;
3. entrega, validação e aceite;
4. operação da automação em produção.

Não existem dados de demonstração ou fallback fictício. Processos, comentários, etapas, entregas e mapeamentos usam PostgreSQL. Métricas e logs usam AWS CloudWatch/Lambda. Cache e resumos usam Redis e o provedor configurado no ambiente.

## Fluxo end-to-end

### 1. Solicitação

O cliente registra título, categoria, contexto atual, resultado esperado e critérios de aceite. O backend sempre fixa uma solicitação do cliente em `requested`, prioridade `normal` e progresso `0`, impedindo escalada de privilégio pelo payload.

Cada solicitação recebe:

- código estável no formato `LP-000000`;
- SLA inicial de análise em horas úteis;
- timeline auditável;
- comentários habilitados por padrão.

O administrador também controla a visibilidade da demanda e pode liberar, campo a campo, a edição de título, contexto, objetivo, escopo, critérios de aceite e tags. O cliente nunca recebe permissão para alterar status, prioridade, planejamento ou progresso. Atualizações do cliente usam a versão esperada para evitar sobrescrita silenciosa e geram evento de sistema e log de auditoria.

### 2. Análise e planejamento

O administrador qualifica:

- categoria, prioridade, impacto e complexidade;
- saúde (`on_track`, `at_risk`, `off_track`, `blocked`);
- objetivo, escopo e critérios de aceite;
- início, previsão, SLA, progresso e próximo passo;
- motivo obrigatório quando a demanda está bloqueada;
- tags e campos personalizados;
- posição na fila.

A fila possui posição única por empresa e endpoint transacional de reordenação. Se a fila mudar durante uma tentativa de reorganização, a API devolve conflito em vez de sobrescrever uma ordem mais recente.

### 3. Execução

O plano de execução é composto por etapas persistidas com status, descrição, prazo, ordem e conclusão. Toda alteração relevante incrementa a versão do processo.

O cliente recebe alterações em tempo real por Server-Sent Events autenticados. Uma sincronização periódica funciona como contingência para proxies que interrompam conexões longas.

#### Linha de base e resultado da automação

Cada processo pode manter um histórico de medições de esforço em dois momentos:

- `baseline`: como a operação funciona antes da automação;
- `post_automation`: como a operação passou a funcionar após a implantação.

Uma medição reúne de 1 a 50 atividades ou funções. Para cada item são registrados:

- atividade e função responsável;
- tempo por execução;
- quantidade de execuções por dia útil, semana, mês, trimestre ou ano;
- dias de operação por mês, quando a frequência é diária (22 por padrão, configurável);
- quantidade de pessoas envolvidas;
- capacidade mensal de trabalho por pessoa;
- observações e premissas.

O sistema normaliza as frequências para uma base mensal e calcula automaticamente horas de trabalho por mês, pessoas equivalentes, horas liberadas por mês e por ano e percentual de redução. A comparação usa a medição confirmada mais recente de cada momento; na ausência de uma confirmação, apresenta o rascunho mais recente. Medições confirmadas são imutáveis para que o histórico não seja sobrescrito. Uma nova aferição deve ser registrada quando o processo mudar.

O administrador pode habilitar ou desabilitar o preenchimento pelo cliente em cada processo. O isolamento por empresa, a visibilidade do processo, a auditoria e os eventos em tempo real também se aplicam às medições.

### 4. Colaboração

A timeline diferencia:

- atualizações;
- comentários;
- mudanças de status;
- decisões;
- entregas;
- eventos de sistema.

Comentários registram autor, papel, visibilidade, edição e resposta. Clientes só acessam eventos visíveis ao cliente. Comentários internos permanecem restritos ao administrador.

Demandas arquivadas saem da operação ativa e do portal do cliente sem perder etapas, entregas ou histórico. A exclusão permanente só é aceita depois do arquivamento.

### 5. Entrega e aceite

Uma entrega registra:

- título, versão e ambiente;
- resumo e notas da versão;
- links de artefatos;
- plano de reversão;
- estado de validação;
- observação de aceite ou rejeição.

Ao enviar uma entrega, o processo entra em validação. O aceite conclui o processo com 100% de progresso; a rejeição retorna o processo à execução, marca a saúde como `at_risk` e preserva a justificativa na timeline.

### 6. Mapeamento de dados

Cada integração pode ter conjuntos de mapeamento com:

- sistemas de origem e destino;
- vínculo opcional com processo;
- versão e estado de publicação;
- caminhos e tipos de origem/destino;
- direção, transformação e valor padrão;
- obrigatoriedade, exemplos e observações.

O administrador escolhe a política de colaboração de cada mapa:

- `none`: somente visualização;
- `all`: documento e todos os campos editáveis, com inclusão e exclusão de vínculos opcionais;
- `selected`: somente propriedades explicitamente liberadas em cada vínculo.

Alterações do cliente são aceitas apenas na versão publicada da própria empresa, registram autor e data, incrementam a revisão e entram na auditoria. Alterações administrativas de conteúdo continuam sendo feitas em rascunho. Antes da publicação, a revisão exata precisa ser submetida e aprovada explicitamente; qualquer mudança invalida a aprovação. Ao publicar uma nova versão, a anterior é arquivada. O cliente vê somente mapas publicados. Arquivar remove o mapa do portal sem apagar seu histórico, enquanto a exclusão permanente exige que ele já não esteja publicado.

### 7. Operação AWS

O dashboard consulta serviços reais:

- AWS Lambda para validar credenciais, região, existência e estado da função;
- CloudWatch Metrics para invocações, erros, duração, throttles e concorrência;
- CloudWatch Logs para eventos, busca, paginação, simplificação e diagnóstico;
- Redis para cache e estado dos resumos;
- provedor de IA configurado para o resumo de logs.

Falhas de consulta não são convertidas em zeros “saudáveis”: a interface apresenta o monitoramento como indisponível e conserva a mensagem operacional.

O MCP expõe a mesma fonte real por `get_integration_observability`, com janela e quantidade limitadas, métricas agregadas e logs sanitizados. A ferramenta é somente leitura e devolve uma referência estável da integração.

## Eventos para o Nexo

O vínculo com a entrada de eventos do CloudWhats deve ser configurado nesta ordem:

1. crie no CloudWhats uma fonte Nexo do tipo `WEBHOOK` e copie, uma única vez, o segredo retornado e o `intakePath`;
2. crie no Lambda Pulse um endpoint genérico apontando para a URL pública completa do `intakePath`;
3. envie o segredo no campo `signingSecret` e configure `signatureHeader` como `x-nexo-signature` e `timestampHeader` como `x-nexo-timestamp`;
4. mantenha o endpoint e a fonte pausados até o teste assinado retornar sucesso; depois ative ambos;
5. filtre `eventTypes` para os eventos necessários ao piloto e monitore a outbox e a dead-letter.

Quando `signingSecret` é fornecido, o Lambda Pulse valida e cifra o valor, mas não o devolve na resposta. Sem esse campo, o Lambda Pulse gera um segredo próprio e o retorna somente na criação. O corpo é assinado sem transformação como `v1=HMAC_SHA256(segredo, timestamp + "." + corpo)`. Segredos não devem aparecer em logs, comentários, processos ou documentação.

Para rotação, gere primeiro um novo segredo na fonte do CloudWhats; ela ficará pausada até receber uma nova prova assinada. Atualize imediatamente o endpoint do Lambda Pulse por `PATCH`, usando `signingSecret`, dispare o teste e reative a fonte. A outbox mantém os demais eventos para retentativa durante a troca. Não use a rota de rotação autônoma do Lambda Pulse nessa integração, porque o consumidor não conheceria o novo segredo.

A outbox deduplica por endpoint e ID do evento, aplica retentativas com backoff e envia falhas definitivas para dead-letter. Uma resposta incerta não deve provocar um segundo efeito no Nexo; o consumidor também deduplica o envelope por fonte e `id`.

## Segurança e isolamento

- clientes só acessam dados da própria empresa;
- operações administrativas exigem papel `admin`;
- credenciais AWS permanecem cifradas com AES-256-GCM;
- teste de invocação Lambda continua exclusivo do administrador;
- 401 encerra a sessão; 403 preserva a sessão e apresenta a restrição;
- exclusões e ações sensíveis possuem confirmação;
- auditoria inclui empresa, usuário, recurso, IP, agente e metadados;
- logs administrativos podem ser filtrados por empresa e busca.

## Endpoints principais

### Processos

- `GET /processes`
- `GET /processes/summary`
- `GET /processes/:processId`
- `GET /processes/stream/events`
- `POST /processes`
- `PATCH /processes/:processId`
- `DELETE /processes/:processId` (somente após arquivamento)
- `POST /processes/queue/reorder`
- `POST|PATCH|DELETE /processes/:processId/comments[...]`
- `POST|PATCH|DELETE /processes/:processId/checklist[...]`
- `POST|PATCH /processes/:processId/deliveries[...]`
- `GET|POST /processes/:processId/effort`
- `PATCH|DELETE /processes/:processId/effort/:assessmentId`

### Integrações e mapas

- `GET|POST /lambda/integrations`
- `PATCH|DELETE /lambda/integrations/:integrationId`
- `POST /lambda/integrations/:integrationId/health-check`
- `GET|POST /lambda/integrations/:integrationId/mappings`
- `PATCH /lambda/mappings/:mappingSetId`
- `DELETE /lambda/mappings/:mappingSetId` (rascunho ou arquivado)
- `POST|PATCH|DELETE /lambda/mappings/:mappingSetId/entries[...]`
- `POST /lambda/mappings/:mappingSetId/clone`
- `POST /lambda/mappings/:mappingSetId/approval/request`
- `POST /lambda/mappings/:mappingSetId/approval`

### Operação

- `GET /lambda/metrics/:integrationId`
- `GET /lambda/logs/:integrationId`
- `POST /lambda/logs/:integrationId/ai-summary/start`
- `GET /lambda/logs/:integrationId/ai-summary/status`
- `POST /lambda/invoke/:integrationId`
- `GET /audit/logs`
- `GET /health/live`
- `GET /health/ready`
- `GET|POST /auth/admin/webhook-endpoints[...]`

## Implantação

O backend executa `npm run db:migrate` antes de iniciar. A migração é transacional, usa advisory lock e:

- adiciona colunas sem apagar dados existentes;
- gera códigos para processos legados;
- normaliza posições de fila antes de criar a restrição de unicidade;
- cria tabelas e índices dos novos módulos.
- cria o histórico normalizado de medições de esforço e atividades sem alterar processos existentes.

Variáveis obrigatórias e integrações externas estão documentadas em `backend/.env.example` e `frontend/.env.example`.

## Verificação

Antes de publicar:

```bash
node scripts/scan-secrets.js

cd backend
npm test

cd ../frontend
npm run lint
npm run type-check
```

Após subir o backend, valide `GET /health/ready`. O status só é `ready` quando PostgreSQL e Redis respondem.

O workflow `.github/workflows/pull-request-validation.yml` repete varredura, testes, lint sem escrita e type-check em todo PR e push para `main`. A implantação do Lambda Pulse permanece fora do workflow até que o serviço/digest do EasyPanel, o ambiente protegido e o mecanismo de rollback estejam explicitamente cadastrados; ausência desses dados é bloqueio de rollout, não autorização para deploy ad hoc.
