// Ben Kimim? web: çevrimdışı açılış için basit önbellek.
// Önce ağdan dener (yeni sürüm hemen gelsin), ağ yoksa önbellekten açar. Hiçbir veri dışarı gönderilmez.
const CACHE = "benkimim-web-0.1";
const FILES = ["./", "index.html", "style.css?v=0.1", "scoring.js?v=0.1", "app.js?v=0.1", "data.json?v=0.1", "manifest.webmanifest",
  "icon-192.png", "icon-512.png", "apple-touch-icon.png", "logo.png", "favicon.png",
  "fonts/nunito-latin.woff2", "fonts/nunito-latin-ext.woff2"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: false }).then((r) => r || caches.match("index.html")))
  );
});
