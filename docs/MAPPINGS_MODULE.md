# Módulo de Mapeamentos

Este documento descreve o contrato funcional e técnico do workspace de mapeamento de dados do Lambda Pulse.

## Objetivo

O módulo mantém o de-para de uma integração como fonte da verdade compartilhada entre a equipe técnica e o cliente. Cada mapa pode reunir, dentro de uma única experiência centrada no documento:

- documento livre em Markdown;
- vínculos estruturados, pesquisáveis e exportáveis, exibidos dentro da área Documento;
- regras, exemplos, obrigatoriedade, fallback e situação por vínculo;
- arquivos originais e materiais de referência;
- permissões de edição globais ou por campo;
- política configurável de publicação;
- histórico com autor, data, revisão e valores alterados;
- vínculo direto com uma demanda do módulo Processos.

## Versão e revisão

Os números possuem responsabilidades diferentes:

- `version`: versão funcional publicada do de-para. Só avança quando “Criar nova versão” clona um mapa;
- `revision`: contador técnico de cada alteração dentro da versão. É usado para detectar edições concorrentes.

Na primeira migração para o novo contrato, valores antigos de `version` são preservados em `revision` e as versões funcionais são recalculadas cronologicamente por integração e nome.

## Fluxo recomendado

1. O administrador cria um mapa por modelo ou importação.
2. A importação cria documento, vínculos e anexo em uma única transação.
3. A equipe ajusta os vínculos e configura permissões e política de publicação.
4. A seção administrativa Revisão apresenta cobertura, pendências e duplicidades.
5. A equipe marca no documento os controles que o cliente preencherá e configura tipo, rótulo, opções e obrigatoriedade.
6. A publicação disponibiliza ao cliente Documento, Dúvidas e histórico e Arquivos; Revisão nunca aparece no portal.
7. Alterações liberadas ao cliente incrementam a revisão e ficam marcadas como aguardando revisão.
8. O administrador confere a linha do tempo, pode restaurar uma alteração e conclui a revisão.
9. Mudanças administrativas em conteúdo publicado são feitas em uma nova versão.

## Histórico

`integration_mapping_changes` é a trilha de produto do módulo. Ela não substitui `audit_logs`, que continua sendo a auditoria global de segurança.

Cada evento registra:

- mapa, entidade e identificador afetados;
- autor e papel no momento da alteração;
- ação e resumo em linguagem natural;
- campos alterados com antes/depois;
- snapshots necessários para restauração;
- revisão resultante;
- visibilidade para o cliente;
- data e hora.

O endpoint de listagem não devolve snapshots grandes. Documentos são resumidos por tamanho e quantidade de linhas. A restauração acontece no servidor, dentro de uma transação, e sempre cria um novo evento — o histórico nunca é reescrito.

O frontend carrega os eventos em lotes cumulativos de 10. Busca e filtros reiniciam a linha do tempo e o botão “Carregar mais” consulta somente o próximo lote.

Eventos antigos de `audit_logs` são importados uma única vez por `audit_log_id`, sem duplicação em reinicializações futuras.

## Permissões

- Administrador: cria, importa, configura, publica, clona, arquiva, restaura e revisa.
- Cliente em `none`: consulta e comenta.
- Cliente em `selected`: edita apenas os campos liberados em cada vínculo e os controles marcados dentro do documento.
- Cliente em `all`: edita documento e vínculos; inclusão e exclusão são permissões independentes.

Toda escrita do cliente exige a revisão esperada. Se outra pessoa salvar antes, a API responde `409` e o frontend orienta o recarregamento.

Os controles do documento são armazenados como tokens seguros no Markdown. No portal, esses tokens são renderizados como inputs e selects; o Markdown bruto permanece restrito ao administrador. Em modo `selected`, a API compara a estrutura anterior e a nova e rejeita qualquer mudança fora do valor dos tokens.

## Política de publicação

O administrador pode tornar obrigatórias, de forma independente:

- existência de vínculos estruturados;
- resolução de pendências;
- ausência de origens duplicadas na mesma seção;
- preenchimento dos tipos de origem e destino.

O padrão é informativo para preservar compatibilidade. Quando uma regra é ativada, a API também a aplica; não é apenas uma validação visual.

## Endpoints principais

| Método | Endpoint | Finalidade |
| --- | --- | --- |
| `GET` | `/lambda/integrations/:integrationId/mappings` | Listar mapas acessíveis |
| `POST` | `/lambda/integrations/:integrationId/mappings` | Criar ou importar atomicamente |
| `PATCH` | `/lambda/mappings/:mappingSetId` | Atualizar documento, configuração ou status |
| `GET` | `/lambda/mappings/:mappingSetId/history` | Consultar linha do tempo paginada |
| `POST` | `/lambda/mappings/:mappingSetId/comments` | Registrar decisão ou comentário |
| `POST` | `/lambda/mappings/:mappingSetId/review` | Concluir revisão de alterações do cliente |
| `POST` | `/lambda/mappings/:mappingSetId/history/:changeId/restore` | Restaurar estado anterior |
| `POST/PATCH` | `/lambda/mappings/:mappingSetId/entries/bulk` | Importar ou atualizar vínculos em lote |

## Operação e validação

O backend aplica o schema no `predev` e `prestart` com transação e advisory lock.

Comandos de verificação:

```bash
cd backend
npm test

cd ../frontend
npm run lint
npm run build
```

Se a conexão PostgreSQL configurada estiver indisponível, a migração falha e a API não inicia com schema parcial.
