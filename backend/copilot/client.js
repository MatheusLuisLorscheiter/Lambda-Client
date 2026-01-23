let client = null;
let clientStartPromise = null;
let copilotClientClassPromise = null;

const getCopilotClientClass = async () => {
    if (!copilotClientClassPromise) {
        copilotClientClassPromise = import('@github/copilot-sdk')
            .then((module) => module.CopilotClient);
    }

    return copilotClientClassPromise;
};

const getCopilotClient = async () => {
    if (!client) {
        const CopilotClient = await getCopilotClientClass();
        client = new CopilotClient();
        clientStartPromise = client.start();
    }

    if (clientStartPromise) {
        await clientStartPromise;
    }

    return client;
};

const stopCopilotClient = async () => {
    if (!client) return;

    try {
        await client.stop();
    } finally {
        client = null;
        clientStartPromise = null;
    }
};

module.exports = {
    getCopilotClient,
    stopCopilotClient
};
