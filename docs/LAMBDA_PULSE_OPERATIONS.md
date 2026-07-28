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

Alterações do cliente são aceitas apenas na versão publicada da própria empresa, registram autor e data, incrementam a versão e entram na auditoria. Alterações administrativas de conteúdo continuam sendo feitas em rascunho; ao publicar uma nova versão, a anterior é arquivada. O cliente vê somente mapas publicados. Arquivar remove o mapa do portal sem apagar seu histórico, enquanto a exclusão permanente exige que ele já não esteja publicado.

### 7. Operação AWS

O dashboard consulta serviços reais:

- AWS Lambda para validar credenciais, região, existência e estado da função;
- CloudWatch Metrics para invocações, erros, duração, throttles e concorrência;
- CloudWatch Logs para eventos, busca, paginação, simplificação e diagnóstico;
- Redis para cache e estado dos resumos;
- provedor de IA configurado para o resumo de logs.

Falhas de consulta não são convertidas em zeros “saudáveis”: a interface apresenta o monitoramento como indisponível e conserva a mensagem operacional.

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

### Integrações e mapas

- `GET|POST /lambda/integrations`
- `PATCH|DELETE /lambda/integrations/:integrationId`
- `POST /lambda/integrations/:integrationId/health-check`
- `GET|POST /lambda/integrations/:integrationId/mappings`
- `PATCH /lambda/mappings/:mappingSetId`
- `DELETE /lambda/mappings/:mappingSetId` (rascunho ou arquivado)
- `POST|PATCH|DELETE /lambda/mappings/:mappingSetId/entries[...]`
- `POST /lambda/mappings/:mappingSetId/clone`

### Operação

- `GET /lambda/metrics/:integrationId`
- `GET /lambda/logs/:integrationId`
- `POST /lambda/logs/:integrationId/ai-summary/start`
- `GET /lambda/logs/:integrationId/ai-summary/status`
- `POST /lambda/invoke/:integrationId`
- `GET /audit/logs`
- `GET /health/live`
- `GET /health/ready`

## Implantação

O backend executa `npm run db:migrate` antes de iniciar. A migração é transacional, usa advisory lock e:

- adiciona colunas sem apagar dados existentes;
- gera códigos para processos legados;
- normaliza posições de fila antes de criar a restrição de unicidade;
- cria tabelas e índices dos novos módulos.

Variáveis obrigatórias e integrações externas estão documentadas em `backend/.env.example` e `frontend/.env.example`.

## Verificação

Antes de publicar:

```bash
cd backend
npm test

cd ../frontend
npm run build
```

Após subir o backend, valide `GET /health/ready`. O status só é `ready` quando PostgreSQL e Redis respondem.
