const CACHE_NAME = 'aral-costos-suscriptoras-v1';
const OFFLINE_URLS = ['/app/aral-costos/', '/app/aral-costos/index.html', '/app/aral-costos/manifest.webmanifest'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS)));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/app/aral-costos/')) return;
  event.respondWith(fetch(event.request).then((res) => {
    const copy = res.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
    return res;
  }).catch(() => caches.match(event.request).then((c) => c || caches.match('/app/aral-costos/index.html'))));
});
