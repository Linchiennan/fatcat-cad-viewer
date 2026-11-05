// Public assets only. Cached shell NEVER constitutes authorization.
const BUILD = "__BUILD_ID__";
const PREFIX = `fatcat-access-v1-${new URL(self.registration.scope).pathname}-`;
const CORE = `${PREFIX}core-${BUILD}`;
// Fonts and engines are kept across versions, each under its content hash: a new version re-downloads only the files
// that changed. Copying all of them per version re-downloaded 40 MB on every update and kept every old copy
// (用戶 2026-11-05：發布後手機開圖超慢).
const RUNTIME = `${PREFIX}runtime-files`;
const PRECACHE = __PRECACHE__;
const RUNTIME_PRECACHE = __RUNTIME_PRECACHE__;
const RUNTIME_HASHES = __RUNTIME_HASHES__;
const href = p => new URL(p, self.registration.scope).href;
const versioned = p => `${href(p)}?fatcat-v=${RUNTIME_HASHES[p] ?? BUILD}`;
const runtimeKeys = new Map(RUNTIME_PRECACHE.map(p => [href(p), versioned(p)]));
const assetURLs = new Set([...PRECACHE, ...RUNTIME_PRECACHE].map(href));
// Fetched past the browser's HTTP cache: GitHub Pages lets it keep files 10 minutes, and the engine keeps its name
// across versions, so a plain fetch could store the old engine under the new build (用戶 2026-10-27：更新後手機還是舊引擎).
const fresh = list => list.map(p => new Request(p, { cache: 'reload' }));
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const runtime = await caches.open(RUNTIME);
    // Copies the old per-version caches hold are reused when their bytes still match, so moving to this layout
    // does not download them again either.
    const legacy = (await caches.keys()).filter(k => k.startsWith(`${PREFIX}runtime-`) && k !== RUNTIME);
    const reuse = async p => {
      for (const key of legacy) {
        const old = await (await caches.open(key)).match(href(p));
        if (!old) continue;
        const bytes = await old.clone().arrayBuffer();
        const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
        if (digest.startsWith(RUNTIME_HASHES[p] ?? '-')) { await runtime.put(versioned(p), old); return true; }
      }
      return false;
    };
    const missing = [];
    for (const p of RUNTIME_PRECACHE) if (!(await runtime.match(versioned(p))) && !(await reuse(p))) missing.push(p);
    await Promise.all([
      caches.open(CORE).then(c => c.addAll(fresh(PRECACHE))),
      Promise.all(fresh(missing).map(async (request, i) => {
        const response = await fetch(request);
        if (!response.ok) throw Error(`${missing[i]} ${response.status}`);
        await runtime.put(versioned(missing[i]), response);
      })),
    ]);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Preserve prior public bundles: an already-open CAD may still lazy-load its
    // old hashed modules after this worker activates. Never delete drawing stores.
    // Browser storage management can evict caches; readiness is checked separately.
    await self.clients.claim();
    // Runtime files are shared by all versions now: drop other versions of them and the old per-version copies.
    const runtime = await caches.open(RUNTIME), wanted = new Set(runtimeKeys.values());
    for (const request of await runtime.keys()) if (!wanted.has(request.url)) await runtime.delete(request);
    for (const key of await caches.keys()) if (key.startsWith(`${PREFIX}runtime-`) && key !== RUNTIME) await caches.delete(key);
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
      ready = PRECACHE.every(p => core.has(href(p))) && RUNTIME_PRECACHE.every(p => runtime.has(versioned(p)));
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
    if (runtimeKeys.has(url.href)) {
      const hit = await (await caches.open(RUNTIME)).match(runtimeKeys.get(url.href));
      if (hit) return hit;
    }
    if (assetURLs.has(url.href)) {
      const hit = await (await caches.open(CORE)).match(request);
      if (hit) return hit;
    }
    for (const key of await caches.keys()) {
      if (!key.startsWith(PREFIX) || key === RUNTIME) continue;
      const hit = await (await caches.open(key)).match(request); if (hit) return hit;
    }
    return fetch(request);
  })());
});
