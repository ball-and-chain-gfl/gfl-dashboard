// Service worker for the GFL dashboard PWA.
// SHELL (HTML/JS/CSS/icons): NETWORK-FIRST — always load the latest build when
// online, fall back to cache only when offline. This prevents the installed
// app from getting stuck on an old cached version.
// STATIC DATA (/data/*.json): stale-while-revalidate (fast; historical, rarely changes).
// LIVE DATA (/api/*) and cross-origin: straight to the network.
const CACHE = 'gfl-v163';
const APP_SHELL = [
  '/', '/index.html', '/app.js', '/config.js',
  '/manifest.webmanifest', '/logo.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_SHELL).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return;      // live data: network
  if (url.pathname.startsWith('/bg/')) return;       // background media: native (range requests)
  if (url.origin !== self.location.origin) return;    // cross-origin: browser handles

  // Static archived data: stale-while-revalidate.
  if (url.pathname.startsWith('/data/')) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      const net = fetch(request).then((res) => {
        if (res && res.status === 200) cache.put(request, res.clone());
        return res;
      }).catch(() => null);
      return cached || (await net) || cache.match('/');
    })());
    return;
  }

  // App shell + everything else same-origin: network-first, cache fallback.
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(request);
      if (res && res.status === 200 && res.type === 'basic') cache.put(request, res.clone());
      return res;
    } catch (err) {
      const cached = await cache.match(request);
      return cached || cache.match('/');
    }
  })());
});
