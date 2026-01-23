const { getCopilotClient } = require('./client');

const DEFAULT_MODEL = process.env.COPILOT_MODEL || 'gpt-5';
const MAX_LOGS = Number(process.env.COPILOT_MAX_LOGS) || 120;
const DEFAULT_TIMEOUT_MS = Number(process.env.COPILOT_SUMMARY_TIMEOUT_MS) || 90000;
const FALLBACK_MAX_LOGS = Number(process.env.COPILOT_FALLBACK_MAX_LOGS) || 60;
const CHUNK_SIZE = Number(process.env.COPILOT_CHUNK_SIZE) || 40;
const CHUNK_TIMEOUT_MS = Number(process.env.COPILOT_CHUNK_TIMEOUT_MS) || 45000;
const FINAL_TIMEOUT_MS = Number(process.env.COPILOT_FINAL_TIMEOUT_MS) || 60000;
const COMPACT_TIMEOUT_MS = Number(process.env.COPILOT_COMPACT_TIMEOUT_MS) || 30000;

const buildSystemMessage = () => ({
    mode: 'append',
    content: [
        'Você é um analista de observabilidade e compliance. Sua tarefa é produzir um resumo organizado e fiel dos logs fornecidos.',
        'Releia os logs até 5 vezes antes de responder. Não invente fatos, causas ou números.',
        'Se algo não estiver explícito nos logs, diga claramente "Não foi possível inferir".',
        'Use apenas as informações presentes nos logs. Não use conhecimento externo.',
        'Apresente a resposta em português, MUITO objetiva e curta, sem raciocínio oculto.',
        'Limite total: no máximo 8 linhas e 600 caracteres.',
        'Não repita dados nem liste todos os eventos; só o essencial.',
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
    const sanitizedLogs = logs.map(log => ({
        timestamp: log.timestamp,
        message: log.simplifiedMessage || log.message,
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
        'Formato de resposta esperado (curto):',
        '## Resumo',
        '- 3 bullets no máximo',
        '## Alertas',
        '- até 2 bullets',
        '## Evidências',
        '- até 3 linhas com timestamp',
        '',
        'Logs (JSON):',
        JSON.stringify(sanitizedLogs)
    ].join('\n');
};

const buildChunkPrompt = ({
    integrationName,
    functionName,
    timeRange,
    filter,
    simplify,
    logs,
    chunkIndex,
    totalChunks
}) => {
    const sanitizedLogs = logs.map(log => ({
        timestamp: log.timestamp,
        message: log.simplifiedMessage || log.message,
        category: log.category,
        level: log.level,
        parsedReport: log.parsedReport
    }));

    return [
        'Você receberá um lote de logs para resumo parcial.',
        `- Lote ${chunkIndex} de ${totalChunks}`,
        `- Integração: ${integrationName || 'não informado'}`,
        `- Função Lambda: ${functionName || 'não informado'}`,
        `- Filtro aplicado: ${filter || 'relevant'}`,
        `- Simplificar: ${simplify ? 'sim' : 'não'}`,
        `- Intervalo: ${timeRange?.start ? new Date(timeRange.start).toISOString() : 'n/a'} → ${timeRange?.end ? new Date(timeRange.end).toISOString() : 'n/a'}`,
        `- Logs no lote: ${sanitizedLogs.length}`,
        '',
        'Tarefa do lote: 2 bullets no máximo, cada um com timestamp se possível.',
        'Se não houver algo, diga "Sem eventos relevantes".',
        '',
        'Formato:',
        '- [timestamp] resumo curto',
        '',
        'Logs (JSON):',
        JSON.stringify(sanitizedLogs)
    ].join('\n');
};

const buildFinalPrompt = ({
    integrationName,
    functionName,
    timeRange,
    filter,
    simplify,
    chunkSummaries
}) => [
    'Você receberá resumos parciais de vários lotes de logs.',
    'Consolide em um único resumo final, sem inventar informações.',
    `- Integração: ${integrationName || 'não informado'}`,
    `- Função Lambda: ${functionName || 'não informado'}`,
    `- Filtro aplicado: ${filter || 'relevant'}`,
    `- Simplificar: ${simplify ? 'sim' : 'não'}`,
    `- Intervalo: ${timeRange?.start ? new Date(timeRange.start).toISOString() : 'n/a'} → ${timeRange?.end ? new Date(timeRange.end).toISOString() : 'n/a'}`,
    '',
    'Formato de resposta esperado (curto):',
    '## Resumo',
    '- 3 bullets no máximo',
    '## Alertas',
    '- até 2 bullets',
    '## Evidências',
    '- até 3 linhas com timestamp',
    '',
    'Resumos parciais:',
    chunkSummaries.join('\n\n')
].join('\n');

const buildCompactPrompt = ({
    integrationName,
    functionName,
    timeRange,
    filter,
    simplify,
    summary,
    logs
}) => {
    const samples = logs.slice(0, 20).map(log => ({
        timestamp: log.timestamp,
        message: log.simplifiedMessage || log.message,
        level: log.level,
        category: log.category
    }));

    const topMessages = summary?.topMessages || [];

    return [
        'Você receberá um contexto compactado para gerar um resumo seguro e objetivo.',
        `- Integração: ${integrationName || 'não informado'}`,
        `- Função Lambda: ${functionName || 'não informado'}`,
        `- Filtro aplicado: ${filter || 'relevant'}`,
        `- Simplificar: ${simplify ? 'sim' : 'não'}`,
        `- Intervalo: ${timeRange?.start ? new Date(timeRange.start).toISOString() : 'n/a'} → ${timeRange?.end ? new Date(timeRange.end).toISOString() : 'n/a'}`,
        '',
        'Resumo estatístico:',
        `- Total de logs: ${summary?.total ?? 0}`,
        `- Erros: ${summary?.errors ?? 0}`,
        `- Timeouts: ${summary?.timeouts ?? 0}`,
        `- Duração média: ${summary?.avgDurationMs ? Math.round(summary.avgDurationMs) : 0} ms`,
        '',
        'Principais mensagens (contagem x mensagem):',
        topMessages.length ? topMessages.map(item => `- ${item.count}x ${item.message}`).join('\n') : '- Sem dados',
        '',
        'Amostras de logs:',
        JSON.stringify(samples),
        '',
        'Formato de resposta esperado (curto):',
        '## Resumo',
        '- 3 bullets no máximo',
        '## Alertas',
        '- até 2 bullets',
        '## Evidências',
        '- até 3 linhas com timestamp'
    ].join('\n');
};

const safeAbortSession = async (session) => {
    try {
        if (session?.abort) {
            await session.abort();
        }
    } catch {
        // ignore abort errors
    }
};

const safeDestroySession = async (session) => {
    try {
        if (session?.destroy) {
            await session.destroy();
        }
    } catch {
        // ignore destroy errors
    }
};

const sendWithTimeout = async (session, options, timeout) => {
    try {
        const response = await session.sendAndWait(options, timeout);
        return response;
    } catch (error) {
        const message = error?.message || '';
        if (message.toLowerCase().includes('timeout')) {
            // On timeout, try to abort the session to clean up any pending work
            await safeAbortSession(session);
        }
        throw error;
    }
};

const summarizeLogs = async ({ logs, summary, integration }) => {
    if (!logs?.length) {
        return {
            summary: 'Nenhum log disponível para o período e filtro selecionados.'
        };
    }

    const client = await getCopilotClient();
    let session = await client.createSession({
        model: DEFAULT_MODEL,
        systemMessage: buildSystemMessage()
    });

    const timeRange = {
        start: summary?.startTime || null,
        end: summary?.endTime || null
    };

    const buildPromptPayload = (logsSlice) => buildPrompt({
        integrationName: integration?.name,
        functionName: integration?.function_name,
        timeRange,
        filter: summary?.filter,
        simplify: summary?.simplify,
        logs: logsSlice
    });

    const primaryLogs = logs.slice(0, MAX_LOGS);

    const recreateSession = async () => {
        await safeDestroySession(session);
        session = await client.createSession({
            model: DEFAULT_MODEL,
            systemMessage: buildSystemMessage()
        });
    };

    try {
        if (primaryLogs.length <= CHUNK_SIZE) {
            const response = await sendWithTimeout(session, {
                prompt: buildPromptPayload(primaryLogs)
            }, DEFAULT_TIMEOUT_MS);

            const content = response?.data?.content?.trim();

            return {
                summary: content || 'Não foi possível gerar o resumo no momento.'
            };
        }

        const totalChunks = Math.ceil(primaryLogs.length / CHUNK_SIZE);
        const chunkSummaries = [];

        for (let i = 0; i < primaryLogs.length; i += CHUNK_SIZE) {
            const chunkIndex = Math.floor(i / CHUNK_SIZE) + 1;
            const chunkLogs = primaryLogs.slice(i, i + CHUNK_SIZE);

            try {
                const chunkResponse = await sendWithTimeout(session, {
                    prompt: buildChunkPrompt({
                        integrationName: integration?.name,
                        functionName: integration?.function_name,
                        timeRange,
                        filter: summary?.filter,
                        simplify: summary?.simplify,
                        logs: chunkLogs,
                        chunkIndex,
                        totalChunks
                    })
                }, CHUNK_TIMEOUT_MS);

                const chunkContent = chunkResponse?.data?.content?.trim() || 'Sem eventos relevantes.';
                chunkSummaries.push(`## Lote ${chunkIndex}\n${chunkContent}`);
            } catch (error) {
                const errorMessage = error?.message || 'Falha ao resumir este lote.';
                chunkSummaries.push(`## Lote ${chunkIndex}\nFalha ao resumir este lote: ${errorMessage}`);

                // On chunk error, recreate session to avoid state issues
                if (errorMessage.toLowerCase().includes('timeout')) {
                    await recreateSession();
                }
            }
        }

        const finalResponse = await sendWithTimeout(session, {
            prompt: buildFinalPrompt({
                integrationName: integration?.name,
                functionName: integration?.function_name,
                timeRange,
                filter: summary?.filter,
                simplify: summary?.simplify,
                chunkSummaries
            })
        }, FINAL_TIMEOUT_MS);

        const finalContent = finalResponse?.data?.content?.trim();

        return {
            summary: finalContent || 'Não foi possível gerar o resumo no momento.'
        };
    } catch (error) {
        const message = error?.message || '';
        const isTimeout = message.toLowerCase().includes('timeout');

        if (!isTimeout || primaryLogs.length <= FALLBACK_MAX_LOGS) {
            throw error;
        }

        await recreateSession();

        const fallbackLogs = primaryLogs.slice(0, FALLBACK_MAX_LOGS);
        const retryTimeout = Math.max(DEFAULT_TIMEOUT_MS, 120000);

        try {
            const retryResponse = await sendWithTimeout(session, {
                prompt: buildPromptPayload(fallbackLogs)
            }, retryTimeout);

            const retryContent = retryResponse?.data?.content?.trim();

            return {
                summary: retryContent || 'Não foi possível gerar o resumo no momento.'
            };
        } catch (retryError) {
            await recreateSession();

            const compactResponse = await sendWithTimeout(session, {
                prompt: buildCompactPrompt({
                    integrationName: integration?.name,
                    functionName: integration?.function_name,
                    timeRange,
                    filter: summary?.filter,
                    simplify: summary?.simplify,
                    summary,
                    logs: fallbackLogs
                })
            }, COMPACT_TIMEOUT_MS);

            const compactContent = compactResponse?.data?.content?.trim();

            return {
                summary: compactContent || 'Não foi possível gerar o resumo no momento.'
            };
        }
    } finally {
        await safeDestroySession(session);
    }
};

module.exports = {
    summarizeLogs
};
