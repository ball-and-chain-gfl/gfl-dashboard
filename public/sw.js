// Service worker for the GFL dashboard PWA.
// SHELL (HTML/JS/CSS/icons): NETWORK-FIRST — always load the latest build when
// online, fall back to cache only when offline. This prevents the installed
// app from getting stuck on an old cached version.
// STATIC DATA (/data/*.json): the season being played is network-first (it is
// still being written); finished seasons are stale-while-revalidate.
// LIVE DATA (/api/*) and cross-origin: straight to the network.
const CACHE = 'gfl-v593';
// The archive lives in its own cache, deliberately NOT carrying the version.
// Every bump of CACHE wipes every other cache on activate, and the shell is
// bumped on every user-facing change — so a season file that has not altered
// since 2022 was being re-downloaded after each deploy. That is ~3.7MB across
// forty requests today, and it grows by about 715KB a season. Keeping it out of
// the versioned cache means an app update costs the shell and nothing else.
const DATA_CACHE = 'gfl-data-v1';
const APP_SHELL = [
  '/', '/index.html', '/app.js', '/config.js',
  '/manifest.webmanifest', '/logo.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_SHELL).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys
        .filter((k) => k !== CACHE && k !== DATA_CACHE)
        .map((k) => caches.delete(k)))
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

  // Static archived data, in the cache that survives a version bump.
  //
  // A FINISHED season's file never changes again, so it is served straight from
  // cache and refreshed behind the scenes — that is the whole point of keeping
  // this cache off the version, and it saves re-downloading megabytes of
  // settled history on every deploy.
  //
  // THE SEASON BEING PLAYED IS NOT THAT. transactions-<current>.json is
  // rewritten by the archiver twice a week and weekly-<current>.json after
  // every week; stale-while-revalidate hands back the PREVIOUS copy and only
  // repairs itself on the load after. That is how the waiver bids captured on
  // Sunday were still reading as an empty file on Monday — the archive was
  // right, the page was a run behind, and nothing looked broken. Two loads to
  // see a number that already exists is not a cache, it is a bug with a
  // fallback. The current season goes network-first, cache only when the
  // network cannot answer.
  if (url.pathname.startsWith('/data/')) {
    e.respondWith((async () => {
      const cache = await caches.open(DATA_CACHE);
      // NFL seasons are named for the year they start, and roll over in March.
      const now = new Date();
      const live = String(now.getUTCMonth() >= 2 ? now.getUTCFullYear() : now.getUTCFullYear() - 1);
      const isLive = url.pathname.includes(live);
      if (isLive) {
        try {
          /* no-store, or this is not actually network-first. Vercel serves
             these with max-age=300, so a plain fetch here is answered by the
             browser HTTP cache for five minutes and the worker faithfully
             stores that stale copy — which looked exactly like the bug it was
             meant to fix. The shell branch below has always done this, for the
             same reason. */
          const res = await fetch(request, { cache: 'no-store' });
          if (res && res.status === 200) { cache.put(request, res.clone()); return res; }
        } catch (err) { /* offline: fall through to whatever was kept */ }
        return (await cache.match(request)) || Response.error();
      }
      const cached = await cache.match(request);
      const net = fetch(request).then((res) => {
        if (res && res.status === 200) cache.put(request, res.clone());
        return res;
      }).catch(() => null);
      return cached || (await net) || cache.match('/');
    })());
    return;
  }

  // App shell + everything else same-origin: network-first WITH A TIMEOUT.
  //
  // HTML/JS/CSS/manifest are fetched with cache:'no-store' so a stale HTTP-cache
  // copy can never be handed back to an installed home-screen app. That part
  // stays. What did not work was waiting on it forever: index.html and app.js
  // are about 430KB gzipped between them, and they were downloaded in full on
  // EVERY open — not just after a deploy — with the cached copy used only if the
  // network actually threw. On a phone on a bad signal that is the whole of the
  // "it takes forever to load" complaint, and it happens before a line of the
  // app has run.
  //
  // So the network gets SHELL_TIMEOUT_MS to answer. Past that, whatever is in
  // the cache is served and the request is left running, so the new build lands
  // in the cache and is what opens next time. The app is never STUCK on an old
  // version — which is what network-first was protecting — it is at most one
  // load behind, and only on a connection too slow to have delivered the new one
  // in a second and a half anyway.
  //
  // Nothing is served from cache before the network has had its chance, and a
  // cold cache still waits: there is nothing else to show.
  const SHELL_TIMEOUT_MS = 1500;
  const bustable = /\.(?:html|js|css|webmanifest|json)$/.test(url.pathname)
    || url.pathname === '/' || request.mode === 'navigate';
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const net = (async () => {
      let res;
      if (bustable) {
        try { res = await fetch(request, { cache: 'no-store' }); }
        catch (e2) { res = await fetch(request); }
      } else {
        res = await fetch(request);
      }
      if (res && res.status === 200 && res.type === 'basic') cache.put(request, res.clone());
      return res;
    })();
    const cached = await cache.match(request);
    if (!cached) {
      try { return await net; } catch (err) { return cache.match('/'); }
    }
    const settled = await Promise.race([
      net.catch(() => null),
      new Promise((r) => setTimeout(() => r(null), SHELL_TIMEOUT_MS)),
    ]);
    if (settled) return settled;
    // Still in the air, or it failed. Serve what we have and let it finish
    // writing to the cache for next time; an unhandled rejection here would be
    // reported against the worker.
    net.catch(() => {});
    return cached;
  })());
});
