#!/usr/bin/env node
import { createCipheriv, createDecipheriv, pbkdf2, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const pbkdf2Async = promisify(pbkdf2);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultPlainPath = path.join(root, 'secrets', 'booking-ookawaso.json');

const KDF = {
    iterations: 600000,
    hash: 'SHA-256',
    saltBytes: 16,
    ivBytes: 12,
    keyBytes: 32
};

const LIMITS = {
    minPassphrase: 8,
    maxPassphrase: 1024,
    maxFields: 40,
    maxLabel: 40,
    maxValue: 4000
};

const FIELD_TEMPLATE = [
    { label: '予約番号', value: '' },
    { label: '宿泊代表', value: '' },
    { label: 'プラン', value: '' },
    { label: 'お部屋', value: '' },
    { label: '部屋数', value: '' },
    { label: '人数', value: '' },
    { label: 'チェックイン', value: '' },
    { label: 'チェックアウト', value: '' },
    { label: 'お食事', value: '' },
    { label: '料金', value: '' },
    { label: '備考', value: '' }
];

function fail(message) {
    console.error(message);
    process.exit(1);
}

function promptLine(question, { hidden = false } = {}) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true
        });
        const writable = rl.output;
        const original = writable.write.bind(writable);
        if (hidden) {
            writable.write = (chunk, encoding, callback) => {
                const text = chunk.toString();
                if (text.startsWith(question) || text === '\n' || text === '\r\n') {
                    return original(chunk, encoding, callback);
                }
                return original('', encoding, callback);
            };
        }
        rl.question(question, (answer) => {
            writable.write = original;
            rl.close();
            if (hidden) process.stdout.write('\n');
            resolve(answer);
        });
    });
}

