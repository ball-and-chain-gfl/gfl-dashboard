// Minimal service worker — enables "installable" PWA status.
// Uses a network-first strategy so the dashboard always shows fresh
// ESPN data when online, and falls back to cache only when offline.
const CACHE = 'gfl-v1';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/logo.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_SHELL)));
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
  // Never cache API calls — always hit the network for live data.
  if (new URL(request.url).pathname.startsWith('/api/')) return;

  e.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
        return res;
      })
      .catch(() => caches.match(request).then((r) => r || caches.match('/')))
  );
});
