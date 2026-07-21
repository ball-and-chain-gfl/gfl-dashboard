// Service worker for the GFL dashboard PWA.
// App shell (HTML/JS/CSS/icons) uses STALE-WHILE-REVALIDATE so the app opens
// instantly from cache and quietly updates in the background. Live data
// (/api/*) and cross-origin requests (ESPN CDN, YouTube, fonts) always hit the
// network so standings stay fresh.
const CACHE = 'gfl-v2';
const APP_SHELL = [
  '/', '/index.html', '/app.js', '/config.js',
  '/manifest.webmanifest', '/logo.png',
  '/data/cm-official.json', '/data/awards.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_SHELL).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Live data: never cache — always the network.
  if (url.pathname.startsWith('/api/')) return;
  // Only handle same-origin assets; let the browser deal with cross-origin.
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    const network = fetch(request)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') cache.put(request, res.clone());
        return res;
      })
      .catch(() => null);
    // Serve cache instantly if we have it; refresh happens in the background.
    return cached || (await network) || cache.match('/');
  })());
});