function readPlaintext(filePath) {
    let raw;
    try {
        raw = readFileSync(filePath, 'utf8');
    } catch (err) {
        fail(`讀不到明文檔：${filePath}\n若尚未建立，請先執行：node tools/encrypt-booking.mjs --init`);
    }
    let data;
    try {
        data = JSON.parse(raw);
    } catch (err) {
        fail('明文檔不是合法的 JSON');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('明文檔必須是物件');
    for (const banned of ['passphrase', 'password', 'secret', 'key']) {
        if (Object.prototype.hasOwnProperty.call(data, banned)) {
            fail('明文檔不可包含 passphrase 或金鑰欄位，請只在提示時輸入');
        }
    }
    if (!Array.isArray(data.fields)) fail('明文檔需要 fields 陣列');
    if (data.fields.length < 1 || data.fields.length > LIMITS.maxFields) {
        fail(`欄位數量需介於 1 與 ${LIMITS.maxFields}`);
    }
    const fields = data.fields.map((field, index) => {
        const at = index + 1;
        if (!field || typeof field !== 'object') fail(`第 ${at} 欄格式不正確`);
        if (typeof field.label !== 'string' || !field.label.trim()) fail(`第 ${at} 欄缺少 label`);
        if (typeof field.value !== 'string') fail(`第 ${at} 欄的 value 必須是字串`);
        const label = field.label.trim();
        if (label.length > LIMITS.maxLabel) fail(`第 ${at} 欄 label 過長`);
        if (field.value.length > LIMITS.maxValue) fail(`第 ${at} 欄 value 過長`);
        return { label, value: field.value };
    }).filter((field) => field.value.trim());
    if (!fields.length) fail('請至少填寫一個訂房欄位');
    return { fields };
}

function assertPassphrase(passphrase) {
    const value = String(passphrase || '').normalize('NFC');
    if (value.length < LIMITS.minPassphrase) fail(`passphrase 至少 ${LIMITS.minPassphrase} 個字元`);
    if (value.length > LIMITS.maxPassphrase) fail('passphrase 過長');
    return value;
}

async function readPassphrase() {
    if (process.env.BOOKING_PASSPHRASE) {
        console.error('使用環境變數 BOOKING_PASSPHRASE。正式加密請改在提示時輸入，不要寫進檔案或指令。');
        return assertPassphrase(process.env.BOOKING_PASSPHRASE);
    }
    if (!process.stdin.isTTY) fail('請在終端機執行，以便輸入 passphrase');
    const first = assertPassphrase(await promptLine('共用 passphrase：', { hidden: true }));
    const second = assertPassphrase(await promptLine('再輸入一次 passphrase：', { hidden: true }));
    if (first !== second) fail('兩次 passphrase 不相同');
    return first;
}

async function encryptRecord(record, passphrase) {
    const plaintext = JSON.stringify(record);
    const salt = randomBytes(KDF.saltBytes);
    const iv = randomBytes(KDF.ivBytes);
    const key = await pbkdf2Async(passphrase, salt, KDF.iterations, KDF.keyBytes, 'sha256');
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const payload = {
        v: 1,
        alg: 'AES-GCM',
        kdf: 'PBKDF2',
        hash: 'SHA-256',
        iterations: KDF.iterations,
        salt: salt.toString('base64'),
        iv: iv.toString('base64'),
        data: Buffer.concat([ciphertext, cipher.getAuthTag()]).toString('base64')
    };
    key.fill(0);
    await verifyRoundTrip(payload, passphrase, plaintext);
    const serialized = JSON.stringify(payload);
    const leaked = plaintext.match(/[\u3040-\u30ff\u3400-\u9fff]{2,}/g) || [];
    if (leaked.some((word) => serialized.includes(word))) fail('輸出含有明文，已中止');
    return payload;
}

async function verifyRoundTrip(payload, passphrase, plaintext) {
    const salt = Buffer.from(payload.salt, 'base64');
    const iv = Buffer.from(payload.iv, 'base64');
    const packed = Buffer.from(payload.data, 'base64');
    const key = await pbkdf2Async(passphrase, salt, payload.iterations, KDF.keyBytes, 'sha256');
    const tag = packed.subarray(packed.length - 16);
    const body = packed.subarray(0, packed.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    let decoded;
    try {
        decoded = Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
    } catch (err) {
        fail('本機解密驗證失敗');
    }
    key.fill(0);
    if (decoded !== plaintext) fail('本機解密驗證失敗');

    const subtleKey = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(passphrase),
        'PBKDF2',
        false,
        ['deriveKey']
    );
    const aesKey = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: payload.iterations, hash: 'SHA-256' },
        subtleKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
    );
    const subtlePlain = new TextDecoder().decode(await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        packed
    ));
    if (subtlePlain !== plaintext) fail('瀏覽器解密驗證失敗');
}

function initPlaintext() {
    if (existsSync(defaultPlainPath)) fail(`明文檔已存在，未覆寫：${defaultPlainPath}`);
    mkdirSync(path.dirname(defaultPlainPath), { recursive: true });
    writeFileSync(defaultPlainPath, JSON.stringify({ fields: FIELD_TEMPLATE }, null, 2) + '\n', 'utf8');
    console.error(`已建立 ${path.relative(root, defaultPlainPath)}`);
    console.error('請只在這份本機檔案填寫訂房內容。此檔已排除於 Git，不要上傳或提交。');
}

function usage() {
    console.error(`用法
  node tools/encrypt-booking.mjs --init
  node tools/encrypt-booking.mjs [明文.json]

預設讀取 secrets/booking-ookawaso.json。
passphrase 只在提示時輸入，不會寫入明文檔或網站。
把輸出的 secret 物件貼到 index.html 對應預訂的 secret 欄位。`);
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
    usage();
    process.exit(0);
}
if (args.includes('--init')) {
    initPlaintext();
    process.exit(0);
}

const plainPath = path.resolve(args[0] || defaultPlainPath);
const record = readPlaintext(plainPath);
const passphrase = await readPassphrase();
const payload = await encryptRecord(record, passphrase);
console.log('secret: ' + JSON.stringify(payload, null, 4));
console.error('本機加解密驗證通過。輸出只有密文，請貼上 secret 後再鎖定明文檔，不要提交。');
