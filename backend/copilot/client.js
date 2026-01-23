const { CopilotClient } = require('@github/copilot-sdk');

let client = null;
let clientStartPromise = null;

const getCopilotClient = async () => {
    if (!client) {
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
