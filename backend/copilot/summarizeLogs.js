const { getCopilotClient } = require('./client');

const DEFAULT_MODEL = process.env.COPILOT_MODEL || 'gpt-5-mini';
const MAX_LOGS = Number(process.env.COPILOT_MAX_LOGS) || 120;
const DEFAULT_TIMEOUT_MS = Number(process.env.COPILOT_SUMMARY_TIMEOUT_MS) || 60000;

const buildSystemMessage = () => ({
    content: [
        'Você é um analista de observabilidade e compliance. Sua tarefa é produzir um resumo organizado e fiel dos logs fornecidos.',
        'Releia os logs até 5 vezes antes de responder. Não invente fatos, causas ou números.',
        'Se algo não estiver explícito nos logs, diga claramente "Não foi possível inferir".',
        'Use apenas as informações presentes nos logs. Não use conhecimento externo.',
        'Apresente a resposta em português, objetiva e estruturada, sem raciocínio oculto.',
        'Inclua evidências citando trechos dos logs (com timestamp) que sustentem cada ponto importante.',
        'Se detectar erros, timeouts ou falhas, destaque-os com severidade.'
    ].join('\n')
});

const buildPrompt = ({
    integrationName,
    functionName,
    timeRange,
    filter,
    simplify,
    logs
}) => {
    const sanitizedLogs = logs.slice(0, MAX_LOGS).map(log => ({
        timestamp: log.timestamp,
        message: log.message,
        simplifiedMessage: log.simplifiedMessage,
        category: log.category,
        level: log.level,
        parsedReport: log.parsedReport
    }));

    return [
        'Contexto do resumo:',
        `- Integração: ${integrationName || 'não informado'}`,
        `- Função Lambda: ${functionName || 'não informado'}`,
        `- Filtro aplicado: ${filter || 'relevant'}`,
        `- Simplificar: ${simplify ? 'sim' : 'não'}`,
        `- Intervalo: ${timeRange?.start ? new Date(timeRange.start).toISOString() : 'n/a'} → ${timeRange?.end ? new Date(timeRange.end).toISOString() : 'n/a'}`,
        `- Total de logs recebidos: ${logs.length} (usando ${sanitizedLogs.length})`,
        '',
        'Tarefa:',
        '1) Resuma os eventos mais relevantes em ordem lógica.',
        '2) Liste erros/avisos críticos e sua evidência.',
        '3) Informe tendências ou padrões observáveis (se houver).',
        '4) Sugira próximos passos práticos (somente se suportados pelos logs).',
        '',
        'Formato de resposta esperado:',
        '## Resumo geral',
        '- ...',
        '## Erros e alertas',
        '- ...',
        '## Linha do tempo',
        '- [timestamp] ...',
        '## Recomendações',
        '- ...',
        '## Evidências',
        '- [timestamp] "trecho do log"',
        '',
        'Logs (JSON):',
        JSON.stringify(sanitizedLogs)
    ].join('\n');
};

const summarizeLogs = async ({ logs, summary, integration }) => {
    if (!logs?.length) {
        return {
            summary: 'Nenhum log disponível para o período e filtro selecionados.'
        };
    }

    const client = await getCopilotClient();
    const session = await client.createSession({
        model: DEFAULT_MODEL,
        systemMessage: buildSystemMessage()
    });

    const timeRange = {
        start: summary?.startTime || null,
        end: summary?.endTime || null
    };

    try {
        const response = await session.sendAndWait({
            prompt: buildPrompt({
                integrationName: integration?.name,
                functionName: integration?.function_name,
                timeRange,
                filter: summary?.filter,
                simplify: summary?.simplify,
                logs
            }),
            timeout: DEFAULT_TIMEOUT_MS
        });

        const content = response?.data?.content?.trim();

        return {
            summary: content || 'Não foi possível gerar o resumo no momento.'
        };
    } finally {
        await session.destroy();
    }
};

module.exports = {
    summarizeLogs
};
