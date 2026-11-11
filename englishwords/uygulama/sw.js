// English Words for Kids · Web — çevrimdışı açılış.
// Uygulama kabuğu önbellekte; açılan resim ve sesler (cache-first) bir kere indirilince internetsiz de açılır.
// Hiçbir veri dışarı gönderilmez; sadece aynı adresten dosya alınır.
const SURUM = "1.8.16";
const KABUK = "ewk-kabuk-" + SURUM;
const MEDYA = "ewk-medya-v1";
const DOSYALAR = [
  "./", "index.html", "style.css", "app.js", "config.js", "manifest.webmanifest", "data/kelimeler.json",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "icons/sunflower-logo.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(KABUK).then((c) => c.addAll(DOSYALAR)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((adlar) => Promise.all(adlar.filter((a) => a !== KABUK && a !== MEDYA).map((a) => caches.delete(a))))
      .then(() => self.clients.claim())
  );
});

function araliCevap(yanit, aralik) {
  const m = /bytes=(\d*)-(\d*)/.exec(aralik);
  if (!m) return yanit;
  return yanit.arrayBuffer().then((buf) => {
    const toplam = buf.byteLength;
    let bas = m[1] === "" ? Math.max(0, toplam - parseInt(m[2], 10)) : parseInt(m[1], 10);
    let son = m[1] === "" || m[2] === "" ? toplam - 1 : Math.min(parseInt(m[2], 10), toplam - 1);
    if (bas > son || bas >= toplam) return new Response("", { status: 416, headers: { "Content-Range": "bytes */" + toplam } });
    const parca = buf.slice(bas, son + 1);
    return new Response(parca, {
      status: 206,
      headers: {
        "Content-Type": yanit.headers.get("Content-Type") || "audio/mp4",
        "Content-Range": "bytes " + bas + "-" + son + "/" + toplam,
        "Content-Length": String(parca.byteLength),
        "Accept-Ranges": "bytes"
      }
    });
  });
}

async function medya(istek) {
  const c = await caches.open(MEDYA);
  const url = istek.url;
  let yanit = await c.match(url);
  if (!yanit) {
    try {
      const ag = await fetch(url, { credentials: "omit" }); // Range'siz tam dosya
      if (ag.status === 200) await c.put(url, ag.clone());
      yanit = ag;
    } catch (err) {
      return new Response("", { status: 504 });
    }
  }
  const aralik = istek.headers.get("range");
  return aralik && yanit.status === 200 ? araliCevap(yanit, aralik) : yanit;
}

async function kabuk(istek) {
  const c = await caches.open(KABUK);
  try {
    const ag = await fetch(istek);
    if (ag.ok) c.put(istek, ag.clone());
    return ag;
  } catch (err) {
    const k = await c.match(istek, { ignoreSearch: true });
    if (k) return k;
    if (istek.mode === "navigate") return (await c.match("index.html")) || (await c.match("./"));
    return new Response("", { status: 504 });
  }
}

self.addEventListener("fetch", (e) => {
  const istek = e.request;
  if (istek.method !== "GET") return;
  const url = new URL(istek.url);
  if (url.origin !== self.location.origin) return;
  const yol = url.pathname;
  if (yol.includes("/img/") || yol.includes("/ses/")) e.respondWith(medya(istek));
  else e.respondWith(kabuk(istek));
});
