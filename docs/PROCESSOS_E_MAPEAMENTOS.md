# Processos, Mapeamentos e Esforço Operacional

Este documento registra a arquitetura funcional aplicada aos módulos de Processos e Mapeamentos do Lambda Pulse.

## Princípios

- `/admin` é a área operacional da Chave Mestra: empresa, fila, revisão, publicação, permissões, planejamento e auditoria.
- `/dashboard` é o portal do cliente: solicitações da própria empresa, acompanhamento, preenchimento, validação e dúvidas.
- Nenhum filtro, texto ou ação administrativa deve aparecer no portal do cliente.
- Informações avançadas continuam disponíveis por divulgação progressiva, sem bloquear a tarefa principal.
- Escritas compostas devem ser atômicas e auditáveis.

## Processos no portal do cliente

O portal apresenta somente três filtros de processo: em andamento, entregues e todos.

A empresa é determinada pelo token do cliente no backend. O portal não mostra seletor de empresa/cliente e a API não permite ampliar esse escopo.

O detalhe do processo reúne visão geral, esforço operacional, plano de execução, entregas, atividade, conversas, automações e documentos relacionados.

## Nova solicitação com esforço opcional

O formulário de nova solicitação permite informar, opcionalmente, uma ou mais atividades manuais. Para cada atividade o cliente responde:

- o que é feito;
- quantos minutos cada execução leva;
- quantas vezes acontece e em qual período;
- quantas pessoas participam.

O frontend calcula o esforço mensal durante o preenchimento. Ao enviar, processo e linha de base são gravados na mesma transação. Se qualquer parte falhar, nada é persistido.

Contrato resumido:

```json
{
  "title": "Automatizar conferência",
  "description": "A equipe confere os pedidos manualmente.",
  "category": "automation",
  "effort": {
    "label": "Operação atual informada na solicitação",
    "source": "estimated",
    "items": [
      {
        "activityName": "Conferir pedido",
        "executionTimeMinutes": 15,
        "executionsPerPeriod": 20,
        "periodUnit": "day",
        "workingDaysPerMonth": 22,
        "peopleCount": 2,
        "monthlyHoursPerEmployee": 176
      }
    ]
  }
}
```

A medição inicial nasce como rascunho para que o cliente possa corrigi-la antes de concluir.

## Esforço operacional

O editor usa um fluxo guiado:

1. escolher antes ou depois da automação;
2. descrever as atividades;
3. informar tempo, frequência e pessoas;
4. revisar o cálculo mensal;
5. salvar para continuar depois ou concluir.

Função responsável, dias operados, capacidade mensal, fonte e observações permanecem em detalhes opcionais. O modelo continua aceitando múltiplas atividades, períodos diário/semanal/mensal/trimestral/anual, estimativas e medições históricas.

Os cálculos preservados são execuções mensais, horas corridas, horas de trabalho considerando todas as pessoas, pessoas equivalentes, redução mensal/anual e percentual de redução.

## Documento de-para

O documento é a unidade principal do mapeamento. Os campos estruturados não possuem mais uma aba paralela: aparecem dentro da área Documento, abaixo do conteúdo principal.

O administrador pode criar ou importar, vincular a um processo, definir a participação do cliente, configurar validações, publicar, versionar, arquivar, revisar alterações, restaurar histórico e exportar.

O cliente pode consultar ou preencher o documento, completar somente os campos liberados, registrar dúvidas e observações, baixar arquivos e acompanhar as próprias alterações.

O cliente nunca recebe a aba Revisão. O estado administrativo “aguardando revisão” é apresentado ao cliente apenas como “enviado para a equipe”.

## Permissões de mapeamento

- `none`: somente leitura;
- `selected`: somente os campos explicitamente liberados;
- `all`: documento e campos editáveis; adicionar e excluir linhas são permissões independentes.

Novos de-paras iniciados pela interface administrativa usam `all` por padrão, pois o fluxo principal é a equipe preparar e o cliente completar. O administrador pode alterar essa escolha antes da publicação.

## Garantias do backend

- Cliente só lista processos da própria empresa, visíveis e não arquivados.
- Cliente só lista de-paras publicados da própria empresa.
- Revisão, publicação, restauração administrativa e configurações exigem papel `admin`.
- Atualizações usam versão/revisão esperada para detectar concorrência.
- Processo e esforço inicial são criados atomicamente.
- Histórico funcional e auditoria de segurança continuam separados.
- O total de medições é exposto no processo para sinalização sem consultas extras.

## Verificação

```bash
cd backend
npm test

cd ../frontend
npm run lint
npm run build
```

Os testes cobrem permissões, criação de processo, esforço opcional atômico, medições, comparação antes/depois, publicação, edição seletiva, histórico, revisão, restauração e validações de mapeamento.
