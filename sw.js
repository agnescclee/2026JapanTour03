/* 離線行程 Service Worker。
   範圍是這個檔案所在的目錄，因此 GitHub Pages 子目錄（/2026JapanTour03/）與本機根目錄都能用。
   不安裝時預先快取，也不 skipWaiting / clients.claim，避免一打開頁面就把正在看的版本換掉。
   只有使用者完整下載成功後，才會把那一份快取標成可離線使用。 */

const META_CACHE = 'trip-offline-meta';
const META_PATH = 'offline-pack-meta';

function metaUrl() {
    return new URL(META_PATH, self.registration.scope).href;
}

async function readOfflineMeta() {
    const cache = await caches.open(META_CACHE);
    const response = await cache.match(metaUrl());
    if (!response) return null;
    try {
        const meta = await response.json();
        if (!meta || typeof meta.cacheName !== 'string' || !Array.isArray(meta.files)) return null;
        return meta;
    } catch (err) {
        return null;
    }
}

function isSecretPath(url) {
    return url.pathname.split('/').includes('secrets');
}

async function serveSnapshot(request) {
    const meta = await readOfflineMeta();
    if (!meta) {
        return new Response('尚未儲存離線行程', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
    const cache = await caches.open(meta.cacheName);
    const scopeUrl = new URL(self.registration.scope);
    let match = await cache.match(request, { ignoreSearch: true });
    if (!match && request.mode === 'navigate') {
        match = await cache.match(new URL('index.html', scopeUrl).href)
            || await cache.match(scopeUrl.href);
    }
    if (!match) {
        const url = new URL(request.url);
        const relative = url.pathname.startsWith(scopeUrl.pathname)
            ? url.pathname.slice(scopeUrl.pathname.length)
            : '';
        if (relative) match = await cache.match(new URL(relative, scopeUrl).href);
    }
    return match || new Response('這個檔案不在已下載的離線行程裡', {
        status: 504,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
}

self.addEventListener('install', () => {
    /* 刻意不呼叫 skipWaiting。新的 Service Worker 會等這個分頁關掉後才接手。 */
});

self.addEventListener('activate', () => {
    /* 刻意不呼叫 clients.claim。目前打開的頁面繼續用這一輪從網路載入的檔案。 */
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (isSecretPath(url) || url.pathname.endsWith('/' + META_PATH) || url.pathname.endsWith(META_PATH)) return;

    event.respondWith((async () => {
        try {
            return await fetch(request);
        } catch (err) {
            return serveSnapshot(request);
        }
    })());
});
