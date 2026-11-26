// English Words for Kids · Web — çevrimdışı açılış.
// Uygulama kabuğu önbellekte; açılan resim ve sesler (cache-first) bir kere indirilince internetsiz de açılır.
// Hiçbir veri dışarı gönderilmez; sadece aynı adresten dosya alınır.
const SURUM = "1.9.8";
const KABUK = "ewk-onizleme-kabuk-" + SURUM;
const MEDYA = "ewk-onizleme-medya-v1";
const DOSYALAR = [
  "./", "index.html", "style.css", "app.js", "config.js", "manifest.webmanifest", "data/kelimeler.json", "data/mufredat6.json", "data/mufredat7.json", "data/mufredat8.json", "data/krediler.json",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "icons/sunflower-logo.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(KABUK).then((c) => c.addAll(DOSYALAR)).then(() => self.skipWaiting()));
});

// Ders Kelimeleri'nin yeni resim ve sesleri de internetsiz açılsın diye arka planda önbelleğe alınır.
// Hata olursa sessizce geçilir; dosyalar zaten ilk açılışta da önbelleğe girer.
async function dersMedyaIndir() {
  try {
    const yollar = new Set();
    for (const n of [6, 7, 8]) {
      let veri;
      try { veri = await (await fetch("data/mufredat" + n + ".json", { credentials: "omit" })).json(); } catch (err) { continue; }
      veri.temalar.forEach((t) => t.kelimeler.forEach((k) => {
        if (k.tip === "uygulama") return;
        if (k.resim) yollar.add("img/" + k.resim + ".webp");
        if (/^muf_/.test(k.ses)) yollar.add("ses/" + k.ses);
      }));
    }
    const c = await caches.open(MEDYA);
    const liste = Array.from(yollar).map((y) => new URL(y, self.location.href).href);
    for (let i = 0; i < liste.length; i += 8) {
      await Promise.all(liste.slice(i, i + 8).map(async (u) => {
        try {
          if (await c.match(u)) return;
          const ag = await fetch(u, { credentials: "omit" });
          if (ag.status === 200) await c.put(u, ag);
        } catch (err) {}
      }));
    }
  } catch (err) {}
}

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((adlar) => Promise.all(adlar.filter((a) => a.startsWith("ewk-onizleme-") && a !== KABUK && a !== MEDYA).map((a) => caches.delete(a))))
      .then(() => self.clients.claim())
      .then(() => dersMedyaIndir())
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
