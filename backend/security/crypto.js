const crypto = require('crypto');

const algorithm = 'aes-256-gcm';

const getKey = () => {
    const rawKey = process.env.ENCRYPTION_KEY;
    if (!rawKey) {
        throw new Error('ENCRYPTION_KEY is required');
    }

    const keyBuffer = Buffer.from(rawKey, 'hex');
    if (keyBuffer.length !== 32) {
        throw new Error('ENCRYPTION_KEY must be 32 bytes hex');
    }

    return keyBuffer;
};

const encrypt = (plainText) => {
    const key = getKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([iv, tag, encrypted]).toString('base64');
};

const decrypt = (encryptedText) => {
    const key = getKey();
    const data = Buffer.from(encryptedText, 'base64');
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const encrypted = data.subarray(28);
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
};

module.exports = { encrypt, decrypt };
