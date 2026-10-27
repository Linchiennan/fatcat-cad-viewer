// Public assets only. Cached shell NEVER constitutes authorization.
const BUILD = "__BUILD_ID__";
const PREFIX = `fatcat-access-v1-${new URL(self.registration.scope).pathname}-`;
const CORE = `${PREFIX}core-${BUILD}`;
const RUNTIME = `${PREFIX}runtime-${BUILD}`;
const PRECACHE = __PRECACHE__;
const RUNTIME_PRECACHE = __RUNTIME_PRECACHE__;
const assetURLs = new Set([...PRECACHE, ...RUNTIME_PRECACHE].map(p => new URL(p, self.registration.scope).href));
// Fetched past the browser's HTTP cache: GitHub Pages lets it keep files 10 minutes, and the engine keeps its name
// across versions, so a plain fetch could store the old engine under the new build (用戶 2026-10-27：更新後手機還是舊引擎).
const fresh = list => list.map(p => new Request(p, { cache: 'reload' }));
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    await Promise.all([caches.open(CORE).then(c => c.addAll(fresh(PRECACHE))), caches.open(RUNTIME).then(c => c.addAll(fresh(RUNTIME_PRECACHE)))]);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Preserve prior public bundles: an already-open CAD may still lazy-load its
    // old hashed modules after this worker activates. Never delete drawing stores.
    // Browser storage management can evict caches; readiness is checked separately.
    await self.clients.claim();
    for (const client of await self.clients.matchAll({ type: 'window' })) {
      if (client.url.startsWith(self.registration.scope)) client.postMessage({ type: 'fatcat-worker-ready', build: BUILD });
    }
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type !== 'fatcat-cache-status') return;
  event.waitUntil((async () => {
    let ready = false;
    try {
      const core = new Set((await (await caches.open(CORE)).keys()).map(r => r.url));
      const runtime = new Set((await (await caches.open(RUNTIME)).keys()).map(r => r.url));
      ready = PRECACHE.every(p => core.has(new URL(p, self.registration.scope).href)) &&
        RUNTIME_PRECACHE.every(p => runtime.has(new URL(p, self.registration.scope).href));
    } catch { /* blocked/evicted cache is not offline ready */ }
    event.source?.postMessage({ type: 'fatcat-cache-status', build: BUILD, ready });
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
  // Also serve exact previously precached public URLs for still-open old clients.
  event.respondWith((async () => {
    if (assetURLs.has(url.href)) {
      const hit = (await (await caches.open(CORE)).match(request)) || (await (await caches.open(RUNTIME)).match(request));
      if (hit) return hit;
    }
    for (const key of await caches.keys()) {
      if (!key.startsWith(PREFIX)) continue;
      const hit = await (await caches.open(key)).match(request); if (hit) return hit;
    }
    return fetch(request);
  })());
});
