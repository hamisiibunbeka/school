/*
 * Service worker for the School Management PWA.
 *
 * Privacy first: school data (pages, JSON, uploads, exports) is NEVER cached —
 * those requests always go to the network. Only static, versioned assets
 * (built JS/CSS, fonts, icons) are cached so the app shell loads fast and an
 * offline page can be shown when there is no connection.
 */
const VERSION = 'v1';
const STATIC_CACHE = `school-static-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/icons/icon-512.png', '/favicon.svg'];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((k) => k.startsWith('school-static-') && k !== STATIC_CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim()),
    );
});

const isStaticAsset = (url) =>
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/build/assets/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/fonts/') || /\.(woff2?|ttf|svg|png|ico)$/.test(url.pathname));

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Hashed build assets & icons: cache-first (they never change for a given URL).
    if (isStaticAsset(url)) {
        event.respondWith(
            caches.match(request).then(
                (cached) =>
                    cached ||
                    fetch(request).then((response) => {
                        if (response.ok) {
                            const copy = response.clone();
                            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
                        }
                        return response;
                    }),
            ),
        );
        return;
    }

    // Full page navigations: always network (fresh, permission-checked data); offline page when unreachable.
    if (request.mode === 'navigate') {
        event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    }
    // Everything else (Inertia JSON, API, downloads) passes straight through — never cached.
});

self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') self.skipWaiting();
});
