const CACHE_NAME = "cycle-garden-v17";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./core.js",
  "./report.js",
  "./lock.js",
  "./moonrise.js",
  "./fonts/InstrumentSerif-Regular.woff2",
  "./fonts/NotoSerifSC-cg-400.woff2",
  "./fonts/NotoSerifSC-cg-500.woff2",
  "./i18n.js",
  "./firebase-config.js",
  "./manifest.json",
  "./favicon.svg",
  "./icons/icon.svg",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

// Network-first: always try the network so code/UI updates show up immediately
// when online, and fall back to the cached copy when offline.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
