// App-shell service worker (DEV-69). Deliberately does NOT precache anything
// at install time — the site is gated by HTTP Basic Auth (functions/_middleware.ts),
// and a service worker's own out-of-band fetch() during install is a
// plausible way to race that auth and cache a 401 as if it were the real
// asset. Instead this only ever caches responses that pass through the
// `fetch` event for a request the page itself already made (and the browser
// already resolved auth for) — so nothing gets cached that wasn't already
// legitimately loaded, and every cache write is still gated on `res.ok`
// below as a second safety net.
//
// /api/board is explicitly never touched: this is a status dashboard, and a
// service worker quietly serving a stale cached board on a network failure
// would be more misleading than the app's own visible stale/disconnected
// state (see App.tsx). The early return below hands API requests straight
// through, uncached, exactly as if this service worker didn't exist.
const SHELL_CACHE = 'mc-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Caching is done via event.waitUntil rather than a detached
  // `.then(...)` off to the side: without it, the browser is free to kill
  // this worker the instant the response returned from respondWith is
  // delivered, which raced the (unawaited) cache write and left the cache
  // silently empty — caught by actually inspecting Cache Storage after a
  // load, not by assuming the write completed.

  if (request.mode === 'navigate') {
    // HTML is network-first: a deploy changes which hashed JS/CSS files the
    // page references, so the document itself must always come from the
    // network when there is one. Cache is only a fallback for genuinely
    // being offline.
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          if (res.ok) {
            const cache = await caches.open(SHELL_CACHE);
            event.waitUntil(cache.put(request, res.clone()));
          }
          return res;
        } catch {
          return (await caches.match(request)) || (await caches.match('/'));
        }
      })(),
    );
    return;
  }

  // Everything else same-origin (JS/CSS/images/icons) is content-hashed by
  // Vite, so a given URL's content never changes — cache-first is safe and
  // gives instant repeat loads, with network as the fallback on a cache miss.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const res = await fetch(request);
      if (res.ok) {
        const cache = await caches.open(SHELL_CACHE);
        event.waitUntil(cache.put(request, res.clone()));
      }
      return res;
    })(),
  );
});
