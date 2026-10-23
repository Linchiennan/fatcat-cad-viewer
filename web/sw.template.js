// Public assets only. Cached shell NEVER constitutes authorization.
const BUILD = "__BUILD_ID__";
const PREFIX = `fatcat-access-v1-${new URL(self.registration.scope).pathname}-`;
const CORE = `${PREFIX}core-${BUILD}`;
const RUNTIME = `${PREFIX}runtime-${BUILD}`;
const PRECACHE = __PRECACHE__;
const RUNTIME_PRECACHE = __RUNTIME_PRECACHE__;
const assetURLs = new Set([...PRECACHE, ...RUNTIME_PRECACHE].map(p => new URL(p, self.registration.scope).href));
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    await Promise.all([caches.open(CORE).then(c => c.addAll(PRECACHE)), caches.open(RUNTIME).then(c => c.addAll(RUNTIME_PRECACHE))]);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(PREFIX) && key !== CORE && key !== RUNTIME) await caches.delete(key);
      // Remove legacy caches only when ALL entries belong to this exact application scope.
      if (/^fatcat-(core|runtime)-/.test(key)) {
        const cache = await caches.open(key); const keys = await cache.keys();
        if (keys.length && keys.every(r => r.url.startsWith(self.registration.scope))) await caches.delete(key);
      }
    }
    await self.clients.claim();
    for (const client of await self.clients.matchAll({ type: 'window' })) {
      if (client.url.startsWith(self.registration.scope)) client.postMessage({ type: 'fatcat-worker-ready', build: BUILD });
    }
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request; const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope) || request.headers.has('range')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await (await caches.open(CORE)).match('./index.html')) || Response.error()));
    return;
  }
  // Exact allowlist (no query-string normalization). Never intercept Google/Firebase or user files.
  if (!assetURLs.has(url.href)) return;
  event.respondWith((async () => {
    return (await (await caches.open(CORE)).match(request)) || (await (await caches.open(RUNTIME)).match(request)) || fetch(request);
  })());
});
