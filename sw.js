// 先問網站有沒有新版（不用瀏覽器暫存；3 秒內沒回應就用存好的版本），讓離線也能打開
const CACHE = 'gongtuo-fund-2026.11.18.8';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'data.js', 'sample.js', 'xlsx.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-180.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('gongtuo-fund-') && k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await Promise.race([fetch(e.request, { cache: 'no-cache' }), new Promise((_, rej) => setTimeout(() => rej('timeout'), 3000))]);
      if (res && res.ok) cache.put(e.request, res.clone());
      return res;
    } catch (err) {
      return (await cache.match(e.request, { ignoreSearch: true })) || (await cache.match('index.html')) || Response.error();
    }
  })());
});
