const { createChatCompletion } = require('./client');

// Modelos disponíveis no GitHub Models: gpt-4o, gpt-4o-mini, gpt-5.1-mini, o1, o1-mini, etc.
const DEFAULT_MODEL = process.env.GITHUB_MODEL || 'gpt-5.1-mini';
const MAX_LOGS = Number(process.env.COPILOT_MAX_LOGS) || 120;
const CHUNK_SIZE = Number(process.env.COPILOT_CHUNK_SIZE) || 40;

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

const buildUserPrompt = ({
    integrationName,
    functionName,
    logs
}) => {
    const sanitizedLogs = logs.map(log => ({
        ts: log.timestamp,
        msg: log.simplifiedMessage || log.message,
        lvl: log.level
    }));

    return [
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

const buildChunkUserPrompt = ({ logs, chunkIndex, totalChunks }) => {
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

const buildFinalUserPrompt = ({ chunkSummaries }) => [
    'Consolide os resumos parciais abaixo em um resumo final seguindo o formato:',
    '',
    '📊 O que aconteceu:',
    '(explique em 2-3 frases simples)',
    '',
    '⚠️ Precisa de atenção?',
    '(diga se há algo preocupante)',
    '',
    '🔍 Quando ocorreu:',
    '(horários principais)',
    '',
    'Resumos parciais:',
    chunkSummaries.join('\n\n')
].join('\n');

const summarizeLogs = async ({ logs, summary, integration }) => {
    if (!logs?.length) {
        return {
            summary: 'Nenhum log disponível para o período e filtro selecionados.'
        };
    }

    const model = DEFAULT_MODEL;
    const primaryLogs = logs.slice(0, MAX_LOGS);

    console.log(`[github-models] iniciando resumo com modelo ${model}, ${primaryLogs.length} logs`);

    try {
        // Se poucos logs, processa direto
        if (primaryLogs.length <= CHUNK_SIZE) {
            const response = await createChatCompletion({
                model,
                messages: [
                    { role: 'system', content: SYSTEM_INSTRUCTIONS },
                    {
                        role: 'user', content: buildUserPrompt({
                            integrationName: integration?.name,
                            functionName: integration?.function_name,
                            logs: primaryLogs
                        })
                    }
                ],
                maxTokens: 800
            });

            const content = response?.choices?.[0]?.message?.content?.trim();
            console.log(`[github-models] resumo gerado com sucesso`);

            return {
                summary: content || 'Não foi possível gerar o resumo no momento.'
            };
        }

        // Muitos logs: processa em chunks
        const totalChunks = Math.ceil(primaryLogs.length / CHUNK_SIZE);
        const chunkSummaries = [];

        for (let i = 0; i < primaryLogs.length; i += CHUNK_SIZE) {
            const chunkIndex = Math.floor(i / CHUNK_SIZE) + 1;
            const chunkLogs = primaryLogs.slice(i, i + CHUNK_SIZE);

            console.log(`[github-models] processando chunk ${chunkIndex}/${totalChunks}`);

            try {
                const chunkResponse = await createChatCompletion({
                    model,
                    messages: [
                        { role: 'system', content: 'Resuma os logs de forma concisa em português.' },
                        {
                            role: 'user', content: buildChunkUserPrompt({
                                logs: chunkLogs,
                                chunkIndex,
                                totalChunks
                            })
                        }
                    ],
                    maxTokens: 300
                });

                const chunkContent = chunkResponse?.choices?.[0]?.message?.content?.trim() || 'Sem eventos relevantes.';
                chunkSummaries.push(`Lote ${chunkIndex}:\n${chunkContent}`);
            } catch (chunkError) {
                console.error(`[github-models] erro no chunk ${chunkIndex}:`, chunkError.message);
                chunkSummaries.push(`Lote ${chunkIndex}: Falha ao processar.`);
            }
        }

        // Consolida os chunks
        console.log(`[github-models] consolidando ${chunkSummaries.length} chunks`);

        const finalResponse = await createChatCompletion({
            model,
            messages: [
                { role: 'system', content: SYSTEM_INSTRUCTIONS },
                { role: 'user', content: buildFinalUserPrompt({ chunkSummaries }) }
            ],
            maxTokens: 800
        });

        const finalContent = finalResponse?.choices?.[0]?.message?.content?.trim();
        console.log(`[github-models] resumo final gerado com sucesso`);

        return {
            summary: finalContent || 'Não foi possível gerar o resumo no momento.'
        };

    } catch (error) {
        console.error('[github-models] erro ao gerar resumo:', error.message);
        throw error;
    }
};

module.exports = {
    summarizeLogs
};
