const { getCopilotClient } = require('./client');

const DEFAULT_MODEL = process.env.COPILOT_MODEL || 'gpt-5.1-codex-mini';
const MAX_LOGS = Number(process.env.COPILOT_MAX_LOGS) || 120;
const DEFAULT_TIMEOUT_MS = Number(process.env.COPILOT_SUMMARY_TIMEOUT_MS) || 60000;
const FALLBACK_MAX_LOGS = Number(process.env.COPILOT_FALLBACK_MAX_LOGS) || 60;
const CHUNK_SIZE = Number(process.env.COPILOT_CHUNK_SIZE) || 40;
const CHUNK_TIMEOUT_MS = Number(process.env.COPILOT_CHUNK_TIMEOUT_MS) || 45000;
const FINAL_TIMEOUT_MS = Number(process.env.COPILOT_FINAL_TIMEOUT_MS) || 60000;
const COMPACT_TIMEOUT_MS = Number(process.env.COPILOT_COMPACT_TIMEOUT_MS) || 30000;

const SYSTEM_INSTRUCTIONS = [
    'Você é um assistente que explica problemas técnicos de forma SIMPLES e HUMANA para pessoas sem conhecimento técnico.',
    'Escreva como se estivesse conversando com um amigo que não entende de tecnologia.',
    'NUNCA use termos técnicos como "Runtime", "module", "exception", "invoke", "init". Traduza para linguagem comum.',
    'Em vez de "Runtime.ImportModuleError", diga "um arquivo necessário não foi encontrado".',
    'Em vez de "exception", diga "erro" ou "problema".',
    'Em vez de "invoke/init", diga "quando o sistema tentou executar".',
    'Seja breve, claro e tranquilizador. Máximo 500 caracteres.',
    'Se detectar problemas, explique o impacto prático (ex: "isso pode estar impedindo pedidos de serem criados").',
    'Não invente. Se não souber, diga "não foi possível identificar".'
].join(' ');

const buildPrompt = ({
    integrationName,
    functionName,
    timeRange,
    filter,
    simplify,
    logs
}) => {
    const sanitizedLogs = logs.map(log => ({
        ts: log.timestamp,
        msg: log.simplifiedMessage || log.message,
        lvl: log.level
    }));

    return [
        SYSTEM_INSTRUCTIONS,
        '',
        `Sistema analisado: ${functionName || integrationName || 'Sistema'}`,
        `Quantidade de registros: ${sanitizedLogs.length}`,
        '',
        'Responda neste formato simples:',
        '',
        '📊 O que aconteceu:',
        '(explique em 2-3 frases simples o que os registros mostram)',
        '',
        '⚠️ Precisa de atenção?',
        '(diga se há algo preocupante e o que pode significar na prática)',
        '',
        '🔍 Quando ocorreu:',
        '(mencione os horários principais em formato legível como "20/01 às 15:27")',
        '',
        'Registros para analisar:',
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
        ts: log.timestamp,
        msg: log.simplifiedMessage || log.message,
        lvl: log.level
    }));

    return [
        `Lote ${chunkIndex}/${totalChunks} - Resuma em 2 bullets com timestamp:`,
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
    'Consolide os resumos parciais abaixo em um resumo final curto:',
    '## Resumo\n- (3 bullets)',
    '## Alertas\n- (se houver)',
    '## Evidências\n- [timestamp] descrição',
    '',
    'Parciais:',
    chunkSummaries.join('\n')
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
    const samples = logs.slice(0, 10).map(log => ({
        ts: log.timestamp,
        msg: log.simplifiedMessage || log.message,
        lvl: log.level
    }));

    return [
        SYSTEM_INSTRUCTIONS,
        '',
        `Função: ${functionName || integrationName || 'Lambda'}`,
        `Stats: ${summary?.total ?? 0} logs, ${summary?.errors ?? 0} erros`,
        '',
        '## Resumo\\n- (3 bullets)',
        '## Alertas\\n- (se houver)',
        '',
        'Amostras:',
        JSON.stringify(samples)
    ].join('\\n');
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
        model: DEFAULT_MODEL
    });

    // Debug: log session events
    session.on((event) => {
        console.log(`[copilot] evento: ${event.type}`);
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
            model: DEFAULT_MODEL
        });
        session.on((event) => {
            console.log(`[copilot] evento: ${event.type}`);
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
