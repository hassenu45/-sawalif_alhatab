const CACHE_NAME = 'sawalif-v2';
const ASSETS = [
    'index.html',
    'login.html',
    'login.css',
    'manifest.json',
    'shay.png',
    'dhrah.png',
    'bushar.png',
    'kerk.png',
    'ady.png',
    '12.jpg',
    'wired-outline-3042-bonfire-hover-pinch.gif',
    '5392928583_pin.mp4'
];

// On install: pre-cache all static assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })));
        }).then(() => self.skipWaiting())
    );
});

// On activate: clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// Fetch: serve from cache first (Cache First strategy for maximum performance)
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Never cache API calls — always go to network
    if (url.pathname.startsWith('/api/')) {
        return;
    }

    // Only cache GET requests, skip cross-origin
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;

            return fetch(event.request).then(response => {
                if (!response || response.status !== 200 || response.type === 'opaque') {
                    return response;
                }
                const copy = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
                return response;
            }).catch(() => {
                // Offline fallback for HTML pages
                if (event.request.destination === 'document') {
                    return caches.match('index.html');
                }
            });
        })
    );
});
