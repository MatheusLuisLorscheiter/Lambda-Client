/**
 * GitHub Models API Client
 * Usa a API REST do GitHub Models para inferência de LLMs
 */

const GITHUB_MODELS_ENDPOINT = 'https://models.github.com/chat/completions';

const createChatCompletion = async ({ model, messages, maxTokens = 1000 }) => {
    const token = process.env.GITHUB_TOKEN;

    if (!token) {
        throw new Error('GITHUB_TOKEN não configurado. Adicione seu Personal Access Token nas variáveis de ambiente.');
    }

    const response = await fetch(GITHUB_MODELS_ENDPOINT, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            messages,
            max_tokens: maxTokens,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitHub Models API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data;
};

module.exports = {
    createChatCompletion
};
