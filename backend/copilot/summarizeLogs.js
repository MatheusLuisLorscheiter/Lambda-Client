const { createChatCompletion } = require('./client');

// Modelos disponíveis: openai/gpt-5-mini, openai/gpt-4o, openai/gpt-4.1, etc.
// Formato: {publisher}/{model_name}
const DEFAULT_MODEL = process.env.GITHUB_MODEL || 'openai/gpt-5-mini';
const MAX_LOGS = Number(process.env.COPILOT_MAX_LOGS) || 120;
const CHUNK_SIZE = Number(process.env.COPILOT_CHUNK_SIZE) || 40;

const SYSTEM_INSTRUCTIONS = [
    'Você é um assistente que explica registros técnicos de forma MUITO simples, humana e tranquilizadora para pessoas leigas.',
    'A resposta deve ser SEMPRE otimista, positiva e reconfortante. NUNCA use tom negativo, alarmista ou crítico.',
    'Não use palavras como "erro", "falha", "problema", "crítico", "grave", "preocupante". Prefira "sinais pontuais", "variações normais", "rotina", "ajustes automáticos".',
    'Sempre transmita que o sistema segue operando e está sob monitoramento contínuo.',
    'Se houver algo anômalo nos registros, trate como algo leve e passageiro, com mensagem de confiança.',
    'Não culpe ninguém e não sugira impacto severo. Nunca sugira que o cliente está prejudicado.',
    'Fale como um amigo que não entende de tecnologia e está tranquilo.',
    'NUNCA use termos técnicos como "Runtime", "module", "exception", "invoke", "init". Traduza para linguagem comum.',
    'Se não souber algo, diga "não foi possível identificar com clareza" e mantenha o tom positivo.',
    'Seja breve, claro e leve. Máximo 500 caracteres.'
].join(' ');

const formatTimestamp = (timestamp) => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return String(timestamp);
    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
};

const buildUserPrompt = ({
    integrationName,
    functionName,
    logs
}) => {
    const sanitizedLogs = logs.map(log => ({
        ts: formatTimestamp(log.timestamp),
        msg: log.simplifiedMessage || log.message,
        lvl: log.level
    }));

    return [
        `Sistema analisado: ${functionName || integrationName || 'Sistema'}`,
        `Quantidade de registros: ${sanitizedLogs.length}`,
        '',
        'Responda neste formato leve e positivo:',
        '',
        '✨ Resumo:',
        '(2-3 frases simples, sempre tranquilizadoras)',
        '',
        '🧘 Status geral:',
        '(mostre que está tudo sob controle; se houver sinais pontuais, diga que são variações normais)',
        '',
        '🕒 Quando ocorreu:',
        '(mencione horários principais em formato legível)',
        '',
        '✅ Monitoramento:',
        '(uma frase curta dizendo que o sistema segue acompanhado de perto)',
        '',
        'Registros para analisar:',
        JSON.stringify(sanitizedLogs)
    ].join('\n');
};

const buildChunkUserPrompt = ({ logs, chunkIndex, totalChunks }) => {
    const sanitizedLogs = logs.map(log => ({
        ts: formatTimestamp(log.timestamp),
        msg: log.simplifiedMessage || log.message,
        lvl: log.level
    }));

    return [
        `Lote ${chunkIndex}/${totalChunks} - Resuma em 2 bullets com timestamp, mantendo tom positivo:`,
        JSON.stringify(sanitizedLogs)
    ].join('\n');
};

const buildFinalUserPrompt = ({ chunkSummaries }) => [
    'Consolide os resumos parciais abaixo em um resumo final leve e otimista seguindo o formato:',
    '',
    '✨ Resumo amigável:',
    '(2-3 frases simples, tranquilizadoras)',
    '',
    '🧘 Status geral:',
    '(sempre positivo; se houver sinais pontuais, diga que são ajustes normais)',
    '',
    '🕒 Quando ocorreu:',
    '(horários principais)',
    '',
    '✅ Monitoramento:',
    '(uma frase curta dizendo que o sistema segue acompanhado)',
    '',
    'Resumos parciais:',
    chunkSummaries.join('\n\n')
].join('\n');

const extractCompletionText = (response) => {
    if (!response) return null;
    const choice = response.choices?.[0];
    if (!choice) return null;
    if (typeof choice.message?.content === 'string') return choice.message.content.trim();
    if (typeof choice.message?.text === 'string') return choice.message.text.trim();
    if (typeof choice.text === 'string') return choice.text.trim();
    if (typeof choice.content === 'string') return choice.content.trim();
    return null;
};

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
                max_completion_tokens: 800
            });

            const content = extractCompletionText(response);
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
                    max_completion_tokens: 300
                });

                const chunkContent = extractCompletionText(chunkResponse) || 'Sem eventos relevantes.';
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
            max_completion_tokens: 800
        });

        const finalContent = extractCompletionText(finalResponse);
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
