import { gcm } from '@noble/ciphers/aes.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

const MIN_ITERATIONS = 100000;
const MAX_ITERATIONS = 2000000;

function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
}

async function decryptBookingSecretFallback(payload, passphrase) {
    if (!payload || payload.v !== 1 || payload.alg !== 'AES-GCM' || payload.kdf !== 'PBKDF2' || payload.hash !== 'SHA-256') {
        throw new Error('不支援的加密格式');
    }
    const iterations = payload.iterations;
    if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
        throw new Error('不支援的加密格式');
    }
    const salt = b64ToBytes(payload.salt);
    const iv = b64ToBytes(payload.iv);
    const data = b64ToBytes(payload.data);
    if (salt.length < 16 || salt.length > 64 || iv.length !== 12 || data.length < 17 || data.length > 65536) {
        throw new Error('不支援的加密格式');
    }
    const key = await pbkdf2Async(sha256, String(passphrase).normalize('NFC'), salt, {
        c: iterations,
        dkLen: 32,
        asyncTick: 16
    });
    try {
        const plainBytes = gcm(key, iv).decrypt(data);
        return new TextDecoder().decode(plainBytes);
    } catch (err) {
        const failure = new Error('passphrase 不正確');
        failure.name = 'OperationError';
        throw failure;
    }
}

globalThis.BookingCryptoFallback = { decryptBookingSecretFallback };
