const CACHE_NAME = "memoria-creativa-v26";
const APP_SHELL = [
  "/memoria-creativa/",
  "/memoria-creativa/index.html",
  "/memoria-creativa/styles.css",
  "/memoria-creativa/app.js",
  "/memoria-creativa/manifest.webmanifest",
  "/memoria-creativa/assets/cards/clip.png",
  "/memoria-creativa/assets/cards/cuaderno.png",
  "/memoria-creativa/assets/cards/cutter.png",
  "/memoria-creativa/assets/cards/impresora.png",
  "/memoria-creativa/assets/cards/lapiz.png",
  "/memoria-creativa/assets/cards/pegamento.png",
  "/memoria-creativa/assets/cards/planner.png",
  "/memoria-creativa/assets/cards/regla.png",
  "/memoria-creativa/assets/cards/sello.png",
  "/memoria-creativa/assets/cards/sobre.png",
  "/memoria-creativa/assets/cards/stickers.png",
  "/memoria-creativa/assets/cards/washi-tape.png",
  "/memoria-creativa/assets/ui/trophy-badge.png",
  "/memoria-creativa/assets/ui/home-banner.png",
  "/memoria-creativa/assets/icons/icon-192.png",
  "/memoria-creativa/assets/icons/icon-512.png",
  "/memoria-creativa/assets/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin !== self.location.origin || !requestUrl.pathname.startsWith("/memoria-creativa/")) {
    return;
  }

  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          const shouldCache = networkResponse.ok && networkResponse.type === "basic";
          if (shouldCache) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          if (event.request.mode === "navigate") {
            return caches.match("/memoria-creativa/index.html");
          }
          return new Response("", { status: 404, statusText: "Offline asset not cached" });
        });
    })
  );
});
