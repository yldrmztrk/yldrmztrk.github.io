/* English Words for Kids · Web (PWA)
   Uygulamanın (SwiftUI 1.9 (15)) davranışı birebir taşındı:
   KelimeSecici (rampa), WordStore (gezinti, Bugün/Toplam), MainWordView, HistoryView, EbeveynKilidiView.
   Hiçbir veri dışarı gönderilmez; kayıtlar sadece bu cihazda (localStorage). */
(function () {
  "use strict";

  // ---------- Cihaz kaydı (hata verirse bellekte devam) ----------
  var bellek = {};
  var dep = {
    oku: function (k) {
      try { var v = window.localStorage.getItem(k); if (v !== null) return v; } catch (e) {}
      return Object.prototype.hasOwnProperty.call(bellek, k) ? bellek[k] : null;
    },
    yaz: function (k, v) {
      bellek[k] = v;
      try { window.localStorage.setItem(k, v); } catch (e) {}
    },
    sil: function (k) {
      delete bellek[k];
      try { window.localStorage.removeItem(k); } catch (e) {}
    },
    okuJson: function (k, yedek) {
      var v = dep.oku(k);
      if (v === null) return yedek;
      try { return JSON.parse(v); } catch (e) { return yedek; }
    },
    yazJson: function (k, v) { dep.yaz(k, JSON.stringify(v)); }
  };
  var K = {
    gorulen: "ewk.gorulen", gecmis: "ewk.gecmis", gezinti: "ewk.gezinti", konum: "ewk.konum", son: "ewk.son",
    ad: "ewk.ad", adAtlandi: "ewk.adAtlandi", dersKonum: "ewk.dersKonum", konu: "ewk.konu"
  };

  // ---------- Sabitler (uygulamayla aynı) ----------
  var GEZINTI_LIMIT = 300, GECMIS_LIMIT = 5000, ADIM_BOYU = 10, EN_YUKSEK = 5, EN_UZUN_ISIM = 4, KUYRUK = 3;
  var AD_EN_FAZLA = 15;
  var TUR_AD = { n: "isim", v: "fiil", a: "sıfat", adv: "zarf", ifade: "ifade" };
  var OYUN_SORU = 10, OYUN_EN_AZ_RESIM = 4;

  var kelimeler = [], kategoriler = {}, kartlar = {};
  // Ders Kelimeleri: muf_ kartları sadece kartlar'da durur (5000 kelimelik havuza ve rampaya girmez).
  var siniflar = [], mufKartlari = [];

  // ---------- Kelime seçici (KelimeSecici.swift) ----------
  function agirlik(tur, seviye) {
    if (tur === "n") return 5;
    if (tur === "v" || tur === "a") return 1;
    return (seviye - 1) * 0.25;
  }
  function agirlikliSec(turler, seviye) {
    var w = turler.map(function (t) { return Math.max(agirlik(t, seviye), 0.0001); });
    var top = w.reduce(function (a, b) { return a + b; }, 0);
    var r = Math.random() * top;
    for (var i = 0; i < turler.length; i++) {
      if (r < w[i]) return turler[i];
      r -= w[i];
    }
    return turler[turler.length - 1];
  }
  function rastgele(dizi) { return dizi[Math.floor(Math.random() * dizi.length)]; }
  function turKarisimliSec(adaylar, seviye, isimSerisi) {
    if (!adaylar.length) return null;
    var havuz = {};
    adaylar.forEach(function (k) { (havuz[k.tur] = havuz[k.tur] || []).push(k); });
    var turler = Object.keys(havuz).filter(function (t) { return agirlik(t, seviye) > 0; });
    if (isimSerisi >= EN_UZUN_ISIM) {
      var fs = turler.filter(function (t) { return t === "v" || t === "a"; });
      if (fs.length) turler = fs;
      else if (havuz.adv) turler = ["adv"];
    }
    if (!turler.length) turler = Object.keys(havuz);
    turler.sort();
    return rastgele(havuz[agirlikliSec(turler, seviye)]);
  }
  function rampaSeviyesi(sayac) { return Math.floor(sayac / ADIM_BOYU) % EN_YUKSEK + 1; }
  function rampaSec(o) {
    var baslangic = rampaSeviyesi(o.sayac);
    for (var kayma = 0; kayma < EN_YUKSEK; kayma++) {
      var seviye = (baslangic - 1 + kayma) % EN_YUKSEK + 1;
      var sk = kelimeler.filter(function (k) {
        return k.sev === seviye && k.id !== o.haric && (!o.kategori || k.kat === o.kategori);
      });
      if (!sk.length) continue;
      var gorulmemis = sk.filter(function (k) { return !o.gorulen.has(k.id); });
      var kart = turKarisimliSec(gorulmemis, seviye, o.isimSerisi);
      if (kart) return { kart: kart, yeni: true, seviye: seviye };
      var uzak = sk.filter(function (k) { return !o.sonGezinti.has(k.id); });
      kart = turKarisimliSec(uzak.length ? uzak : sk, seviye, o.isimSerisi);
      if (kart) return { kart: kart, yeni: false, seviye: seviye };
    }
    return null;
  }
  function isimSerisi(idlerEskiden) {
    var sayi = 0;
    for (var i = idlerEskiden.length - 1; i >= 0; i--) {
      var k = kartlar[idlerEskiden[i]];
      if (!k || k.tur !== "n") break;
      sayi++;
    }
    return sayi;
  }

  // ---------- Durum (WordStore.swift) ----------
  var S = {
    gorulen: new Set(), gecmis: [], gezinti: [], konum: 0, cur: null, sayac: 0, kategori: null, kuyruk: [], baslandi: false, sekme: "kelimeler"
  };

  function gunBasi(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function bugunMu(t) { return gunBasi(t) === gunBasi(Date.now()); }

  function yukle() {
    var g = dep.okuJson(K.gecmis, []);
    S.gecmis = Array.isArray(g) ? g.filter(function (x) { return x && kartlar[x[0]] && typeof x[1] === "number"; }) : [];
    var gor = dep.okuJson(K.gorulen, null);
    S.gorulen = new Set(Array.isArray(gor) ? gor : S.gecmis.map(function (x) { return x[0]; }));
    var gez = dep.okuJson(K.gezinti, []);
    S.gezinti = Array.isArray(gez) ? gez.filter(function (id) { return kartlar[id]; }) : [];
    var son = dep.oku(K.son);
    var kayitli = son && kartlar[son] ? kartlar[son] : null;
    S.cur = kayitli || kelimeler[0];
    var sak = parseInt(dep.oku(K.konum), 10);
    if (!kayitli) S.konum = Math.max(0, S.gezinti.length - 1);
    else if (S.gezinti[sak] === S.cur.id) S.konum = sak;
    else {
      var li = S.gezinti.lastIndexOf(S.cur.id);
      if (li >= 0) S.konum = li; else { S.gezinti.push(S.cur.id); S.konum = S.gezinti.length - 1; }
    }
    var kn = dep.oku(K.konu);
    S.kategori = kn && kategoriler[kn] ? kn : null;
    gezintiKirp(); gezintiKaydet();
  }
  function gezintiKirp() {
    if (S.gezinti.length > GEZINTI_LIMIT) {
      var f = S.gezinti.length - GEZINTI_LIMIT;
      S.gezinti.splice(0, f);
      S.konum = Math.max(0, S.konum - f);
    }
  }
  function gezintiKaydet() { dep.yazJson(K.gezinti, S.gezinti); dep.yaz(K.konum, String(S.konum)); }

  function kaydetGorulen(id) {
    if (!S.gorulen.has(id)) { S.gorulen.add(id); dep.yazJson(K.gorulen, Array.from(S.gorulen)); }
    // Aynı kelime aynı gün bir kez kaydedilir (gecmis en yeni başta).
    var var_ = false;
    for (var i = 0; i < S.gecmis.length && bugunMu(S.gecmis[i][1]); i++) {
      if (S.gecmis[i][0] === id) { var_ = true; break; }
    }
    if (!var_) {
      S.gecmis.unshift([id, Date.now()]);
      if (S.gecmis.length > GECMIS_LIMIT) S.gecmis.length = GECMIS_LIMIT;
      dep.yazJson(K.gecmis, S.gecmis);
    }
  }
  function bugunkuSayi() {
    var s = new Set();
    for (var i = 0; i < S.gecmis.length; i++) if (bugunMu(S.gecmis[i][1])) s.add(S.gecmis[i][0]);
    return s.size;
  }
  function ogrenilenToplam() {
    var s = new Set(S.gorulen);
    S.gecmis.forEach(function (x) { s.add(x[0]); });
    var n = 0; s.forEach(function (id) { if (kartlar[id]) n++; });
    return n;
  }
  function gunlereGoreGecmis() {
    var gr = {};
    S.gecmis.forEach(function (x) { (gr[gunBasi(x[1])] = gr[gunBasi(x[1])] || []).push(x); });
    var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 1);
    var dun = d.getTime();
    return Object.keys(gr).map(Number).sort(function (a, b) { return b - a; }).map(function (tarih) {
      var gorulen = new Set(), liste = [];
      gr[tarih].sort(function (a, b) { return b[1] - a[1]; }).forEach(function (x) {
        if (!gorulen.has(x[0])) { gorulen.add(x[0]); liste.push(kartlar[x[0]]); }
      });
      return { tarih: tarih, baslik: gunBasligi(tarih, dun), kelimeler: liste };
    });
  }
  function gunBasligi(tarih, dun) {
    if (tarih === gunBasi(Date.now())) return "Bugün";
    if (tarih === dun) return "Dün";
    var d = new Date(tarih), buYil = d.getFullYear() === new Date().getFullYear();
    try {
      return d.toLocaleDateString("tr-TR", buYil ? { day: "numeric", month: "long", weekday: "long" }
        : { day: "numeric", month: "long", year: "numeric" });
    } catch (e) { return d.toDateString(); }
  }

  // Kuyruk: sıradaki 3 kelime önceden seçilir; resim + sesleri önceden yüklenir.
  function kuyrukDoldur() {
    var gor = new Set(S.gorulen), gez = S.gezinti.slice(), say = S.sayac;
    S.kuyruk.forEach(function (q) { gor.add(q.kart.id); gez.push(q.kart.id); say++; });
    while (S.kuyruk.length < KUYRUK) {
      var haric = S.kuyruk.length ? S.kuyruk[S.kuyruk.length - 1].kart.id : S.cur.id;
      var r = rampaSec({
        kelimeler: kelimeler, sayac: say, gorulen: gor, sonGezinti: new Set(gez), haric: haric,
        isimSerisi: isimSerisi(gez), kategori: S.kategori
      });
      if (!r) {
        var y = rastgele(kelimeler);
        r = { kart: y, yeni: !gor.has(y.id), seviye: y.sev };
      }
      S.kuyruk.push(r); gor.add(r.kart.id); gez.push(r.kart.id); say++;
    }
    S.kuyruk.forEach(function (q) { onYukle(q.kart); });
  }
  var yuklenen = new Set();
  function onYukle(k) {
    try {
      if (k.resim && !yuklenen.has("i" + k.resim)) { yuklenen.add("i" + k.resim); var im = new Image(); im.src = resimYolu(k); }
      if (!yuklenen.has("s" + k.ses)) { yuklenen.add("s" + k.ses); fetch(sesYolu(k), { credentials: "omit" }).then(function (r) { return r.arrayBuffer(); }).catch(function () {}); }
    } catch (e) {}
  }

  function yeniKelime() {
    var q = S.kuyruk.shift();
    if (!q) {
      var r = rampaSec({
        kelimeler: kelimeler, sayac: S.sayac, gorulen: S.gorulen, sonGezinti: new Set(S.gezinti), haric: S.cur.id,
        isimSerisi: isimSerisi(S.gezinti), kategori: S.kategori
      });
      if (!r) { var y = rastgele(kelimeler); r = { kart: y, yeni: !S.gorulen.has(y.id), seviye: y.sev }; }
      q = r;
    }
    S.sayac++;
    goster(q.kart);
  }
  function goster(kart) {
    S.cur = kart;
    dep.yaz(K.son, kart.id);
    kaydetGorulen(kart.id);
    S.gezinti.push(kart.id);
    S.konum = S.gezinti.length - 1;
    gezintiKirp(); gezintiKaydet();
    kuyrukDoldur();
    ciz(true);
  }
  function gezintidenGoster(yeniKonum) {
    var k = kartlar[S.gezinti[yeniKonum]];
    if (!k) return;
    S.konum = yeniKonum; S.cur = k;
    dep.yaz(K.son, k.id); dep.yaz(K.konum, String(S.konum));
    ciz(true);
  }
  function oncekiVar() { return S.konum > 0; }
  function yeniKelimeGelecek() { return S.konum >= S.gezinti.length - 1; }
  function kutlansinMi() { return yeniKelimeGelecek() && S.kuyruk.length > 0 && S.kuyruk[0].yeni; }
  function sonraki() {
    if (S.konum < S.gezinti.length - 1) gezintidenGoster(S.konum + 1);
    else yeniKelime();
  }
  function onceki() { if (S.konum > 0) gezintidenGoster(S.konum - 1); }
  function degistir(ileri) {
    if (!ileri && !oncekiVar()) return;
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {}
    if (ileri && kutlansinMi()) kutlama();
    if (ileri) sonraki(); else onceki();
  }

  // ---------- Yollar ve ses ----------
  function resimYolu(k) { return "img/" + k.resim + ".webp"; }
  function sesYolu(k) { return "ses/" + k.ses + ".m4a"; }
  function gorunenIng(k) { return k.tur === "v" ? "to " + k.en : k.en; }
  function turYazi(k) { return k.tur === "ifade" ? "ifade" : k.tur; }
  var ses = null;
  function soyle(k) {
    // Her dokunuş ilkiyle aynı hızda (kayıt, hız 1.0).
    try {
      if (!ses) {
        ses = new Audio(); ses.preload = "auto";
        ses.addEventListener("error", function () { cihazSesi(ses.__kelime); });
      }
      ses.pause();
      ses.__kelime = gorunenIng(k);
      ses.src = sesYolu(k);
      ses.playbackRate = 1;
      try { ses.currentTime = 0; } catch (e) {}
      var p = ses.play();
      if (p && p.catch) p.catch(function (e) { if (e && e.name !== "AbortError" && e.name !== "NotAllowedError") cihazSesi(ses.__kelime); });
    } catch (e) { cihazSesi(gorunenIng(k)); }
  }
  function cihazSesi(metin) {
    try {
      if (!window.speechSynthesis || !metin) return;
      var u = new SpeechSynthesisUtterance(metin); u.lang = "en-US"; u.rate = 0.7;
      window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  // ---------- Küçük yardımcılar ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function dugme(cls, text, fn, etiket) {
    var b = el("button", cls, text); b.type = "button";
    if (etiket) b.setAttribute("aria-label", etiket);
    b.addEventListener("click", fn);
    return b;
  }
  function svg(d) {
    var ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(ns, "path"); p.setAttribute("d", d); s.appendChild(p); return s;
  }
  var SIMGE = {
    hoparlor: "M3 9v6h4l5 4V5L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z",
    izgara: "M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z",
    disli: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
    kelimeler: "M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z",
    ders: "M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z",
    oyun: "M21.58 16.09l-1.09-7.66A3.996 3.996 0 0 0 16.53 5H7.47C5.48 5 3.79 6.46 3.51 8.43l-1.09 7.66C2.2 17.63 3.39 19 4.94 19c.68 0 1.32-.27 1.8-.75L9 16h6l2.25 2.25c.48.48 1.13.75 1.8.75 1.56 0 2.75-1.37 2.53-2.91zM11 11H9v2H8v-2H6v-1h2V8h1v2h2v1zm4-1c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm2 3c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z",
    hediye: "M20 7h-2.2A3 3 0 0 0 12 4.8 3 3 0 0 0 6.2 7H4a2 2 0 0 0-2 2v3h20V9a2 2 0 0 0-2-2zM9 7a1 1 0 1 1 1-1v1H9zm6 0h-1V6a1 1 0 1 1 1 1zM3 14v5a2 2 0 0 0 2 2h6v-7H3zm10 0v7h6a2 2 0 0 0 2-2v-5h-8z"
  };
  function temizle(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  // ---------- Ad (Sana nasıl seslenelim?) ----------
  function adTemizle(ham) {
    // Sonuç: { ok:true, ad:"Ayşe" } | { ok:true, ad:"" } (boş) | { ok:false, hata:"..." }
    var s = String(ham == null ? "" : ham).replace(/^\s+|\s+$/g, "");
    if (!s) return { ok: true, ad: "" };
    if (/[0-9]/.test(s) || /\p{N}/u.test(s)) return { ok: false, hata: "Ad içinde rakam olmasın." };
    if (!/^[\p{L} ]+$/u.test(s)) return { ok: false, hata: "Sadece harf yazabilirsin (emoji, link ve işaret olmasın)." };
    s = s.replace(/ {2,}/g, " ");
    var harfler = Array.from(s);
    if (harfler.length > AD_EN_FAZLA) return { ok: false, hata: "En fazla " + AD_EN_FAZLA + " harf olabilir (" + harfler.length + " yazdın)." };
    harfler[0] = harfler[0].toLocaleUpperCase("tr-TR");
    return { ok: true, ad: harfler.join("") };
  }
  // Bugün bakılan kelime sayısına göre tek övgü cümlesi (0 -> boş). Ad yoksa ad kısmı yazılmaz.
  function ovguCumlesi(sayi, ad) {
    var a = ad ? " " + ad : "";
    if (sayi >= 100) return "Bugün harika iş çıkardın" + a + "!";
    if (sayi >= 50) return "Çok güzel iş çıkardın" + a + "!";
    if (sayi >= 1) return "İyi iş çıkardın" + a + "!";
    return "";
  }
  function kayitliAd() { var a = dep.oku(K.ad); return a ? a : ""; }

  var katman = null;
  var katmanGecmisi = false, geriBekliyor = false;
  function katmanAcik() { var k = document.getElementById("katman"); return !!k && !k.hidden; }
  function gecmisEkle() {
    if (katmanGecmisi) return;
    try { history.pushState({ ewk: 1 }, ""); katmanGecmisi = true; } catch (e) {}
  }
  window.addEventListener("popstate", function () {
    if (geriBekliyor) {
      geriBekliyor = false;
      if (katmanAcik()) { katmanGecmisi = false; gecmisEkle(); } // araya yeni sayfa girdiyse kaydı geri koy
      return;
    }
    if (bekciGeri) { bekciGeri = false; return; }
    if (katmanGecmisi && katmanAcik()) { katmanGecmisi = false; katmanKapat(true); return; }
    if (sekmeBekci) {
      sekmeBekci = false; // bu kayıt harcandı
      var y = sekmeYukari[S.sekme];
      if (y) y(); else sekmeGit("kelimeler");
      geriKaydiGuncelle();
    }
  });
  function katmanAc(sinif) {
    katman = document.getElementById("katman");
    gecmisEkle();
    katman.className = sinif || "";
    katman.removeAttribute("style");
    temizle(katman); katman.hidden = false; katman.scrollTop = 0;
    return katman;
  }
  function katmanKapat(geriden) {
    var k = document.getElementById("katman");
    k.hidden = true; temizle(k);
    oyunNo++; clearTimeout(oyunZaman); // açık oyun varsa durur
    if (katmanGecmisi && geriden !== true) {
      katmanGecmisi = false; geriBekliyor = true;
      try { history.back(); } catch (e) { geriBekliyor = false; }
    } else katmanGecmisi = false;
    ciz(false); // sayaç / selam güncel kalsın
  }

  function adEkrani(mod, bitti) {
    // mod: "ilk" | "degistir"
    var k = katmanAc("sicak-ad");
    var s = el("div", "sayfa ad-ekrani");
    var logoBuyuk = el("img", "buyuk-logo"); logoBuyuk.src = "icons/sunflower-logo.png"; logoBuyuk.alt = ""; logoBuyuk.width = 104; logoBuyuk.height = 104;
    logoBuyuk.setAttribute("aria-hidden", "true");
    var logoSar = el("div", "buyuk-emoji"); var logoDaire = el("div", "buyuk-daire"); logoDaire.appendChild(logoBuyuk); logoSar.appendChild(logoDaire); s.appendChild(logoSar);
    s.appendChild(el("h1", "", mod === "ilk" ? "Sana nasıl seslenelim?" : "Adını değiştir"));
    s.appendChild(el("p", "alt-yazi", "İstersen adını yaz, istersen atla."));
    var form = el("form", "kart-beyaz"); form.autocomplete = "off"; form.noValidate = true;
    var inp = el("input", "alan"); inp.type = "text"; inp.id = "ad-giris"; inp.name = "ad";
    inp.placeholder = "Adın"; inp.setAttribute("aria-label", "Adın");
    inp.setAttribute("autocapitalize", "words"); inp.setAttribute("autocorrect", "off"); inp.setAttribute("spellcheck", "false");
    inp.setAttribute("autocomplete", "off"); inp.setAttribute("enterkeyhint", "done");
    if (mod === "degistir") inp.value = kayitliAd();
    var not = el("p", "not"); not.id = "ad-not"; not.setAttribute("role", "status");
    var devam = el("button", "dugme-koyu", "Devam"); devam.type = "submit"; devam.id = "ad-devam";
    form.appendChild(inp); form.appendChild(not); form.appendChild(devam);
    s.appendChild(form);
    var atla = dugme("dugme-link", mod === "ilk" ? "Atla" : "Vazgeç", function () {
      if (mod === "ilk") dep.yaz(K.adAtlandi, "1");
      bitti();
    });
    atla.id = "ad-atla";
    var sar = el("div", ""); sar.style.display = "flex"; sar.style.justifyContent = "center"; sar.appendChild(atla);
    s.appendChild(sar);
    if (mod === "degistir") s.appendChild(el("p", "alt-yazi", "Boş bırakıp kaydedersen ad silinir."));
    k.appendChild(s);

    function dogrula() {
      var r = adTemizle(inp.value);
      not.textContent = r.ok ? "" : r.hata;
      inp.classList.toggle("hata", !r.ok);
      devam.disabled = !r.ok;
      return r;
    }
    inp.addEventListener("input", dogrula);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var r = dogrula();
      if (!r.ok) return;
      if (r.ad) { dep.yaz(K.ad, r.ad); dep.sil(K.adAtlandi); }
      else {
        dep.sil(K.ad);
        dep.yaz(K.adAtlandi, "1"); // bilerek boş bırakıldı: bir daha sorulmaz
      }
      bitti();
    });
    dogrula();
    if (mod === "ilk") setTimeout(function () { try { inp.focus(); } catch (e) {} }, 50);
  }

  // ---------- Ana ekran ----------
  var kutlamaKatmani = null;
  function katIcerik(k) {
    var kat = kategoriler[k.kat] || { g: ["#6A5AE0", "#4E8CFF"], sicak: false, emoji: "", ad: "" };
    return kat;
  }
  // Kelime kartı (ana ekran ve Ders Kelimeleri aynı görünümü kullanır).
  function sahneDoldur(sahne, k, sesFn, hopId, animasyon) {
    var gorsel = null;
    if (k.resim) gorsel = "foto"; else if (k.emoji) gorsel = "emoji";
    temizle(sahne);
    sahne.className = "sahne" + (gorsel ? "" : " resimsiz");
    if (gorsel) {
      var f = el("div", "foto"); f.setAttribute("aria-hidden", "true");
      if (gorsel === "foto") {
        var im = new Image(); im.alt = ""; im.decoding = "async"; im.width = 600; im.height = 480;
        im.addEventListener("error", function () { // dosya yoksa boş kutu kalmasın
          if (f.parentNode) f.parentNode.removeChild(f);
          sahne.classList.add("resimsiz");
        });
        im.src = resimYolu(k);
        f.appendChild(im);
      } else f.appendChild(el("div", "emoji", k.emoji));
      sahne.appendChild(f);
    }
    var satir = el("div", "kelime-satir");
    var h = el("h1", "kelime", gorunenIng(k));
    h.setAttribute("aria-label", gorunenIng(k) + ", " + TUR_AD[k.tur]);
    var t = el("span", "tur " + k.tur, turYazi(k)); t.setAttribute("aria-hidden", "true");
    var hop = dugme("hoparlor", "", sesFn, "Sesli dinle");
    hop.id = hopId; hop.appendChild(svg(SIMGE.hoparlor));
    satir.appendChild(h); satir.appendChild(t); satir.appendChild(hop);
    sahne.appendChild(satir);
    sahne.appendChild(el("p", "turkce " + k.tur, k.tr));
    if (animasyon) { void sahne.offsetWidth; sahne.classList.add("pop"); }
  }
  function ciz(animasyon) {
    var ana = document.getElementById("ana");
    var k = S.cur;
    if (!k) return;
    var kat = katIcerik(k);
    var root = document.documentElement;
    root.style.setProperty("--g1", kat.g[0]); root.style.setProperty("--g2", kat.g[1]);
    root.style.setProperty("--ry-l", kat.sicak ? "#4A2A00" : "#FFFFFF");
    root.style.setProperty("--rz-l", kat.sicak ? "rgba(255,255,255,.4)" : "rgba(255,255,255,.22)");
    var tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.setAttribute("content", kat.g[0]);
    ana.classList.toggle("sicak", !!kat.sicak);
    renkPlanla();
    ana.dataset.wid = k.id; ana.dataset.sev = String(k.sev); ana.dataset.tur = k.tur;
    ana.dataset.resim = k.resim || ""; ana.dataset.rk = k.rk || "";
    ana.dataset.konum = String(S.konum);

    var onceki_ = ana.querySelector(".orta");
    var ilk = !ana.firstChild;
    if (ilk) kur(ana);

    // Üst çubuk
    var sec = S.kategori && kategoriler[S.kategori] ? kategoriler[S.kategori] : null;
    ana.querySelector(".rozet.kat .em").textContent = sec ? sec.emoji : "🔀";
    ana.querySelector(".rozet.kat .ad").textContent = sec ? sec.ad : "Karışık";
    ana.querySelector("#kategori-rozet").setAttribute("aria-label", "Konu: " + (sec ? sec.ad : "Karışık") + ". Değiştirmek için dokun");
    var bs = bugunkuSayi();
    ana.querySelector(".rozet.yildiz .sayi").textContent = String(bs);
    ana.querySelector(".rozet.yildiz").setAttribute("aria-label", "Bugün " + bs + " kelime");

    // Selam (sadece açılışta, adı olan/olmayan)
    var selam = ana.querySelector(".selam");
    var ad = kayitliAd();
    selam.querySelector(".selam-yazi").textContent = ad ? "Merhaba " + ad + "!" : "Merhaba!";

    // Kelime kartı
    var sahne = ana.querySelector(".sahne");
    sahneDoldur(sahne, k, function () { soyle(S.cur); }, "hoparlor", animasyon);

    // Önceki düğmesi
    var ob = ana.querySelector("#onceki"); if (ob) ob.disabled = !oncekiVar();
    void onceki_;
  }
  function kur(ana) {
    var ust = el("div", "ust");
    var kat = el("button", "kat-dugme"); kat.type = "button"; kat.id = "kategori-rozet";
    var katIc = el("span", "rozet kat");
    katIc.appendChild(el("span", "em")); katIc.appendChild(el("span", "ad")); katIc.appendChild(el("span", "ok", "▾"));
    kat.appendChild(katIc);
    kat.addEventListener("click", function () { konuListesi("katman"); });
    var bosluk = el("div", "bosluk");
    var yil = el("div", "rozet yildiz", ""); yil.setAttribute("role", "img");
    yil.appendChild(el("span", "", "⭐️")); yil.appendChild(el("span", "sayi", "0"));
    var gec = dugme("yuvarlak", "", gecmisAc, "Öğrendiklerim"); gec.id = "gecmis-dugme";
    var s1 = el("span"); s1.appendChild(svg(SIMGE.izgara)); gec.appendChild(s1);
    var ger = dugme("yuvarlak", "", ayarlarAc, "Ayarlar"); ger.id = "ayar-dugme";
    var s2 = el("span"); s2.appendChild(svg(SIMGE.disli)); ger.appendChild(s2);
    ust.appendChild(kat); ust.appendChild(bosluk); ust.appendChild(yil); ust.appendChild(gec); ust.appendChild(ger);
    ana.appendChild(ust);
    var selam = el("div", "selam"); selam.id = "selam";
    selam.appendChild(el("span", "selam-yazi"));
    var selamLogo = el("img", "selam-logo"); selamLogo.src = "icons/sunflower-logo.png"; selamLogo.alt = ""; selamLogo.setAttribute("aria-hidden", "true");
    var selamDaire = el("span", "selam-daire"); selamDaire.appendChild(selamLogo);
    selam.appendChild(selamDaire);
    ana.appendChild(selam);
    setTimeout(function () { selam.classList.add("silik"); }, 9000);
    var orta = el("div", "orta"); orta.appendChild(el("div", "sahne")); ana.appendChild(orta);
    var alt = el("div", "alt");
    var gz = el("div", "gezin");
    var ob = dugme("", "‹ Önceki", function () { degistir(false); }, "Önceki kelime"); ob.id = "onceki";
    var sb = dugme("", "Sonraki ›", function () { degistir(true); }, "Sonraki kelime"); sb.id = "sonraki";
    gz.appendChild(ob); gz.appendChild(sb);
    alt.appendChild(gz);
    ana.appendChild(alt);
    ana.appendChild(el("div", "yildizlar"));
    jestleriKur(ana, degistir);
  }

  // Sola kaydır = Sonraki, sağa kaydır = Önceki, çift dokunma = Sonraki.
  function jestleriKur(ana, degistir) {
    var bas = null, sonDokunus = null;
    ana.addEventListener("pointerdown", function (e) {
      if (e.target.closest && e.target.closest("button")) { bas = null; return; }
      bas = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
    });
    ana.addEventListener("pointercancel", function () { bas = null; });
    ana.addEventListener("pointerup", function (e) {
      if (!bas || bas.id !== e.pointerId) return;
      var dx = e.clientX - bas.x, dy = e.clientY - bas.y, sure = Date.now() - bas.t, b = bas; bas = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { sonDokunus = null; degistir(dx < 0); return; }
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && sure < 400) {
        var simdi = Date.now();
        if (sonDokunus && simdi - sonDokunus.t < 350 && Math.abs(e.clientX - sonDokunus.x) < 40 && Math.abs(e.clientY - sonDokunus.y) < 40) {
          sonDokunus = null; degistir(true);
        } else sonDokunus = { t: simdi, x: e.clientX, y: e.clientY };
      }
      void b;
    });
  }
  function kutlama() {
    var ana = document.getElementById("ana"), kap = ana.querySelector(".yildizlar"); if (!kap) return;
    temizle(kap);
    var em = ["⭐️", "✨", "🌟", "🎉"];
    for (var i = 0; i < 6; i++) {
      var s = el("span", "", em[Math.floor(Math.random() * em.length)]);
      s.style.left = (12 + Math.random() * 76) + "%"; s.style.top = (35 + Math.random() * 45) + "%";
      s.style.fontSize = (22 + Math.random() * 16) + "px";
      kap.appendChild(s);
    }
    clearTimeout(kutlamaKatmani);
    kutlamaKatmani = setTimeout(function () { temizle(kap); }, 950);
  }

  // ---------- Öğrendiklerim ----------
  function kapakGorsel(kelime) {
    if (kelime.resim) { var im = new Image(); im.alt = ""; im.loading = "lazy"; im.decoding = "async"; im.src = resimYolu(kelime); return { img: im }; }
    if (kelime.emoji) return { text: kelime.emoji };
    return null;
  }
  function altBilgi(parent) {
    var h = el("div", "hakkinda");
    var sv = el("p", "hakkinda-surum", SURUM_YAZISI); sv.id = "ogr-surum"; h.appendChild(sv);
    h.appendChild(el("p", "", "Fotoğraflar: Pexels"));
    h.appendChild(el("p", "", "Çizimler: Sun Flower Apps"));
    h.appendChild(el("p", "", "Sun Flower Apps · Yıldırım Öztürk"));
    parent.appendChild(h);
  }
  function gecmisAc() {
    var k = katmanAc("");
    var s = el("div", "sayfa");
    var bar = el("div", "baslik-bar");
    bar.appendChild(el("span", "bar-dugme sol"));
    bar.appendChild(el("h1", "", "Öğrendiklerim"));
    var kapat = dugme("bar-dugme sag", "Kapat", katmanKapat); kapat.id = "kapat";
    bar.appendChild(kapat);
    s.appendChild(bar);
    if (!S.gecmis.length) {
      var b = el("div", "bos");
      b.appendChild(el("div", "e", "🌱")); b.appendChild(el("h2", "", "Henüz kelime yok")); b.appendChild(el("p", "", "Ekrana çift dokunarak başla!"));
      s.appendChild(b);
    } else {
      var ozet = el("div", "ozet");
      var bs = bugunkuSayi();
      [["⭐️", bs, "Bugün", "ozet-bugun"], ["🏆", ogrenilenToplam(), "Toplam", "ozet-toplam"]].forEach(function (r) {
        var d = el("div", ""); d.id = r[3];
        d.appendChild(el("span", "e", r[0])); d.appendChild(el("span", "s", String(r[1]))); d.appendChild(el("span", "b", r[2]));
        ozet.appendChild(d);
      });
      s.appendChild(ozet);
      var ad = kayitliAd();
      var ov = ovguCumlesi(bs, ad);
      if (ov) { var af = el("p", "aferin", ov); af.id = "aferin"; s.appendChild(af); }
      var gl = el("div", "gunler"); gl.id = "gunler";
      gunlereGoreGecmis().forEach(function (g) {
        var b2 = el("button", "gun"); b2.type = "button";
        b2.dataset.gun = String(g.tarih);
        var kap = el("div", "kapak");
        var gk = null;
        for (var i = 0; i < g.kelimeler.length && !gk; i++) gk = kapakGorsel(g.kelimeler[i]);
        if (gk && gk.img) kap.appendChild(gk.img); else kap.textContent = gk ? gk.text : "📚";
        kap.setAttribute("aria-hidden", "true");
        var m = el("div", "m"); m.appendChild(el("b", "", g.baslik)); m.appendChild(el("small", "", g.kelimeler.length + " kelime"));
        b2.appendChild(kap); b2.appendChild(m); b2.appendChild(el("span", "ok", "›"));
        b2.addEventListener("click", function () { gunDetay(g); });
        gl.appendChild(b2);
      });
      s.appendChild(gl);
    }
    altBilgi(s);
    k.appendChild(s);
  }
  function gunDetay(g) {
    var k = katmanAc("");
    var s = el("div", "sayfa");
    var bar = el("div", "baslik-bar");
    var geri = dugme("bar-dugme sol", "‹ Geri", gecmisAc); geri.id = "geri";
    bar.appendChild(geri); bar.appendChild(el("h1", "", g.baslik));
    var kp = dugme("bar-dugme sag", "Kapat", katmanKapat); kp.id = "kapat";
    bar.appendChild(kp);
    s.appendChild(bar);
    var iz = el("div", "izgara"); iz.id = "izgara";
    g.kelimeler.forEach(function (kel) {
      var b = el("button", "kutu"); b.type = "button";
      b.setAttribute("aria-label", gorunenIng(kel) + ", " + TUR_AD[kel.tur] + ", " + kel.tr);
      var gk = kapakGorsel(kel);
      if (gk) {
        var r = el("div", "r" + (gk.text ? " e" : ""));
        if (gk.img) r.appendChild(gk.img); else r.textContent = gk.text;
        b.appendChild(r);
      }
      var w = el("b", kel.tur, gorunenIng(kel) + " "); w.appendChild(el("i", "", "(" + turYazi(kel) + ")"));
      b.appendChild(w); b.appendChild(el("small", "", kel.tr));
      b.addEventListener("click", function () { soyle(kel); });
      iz.appendChild(b);
    });
    s.appendChild(iz);
    k.appendChild(s);
  }

  // ---------- Sekmeler, Ders Kelimeleri, Konular, Oyunlar, Ayarlar ----------
  var TEMA_RENK = [
    ["#FF8A5B", "#E8527A"], ["#4E8CFF", "#6A5AE0"], ["#2FBF9B", "#2B8FD6"], ["#F5A524", "#E8527A"],
    ["#8E5CFF", "#E85D9E"], ["#19B5C8", "#4E7BFF"], ["#43B96B", "#1E8F7A"], ["#5B5BE0", "#B15EFF"]
  ];
  // Her sınıf dosyası sırayla eklenir. Aynı anahtar (muf_...) tek kart olur: "yeni", "muf6", "muf7" satırları
  // daha önce kurulmuş kartı kullanır, yoksa satırdan kurar (ilerleme ortak kalır).
  function mufVeriKur(d) {
    if (!d || !Array.isArray(d.temalar)) return;
    function kartKur(w) {
      var var_ = kartlar[w.anahtar];
      if (var_) return var_;
      var tur = w.tur === "adj" ? "a" : w.tur;
      var k = {
        id: w.anahtar, en: w.en, tr: w.tr, tur: tur, sev: 0, kat: "", muf: true,
        ses: String(w.ses).replace(/\.m4a$/, ""), resim: w.resim || null, rk: w.resim_turu || "",
        fotografci: w.fotografci || ""
      };
      kartlar[w.anahtar] = k; mufKartlari.push(k);
      return k;
    }
    var temalar = d.temalar.map(function (t, i) {
      var liste = [];
      t.kelimeler.forEach(function (w) {
        var k = w.tip === "uygulama" ? kartlar[w.id] : kartKur(w);
        if (k) liste.push(k);
      });
      return { no: t.no, en: t.en, tr: t.tr, kart: liste, renk: TEMA_RENK[i % TEMA_RENK.length] };
    });
    siniflar.push({ sinif: d.sinif, ad: d.ad || (d.sinif + ". Sınıf"), temalar: temalar });
  }
  function bakilanKumesi() {
    var s = new Set(S.gorulen);
    S.gecmis.forEach(function (x) { s.add(x[0]); });
    return s;
  }
  function benzersizBakildi(liste) {
    var b = bakilanKumesi(), n = 0, sayilan = new Set();
    liste.forEach(function (k) { if (!sayilan.has(k.id)) { sayilan.add(k.id); if (b.has(k.id)) n++; } });
    return n;
  }
  function temaBakildi(t) { return benzersizBakildi(t.kart); }
  function dersKonumlari() { var o = dep.okuJson(K.dersKonum, {}); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; }
  function dersKonumYaz(sinif, tema, i) {
    var o = dersKonumlari(); o[sinif + "-" + tema] = i; dep.yazJson(K.dersKonum, o);
  }
  function resimliKartlar(liste) {
    var gor = new Set(), r = [];
    liste.forEach(function (k) { if (k.resim && !gor.has(k.id)) { gor.add(k.id); r.push(k); } });
    return r;
  }
  function ustBar(sol, orta, sag) {
    var bar = el("div", "baslik-bar");
    bar.appendChild(sol); if (orta) bar.appendChild(orta); bar.appendChild(sag);
    return bar;
  }

  // ----- Yüzeyler: "katman" (tam ekran sayfa), "ders" ve "oyun" (sekme sayfaları) -----
  var sekmeCizici = { ders: null, oyun: null };
  function sekmeAc(ad, sinif) {
    var e = document.getElementById("sekme-" + ad);
    e.className = "sekme-sayfa" + (sinif ? " " + sinif : "");
    e.removeAttribute("style");
    temizle(e); e.scrollTop = 0;
    return e;
  }
  var sekmeYukari = { ders: null, oyun: null }; // alt sayfadaysa: bir üst seviyeye dönen işlev (en üst sayfada null)
  var sekmeBekci = false, bekciGeri = false;
  function geriKaydiGuncelle() {
    var gerek = S.sekme !== "kelimeler" || !!sekmeYukari[S.sekme];
    if (gerek && !sekmeBekci) { try { history.pushState({ ewk: 2 }, ""); sekmeBekci = true; } catch (e) {} }
    else if (!gerek && sekmeBekci) { sekmeBekci = false; bekciGeri = true; try { history.back(); } catch (e) { bekciGeri = false; } }
  }
  function yuzAc(yz, sinif, cizici, yukari) {
    if (yz === "katman") return katmanAc(sinif);
    sekmeCizici[yz] = cizici || null;
    sekmeYukari[yz] = yukari || null;
    var e = sekmeAc(yz, sinif);
    geriKaydiGuncelle();
    return e;
  }
  function sekmeGit(ad) {
    S.sekme = ad;
    ["kelimeler", "ders", "oyun"].forEach(function (a) {
      var b = document.getElementById("tab-" + a);
      if (b) { b.setAttribute("aria-selected", a === ad ? "true" : "false"); b.classList.toggle("secili", a === ad); }
    });
    document.getElementById("ana").hidden = ad !== "kelimeler";
    document.getElementById("sekme-ders").hidden = ad !== "ders";
    document.getElementById("sekme-oyun").hidden = ad !== "oyun";
    if (ad === "kelimeler") ciz(false);
    else if (ad === "ders") (sekmeCizici.ders || function () { dersSiniflar("ders"); })();
    else if (ad === "oyun") (sekmeCizici.oyun || oyunMenu)();
    geriKaydiGuncelle();
  }
  // ----- Üst/alt renk: html zemini, sekme çubuğu ve theme-color o anki ekranı izler -----
  function hexe(c) {
    var m = (c || "").match(/[\d.]+/g);
    if (!m || m.length < 3) return "#6A5AE0";
    return "#" + [0, 1, 2].map(function (i) { var h = Math.round(+m[i]).toString(16); return h.length < 2 ? "0" + h : h; }).join("").toUpperCase();
  }
  function rgbler(s) { return (s || "").match(/rgba?\([^)]*\)/g) || []; }
  var renkPlanla = function () {};
  function renkTakipKur() {
    var bekle = false;
    function guncelle() {
      bekle = false;
      var yuz = document.getElementById("katman");
      if (yuz.hidden) yuz = document.getElementById("sekme-" + S.sekme) || document.getElementById("ana");
      if (!yuz || yuz.hidden) yuz = document.getElementById("ana");
      var cs = getComputedStyle(yuz), r = rgbler(cs.backgroundImage);
      var ust, alt;
      if (r.length) { ust = r[0]; alt = r[r.length - 1]; } else { ust = alt = cs.backgroundColor; }
      var kok = document.documentElement.style;
      kok.setProperty("--zemin-ust", ust); kok.setProperty("--zemin-alt", alt);
      var tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.setAttribute("content", hexe(ust));
    }
    function planla() { if (!bekle) { bekle = true; requestAnimationFrame(guncelle); } }
    var mo = new MutationObserver(planla);
    ["katman", "sekme-ders", "sekme-oyun", "ana"].forEach(function (id) {
      mo.observe(document.getElementById(id), { attributes: true, attributeFilter: ["hidden", "class", "style"] });
    });
    renkPlanla = planla;
    planla();
  }
  function sekmeCubuguKur() {
    var nav = document.getElementById("sekmeler");
    if (nav.firstChild) return;
    renkTakipKur();
    [["kelimeler", "Kelimeler", SIMGE.kelimeler], ["ders", "Ders", SIMGE.ders], ["oyun", "Oyunlar", SIMGE.oyun]].forEach(function (t) {
      var b = el("button", "tab"); b.type = "button"; b.id = "tab-" + t[0];
      b.setAttribute("role", "tab"); b.setAttribute("aria-selected", t[0] === "kelimeler" ? "true" : "false");
      if (t[0] === "kelimeler") b.classList.add("secili");
      b.appendChild(svg(t[2])); b.appendChild(el("span", "tab-yazi", t[1]));
      b.addEventListener("click", function () { sekmeGit(t[0]); });
      nav.appendChild(b);
    });
  }

  // ----- Ortak liste satırı (Ders temaları ve Konu seç aynı bileşeni kullanır) -----
  function listeSatiri(o) {
    var b = el("button", "tema-satir" + (o.sinif ? " " + o.sinif : "")); b.type = "button";
    if (o.renk) { b.style.setProperty("--r1", o.renk[0]); b.style.setProperty("--r2", o.renk[1]); }
    if (o.rozet) b.appendChild(el("span", "tema-rozet", o.rozet));
    var bas = el("span", "tema-baslik");
    if (o.emoji) bas.appendChild(el("span", "konu-emoji", o.emoji));
    bas.appendChild(el("b", "tema-tr", o.baslik));
    b.appendChild(bas);
    if (o.alt) b.appendChild(el("span", "tema-en", o.alt));
    b.appendChild(el("small", "tema-say", o.say));
    var cb = el("span", "cubuk"); cb.setAttribute("aria-hidden", "true");
    var ic = el("i"); ic.style.width = (o.oran || 0) + "%"; cb.appendChild(ic);
    b.appendChild(cb);
    return b;
  }
  function dersSiniflar(yz) {
    var k = yuzAc(yz, "", function () { dersSiniflar(yz); }, yz === "ders" ? null : oyunMenu);
    var s = el("div", "sayfa");
    var alt;
    if (yz === "ders") {
      var ust = el("div", "ders-ust");
      ust.appendChild(el("div", "ders-simge", "📚"));
      ust.appendChild(el("h1", "ders-baslik", "Ders Kelimeleri"));
      alt = el("p", "ders-alt", "Okulda işlediğin kelimeler"); alt.id = "ders-alt"; ust.appendChild(alt);
      s.appendChild(ust);
    } else {
      var geri = dugme("geri-yuvarlak", "‹", oyunMenu, "Geri"); geri.id = "geri";
      s.appendChild(ustBar(geri, null, el("span", "bar-dugme sag")));
      s.appendChild(el("h1", "ders-baslik kucuk", "Hangi sınıf?"));
    }
    var l = el("div", "sekme-liste ders-liste"); l.id = "sinif-liste";
    siniflar.forEach(function (c) {
      var b = el("button", "sinif-kart"); b.type = "button"; b.dataset.sinif = String(c.sinif);
      b.appendChild(el("span", "sinif-emoji", "🎒"));
      var yz_ = el("span", "sinif-yazi");
      yz_.appendChild(el("span", "sinif-ad", c.ad));
      yz_.appendChild(el("small", "", c.temalar.length + " tema"));
      b.appendChild(yz_);
      b.appendChild(el("span", "sinif-ok", "›"));
      b.addEventListener("click", function () { dersTemalar(yz, c); });
      l.appendChild(b);
    });
    s.appendChild(l);
    k.appendChild(s);
  }
  function dersTemalar(yz, c) {
    var k = yuzAc(yz, "", function () { dersTemalar(yz, c); }, function () { dersSiniflar(yz); });
    var s = el("div", "sayfa");
    var geri = dugme("bar-dugme sol", "‹ Geri", function () { dersSiniflar(yz); }); geri.id = "geri";
    s.appendChild(ustBar(geri, el("h1", "", yz === "ders" ? c.ad : "Ders temasından"), el("span", "bar-dugme sag")));
    var l = el("div", "tema-liste"); l.id = "tema-liste";
    c.temalar.forEach(function (t) {
      var bak = temaBakildi(t), top = t.kart.length;
      var yakinda = yz === "oyun" && temaSoruHavuzu(t).length < OYUN_EN_AZ_RESIM;
      var b = listeSatiri({
        rozet: "Tema " + t.no, baslik: t.tr, alt: t.en, renk: t.renk, sinif: yakinda ? "soluk" : "",
        say: yakinda ? "Bu temanın resimleri yakında" : top + " kelime · " + bak + " bakıldı", oran: top ? Math.round(bak * 100 / top) : 0
      });
      b.dataset.tema = String(t.no);
      if (yakinda) { b.disabled = true; }
      else b.addEventListener("click", function () {
        if (yz === "ders") dersKelime(c, t); else oyunBaslat({ sinif: c, tema: t, donus: "oyunlar" });
      });
      l.appendChild(b);
    });
    s.appendChild(l);
    k.appendChild(s);
  }
  function dersKelime(c, t) {
    var kayit_ = dersKonumlari()[c.sinif + "-" + t.no];
    var i = typeof kayit_ === "number" && kayit_ >= 0 && kayit_ < t.kart.length ? kayit_ : 0;
    var k = yuzAc("ders", "dk", function () { dersKelime(c, t); }, function () { dersTemalar("ders", c); });
    k.style.setProperty("--g1", t.renk[0]); k.style.setProperty("--g2", t.renk[1]);
    var kap = el("div", "dk-sayfa");
    var x = dugme("dk-x", "×", function () { dersTemalar("ders", c); }, "Tema listesine dön"); x.id = "dk-x";
    var bas = el("div", "dk-baslik"); bas.id = "dk-baslik";
    var say = el("span", "dk-say"); say.id = "dk-say";
    var ust = el("div", "dk-ust"); ust.appendChild(x); ust.appendChild(bas); ust.appendChild(say);
    kap.appendChild(ust);
    var orta = el("div", "orta dk-orta"); var sahne = el("div", "sahne"); orta.appendChild(sahne); kap.appendChild(orta);
    var alt = el("div", "alt");
    var gz = el("div", "gezin");
    var ob = dugme("", "‹ Önceki", function () { git(i - 1); }, "Önceki kelime"); ob.id = "dk-onceki";
    var sb = dugme("", "Sonraki ›", function () { git(i + 1); }, "Sonraki kelime"); sb.id = "dk-sonraki";
    gz.appendChild(ob); gz.appendChild(sb);
    var oyun = temaSoruHavuzu(t).length >= OYUN_EN_AZ_RESIM;
    if (oyun) {
      var od = dugme("oyun-dugme", "🎮 Bu temayla oyna", function () { oyunBaslat({ sinif: c, tema: t, donus: "tema" }); }); od.id = "dk-oyna";
      alt.appendChild(od);
    } else {
      var yk = el("p", "yakinda", "Bu temanın resimleri yakında"); yk.id = "dk-yakinda"; alt.appendChild(yk);
    }
    alt.appendChild(gz);
    kap.appendChild(alt);
    k.appendChild(kap);
    jestleriKur(kap, function (ileri) { git(i + (ileri ? 1 : -1)); });
    function goster_(animasyon) {
      var kart = t.kart[i];
      kaydetGorulen(kart.id);
      dersKonumYaz(c.sinif, t.no, i);
      bas.textContent = "Tema " + t.no + " · " + t.tr;
      say.textContent = (i + 1) + " / " + t.kart.length;
      kap.dataset.wid = kart.id; kap.dataset.konum = String(i);
      sahneDoldur(sahne, kart, function () { soyle(kart); }, "dk-hoparlor", animasyon);
      ob.disabled = i <= 0; sb.disabled = i >= t.kart.length - 1;
      orta.scrollTop = 0;
    }
    function git(n) {
      if (n < 0 || n >= t.kart.length) return;
      try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {}
      i = n; goster_(true);
    }
    goster_(false);
  }

  // ----- Konular (Kelimeler sekmesi + Oyunlar sekmesi) -----
  function konuIdleri() { return Object.keys(kategoriler); }
  function konuKartlari(id) { return kelimeler.filter(function (k) { return k.kat === id; }); }
  function konuSec(id) {
    var ayni = (S.kategori || null) === (id || null);
    S.kategori = id || null;
    if (id) dep.yaz(K.konu, id); else dep.sil(K.konu);
    katmanKapat();
    if (ayni) return;
    S.kuyruk = []; S.sayac = 0; // her konu seçiminde kolaydan zora yeniden başlar
    yeniKelime();
  }
  function konuListesi(yz) {
    var ana_ = yz === "katman";
    var k = yuzAc(yz, "", function () { konuListesi(yz); }, yz === "katman" ? null : oyunMenu);
    var s = el("div", "sayfa");
    var sol, sag, baslik;
    if (ana_) { sol = el("span", "bar-dugme sol"); sag = dugme("bar-dugme sag", "Kapat", katmanKapat); sag.id = "kapat"; baslik = "Konu seç"; }
    else { sol = dugme("bar-dugme sol", "‹ Geri", oyunMenu); sol.id = "geri"; sag = el("span", "bar-dugme sag"); baslik = "Bir konudan"; }
    s.appendChild(ustBar(sol, el("h1", "", baslik), sag));
    var l = el("div", "tema-liste konu-liste"); l.id = "konu-liste";
    if (ana_) {
      var kb = listeSatiri({ sinif: "karisik", emoji: "🔀", baslik: "Karışık", say: kelimeler.length + " kelime · kolaydan zora, hepsi", oran: 0 });
      kb.id = "konu-karisik"; kb.dataset.konu = "";
      kb.querySelector(".cubuk").hidden = true;
      kb.setAttribute("aria-pressed", S.kategori ? "false" : "true");
      kb.addEventListener("click", function () { konuSec(null); });
      l.appendChild(kb);
    }
    konuIdleri().forEach(function (id) {
      var kat = kategoriler[id], kk = konuKartlari(id), bak = benzersizBakildi(kk);
      var yakinda = !ana_ && resimliKartlar(kk).length < OYUN_EN_AZ_RESIM;
      var b = listeSatiri({
        emoji: kat.emoji, baslik: kat.ad, renk: kat.g, sinif: yakinda ? "soluk" : "",
        say: yakinda ? "Bu konunun resimleri yakında" : kk.length + " kelime · " + bak + " bakıldı", oran: kk.length ? Math.round(bak * 100 / kk.length) : 0
      });
      b.dataset.konu = id;
      if (ana_) b.setAttribute("aria-pressed", S.kategori === id ? "true" : "false");
      if (yakinda) b.disabled = true;
      else b.addEventListener("click", function () { if (ana_) konuSec(id); else oyunBaslat({ kategori: id, donus: "oyunlar" }); });
      l.appendChild(b);
    });
    s.appendChild(l);
    k.appendChild(s);
  }

  // ----- Oyunlar sekmesi -----
  function oyunMenu() {
    var k = yuzAc("oyun", "", oyunMenu, null);
    var s = el("div", "sayfa oyunlar");
    s.appendChild(ustBar(el("span", "bar-dugme sol"), el("h1", "", "Oyunlar"), el("span", "bar-dugme sag")));
    var kart = el("div", "oyun-kart"); kart.id = "oyun-kart";
    kart.appendChild(el("div", "oyun-kart-e", "🎮"));
    kart.appendChild(el("h2", "", "Hatırlıyor musun?"));
    kart.appendChild(el("p", "", "Resme bak, doğru kelimeyi bul"));
    s.appendChild(kart);
    var d = el("div", "oyun-sec");
    [["oyun-gorulen", "Gördüğüm kelimelerle", function () { oyunBaslat({ donus: "oyunlar" }); }],
     ["oyun-konu", "Bir konudan", function () { konuListesi("oyun"); }],
     ["oyun-tema", "Ders temasından", function () { dersSiniflar("oyun"); }]].forEach(function (r) {
      var b = dugme("dugme-beyaz oyun-sec-dugme", r[1], r[2]); b.id = r[0]; d.appendChild(b);
    });
    s.appendChild(d);
    var yolda = el("p", "yolda", "Yeni oyunlar yolda!"); yolda.id = "oyun-yolda"; s.appendChild(yolda);
    k.appendChild(s);
  }

  // ----- Hatırlıyor musun? (resme bakıp doğru kelimeyi seç) -----
  var oyunZaman = null, oyunNo = 0;
  function karistir(d) {
    var a = d.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function tumKartlar() { return kelimeler.concat(mufKartlari); }
  // Tema oyun havuzu: temadaki TÜM resimli kelimeler (uygulamadaki eski resimli + yeni muf_ resimli).
  function temaSoruHavuzu(t) { return resimliKartlar(t.kart); }
  function ciftOlmasin(c, secili, dogru) {
    var yazi = gorunenIng(c).toLowerCase();
    if (c.id === dogru.id || c.tur !== dogru.tur) return false;
    if (yazi === gorunenIng(dogru).toLowerCase() || c.tr === dogru.tr) return false;
    if (c.resim && dogru.resim && c.resim === dogru.resim) return false;
    for (var i = 0; i < secili.length; i++) {
      if (gorunenIng(secili[i]).toLowerCase() === yazi || secili[i].id === c.id) return false;
    }
    return true;
  }
  function soruYap(dogru, yakin) {
    var secili = [];
    karistir(yakin).forEach(function (c) { if (secili.length < 2 && ciftOlmasin(c, secili, dogru)) secili.push(c); });
    if (secili.length < 2) karistir(tumKartlar()).forEach(function (c) { if (secili.length < 2 && ciftOlmasin(c, secili, dogru)) secili.push(c); });
    return { dogru: dogru, secenekler: karistir(secili.concat([dogru])) };
  }
  function oyunSorulari(kaynak) {
    var havuz, yakin;
    var b = bakilanKumesi(), goruldu = [];
    b.forEach(function (id) { if (kartlar[id]) goruldu.push(kartlar[id]); });
    if (kaynak && kaynak.tema) {
      havuz = temaSoruHavuzu(kaynak.tema); yakin = kaynak.tema.kart;
    } else if (kaynak && kaynak.kategori) {
      var kk = konuKartlari(kaynak.kategori);
      havuz = resimliKartlar(kk.filter(function (c) { return b.has(c.id); }));
      if (havuz.length < OYUN_SORU) {
        var var2 = new Set(havuz.map(function (c) { return c.id; }));
        var kalan = karistir(resimliKartlar(kk).filter(function (c) { return !var2.has(c.id); }));
        kalan.sort(function (x, y) { return x.sev - y.sev; }); // kolay seviyeler önce (aynı seviyede karışık)
        kalan.forEach(function (c) { if (havuz.length < OYUN_SORU) havuz.push(c); });
      }
      yakin = kk;
    } else {
      havuz = resimliKartlar(goruldu);
      var seviye1 = kelimeler.filter(function (k) { return k.sev === 1; });
      if (havuz.length < OYUN_SORU) {
        var var_ = new Set(havuz.map(function (k) { return k.id; }));
        karistir(resimliKartlar(seviye1)).forEach(function (k) { if (havuz.length < OYUN_SORU && !var_.has(k.id)) { var_.add(k.id); havuz.push(k); } });
      }
      yakin = goruldu.concat(seviye1);
    }
    return karistir(havuz).slice(0, OYUN_SORU).map(function (k) { return soruYap(k, yakin); });
  }
  function oyunKapat() {
    oyunNo++; clearTimeout(oyunZaman);
    katmanKapat();
  }
  var AFERIN = ["Aferin!", "Harika!", "Süper!"];
  function oyunBaslat(kaynak) {
    var sorular = oyunSorulari(kaynak);
    if (!sorular.length) { oyunKapat(); return; }
    var no = ++oyunNo, sira = 0, dogruSayi = 0;
    clearTimeout(oyunZaman);
    var k = katmanAc("oyun");
    function ciz_() {
      if (no !== oyunNo) return;
      if (sira >= sorular.length) { sonuc(); return; }
      var q = sorular[sira], kilit = false;
      temizle(k);
      var kap = el("div", "dk-sayfa oyun-sayfa");
      var x = dugme("dk-x", "×", oyunKapat, "Oyundan çık"); x.id = "oyun-x";
      var say = el("span", "dk-say oyun-say", (sira + 1) + " / " + sorular.length); say.id = "oyun-say";
      var ust = el("div", "dk-ust"); ust.appendChild(x); ust.appendChild(el("span", "dk-baslik", "Hatırlıyor musun?")); ust.appendChild(say);
      kap.appendChild(ust);
      var orta = el("div", "orta dk-orta");
      var sahne = el("div", "sahne oyun-sahne");
      var f = el("div", "foto"); f.setAttribute("aria-hidden", "true");
      var im = new Image(); im.alt = ""; im.decoding = "async"; im.width = 600; im.height = 480; im.src = resimYolu(q.dogru); f.appendChild(im);
      f.id = "oyun-resim";
      sahne.appendChild(f);
      var gb = el("p", "geri-bildirim", ""); gb.id = "oyun-geri"; gb.setAttribute("role", "status"); sahne.appendChild(gb);
      var trk = el("p", "oyun-tr " + q.dogru.tur, q.dogru.tr); trk.id = "oyun-turkce"; trk.setAttribute("aria-live", "polite");
      sahne.appendChild(trk);
      var liste = el("div", "secenekler"); liste.id = "secenekler";
      var dugmeler = q.secenekler.map(function (c) {
        var b = el("button", "secenek", gorunenIng(c)); b.type = "button"; b.dataset.id = c.id;
        b.addEventListener("click", function () {
          if (kilit) return; kilit = true;
          var ok = c.id === q.dogru.id;
          dugmeler.forEach(function (d) { d.disabled = true; });
          if (ok) {
            dogruSayi++; b.classList.add("dogru"); b.textContent = "✓ " + gorunenIng(c);
            gb.textContent = AFERIN[(dogruSayi - 1) % AFERIN.length];
          } else {
            b.classList.add("yanlis");
            dugmeler.forEach(function (d) { if (d.dataset.id === q.dogru.id) { d.classList.add("dogru"); d.textContent = "✓ " + gorunenIng(q.dogru); } });
          }
          trk.classList.add("acik");
          soyle(q.dogru);
          clearTimeout(oyunZaman);
          oyunZaman = setTimeout(function () { sira++; ciz_(); }, ok ? 2000 : 2600);
        });
        liste.appendChild(b); return b;
      });
      sahne.appendChild(liste);
      orta.appendChild(sahne); kap.appendChild(orta); k.appendChild(kap);
      k.dataset.dogru = q.dogru.id;
    }
    function sonuc() {
      var n = sorular.length, p = Math.round(dogruSayi * 10 / n), ad = kayitliAd(), a = ad ? " " + ad : "";
      var ek = { 4: "te", 5: "te", 6: "da", 7: "de", 8: "de", 9: "da", 10: "da" }[n] || "da";
      var metin = p >= 10 ? "Mükemmel" + a + "!" : p >= 7 ? "Çok iyi iş çıkardın" + a + "!" : p >= 4 ? "İyi iş çıkardın" + a + "!" : "Güzel deneme" + a + ", tekrar oynayalım mı?";
      temizle(k);
      var s = el("div", "sayfa oyun-sonuc");
      var x = dugme("dk-x", "×", oyunKapat, "Kapat"); x.id = "oyun-kapat";
      var ustSatir = el("div", "dk-ust"); ustSatir.appendChild(x); s.appendChild(ustSatir);
      s.appendChild(el("div", "buyuk-emoji", p >= 7 ? "🎉" : "🌟"));
      var b = el("h2", "b sonuc-buyuk", n + "'" + ek + " " + dogruSayi + "!"); b.id = "oyun-sonuc"; s.appendChild(b);
      var o = el("p", "aferin", metin); o.id = "oyun-ovgu"; s.appendChild(o);
      var t = dugme("dugme-beyaz", "Tekrar oyna", function () { oyunBaslat(kaynak); }); t.id = "oyun-tekrar";
      var d = dugme("dugme-koyu", kaynak && kaynak.donus === "oyunlar" ? "Oyunlara dön" : "Kelimelere dön", oyunKapat); d.id = "oyun-don";
      s.appendChild(t); s.appendChild(d);
      k.appendChild(s);
    }
    ciz_();
  }

  // ---------- Ayarlar ----------
  function ayarlarAc() {
    var k = katmanAc("");
    var s = el("div", "sayfa");
    var kapat = dugme("bar-dugme sag", "Kapat", katmanKapat); kapat.id = "kapat";
    s.appendChild(ustBar(el("span", "bar-dugme sol"), el("h1", "", "Ayarlar"), kapat));
    var l = el("div", "ayar-liste"); l.id = "ayar-liste";
    function satir(id, simge, yazi, deger, fn) {
      var b = el("button", "ayar-satir"); b.type = "button"; b.id = id;
      b.appendChild(el("span", "ayar-e", simge)); b.appendChild(el("span", "ayar-y", yazi));
      if (deger !== null) { var d = el("span", "ayar-d", deger); d.id = id + "-deger"; b.appendChild(d); }
      b.appendChild(el("span", "ok", "›"));
      b.addEventListener("click", fn); l.appendChild(b);
    }
    satir("ayar-ad", "👤", "Adımı değiştir", kayitliAd() || "Ad yok", function () { adEkrani("degistir", function () { ayarlarAc(); ciz(false); }); });
    satir("ayar-oner", "🎁", "Arkadaşına öner", null, function () { kilitAc(oneriEkrani); });
    satir("ayar-hakkinda", "ℹ️", "Hakkında", null, function () { kilitAc(hakkindaEkrani); });
    s.appendChild(l);
    var sv = el("p", "ayar-surum", SURUM_YAZISI); sv.id = "surum"; s.appendChild(sv);
    k.appendChild(s);
  }
  var KREDILER = null;
  function hakkindaEkrani() {
    var k = katmanAc("");
    var s = el("div", "sayfa hakkinda-sayfa");
    var geri = dugme("bar-dugme sol", "‹ Geri", ayarlarAc); geri.id = "geri";
    var kapat = dugme("bar-dugme sag", "Kapat", katmanKapat); kapat.id = "kapat";
    s.appendChild(ustBar(geri, el("h1", "", "Hakkında"), kapat));
    var logo = el("img", "buyuk-logo"); logo.src = "icons/sunflower-logo.png"; logo.alt = ""; logo.width = 104; logo.height = 104; logo.setAttribute("aria-hidden", "true");
    var daire = el("div", "buyuk-daire"); daire.appendChild(logo); s.appendChild(daire);
    s.appendChild(el("h2", "b", "English Words for Kids"));
    var h = el("div", "hakkinda-metin"); h.id = "hakkinda-metin";
    h.appendChild(el("p", "", "Sun Flower Apps · Yıldırım Öztürk"));
    h.appendChild(el("p", "", "Ücretsiz, reklamsız. Hiçbir kişisel veri toplanmaz."));
    h.appendChild(el("p", "", "Fotoğraflar: Pexels"));
    var kd = dugme("dugme-hakkinda", "Fotoğrafçılar", function () {
      var kutu = document.getElementById("kredi-liste");
      if (kutu.hidden) {
        kutu.hidden = false; kd.setAttribute("aria-expanded", "true");
        if (!kutu.firstChild) {
          kutu.textContent = "Yükleniyor…";
          fetch("data/krediler.json", { credentials: "omit" }).then(function (r) { return r.json(); }).then(function (d) {
            KREDILER = d.fotografcilar || []; kutu.textContent = KREDILER.join(" · ");
          }).catch(function () { kutu.textContent = "Liste açılamadı."; });
        }
      } else { kutu.hidden = true; kd.setAttribute("aria-expanded", "false"); }
    });
    kd.id = "kredi-ac"; kd.setAttribute("aria-expanded", "false");
    h.appendChild(kd);
    var kl = el("p", "kredi-liste"); kl.id = "kredi-liste"; kl.hidden = true; h.appendChild(kl);
    h.appendChild(el("p", "", "Çizimler: Sun Flower Apps"));
    h.appendChild(el("p", "hakkinda-surum", SURUM_YAZISI));
    s.appendChild(h);
    k.appendChild(s);
  }

  // ---------- Büyüklere soru + Arkadaşına öner ----------
  function oneriAc() { kilitAc(oneriEkrani); }
  function kilitAc(sonra) {
    var k = katmanAc("");
    var a = 6 + Math.floor(Math.random() * 4), b = 6 + Math.floor(Math.random() * 4);
    var s = el("div", "sayfa");
    var bar = el("div", "baslik-bar");
    bar.appendChild(el("span", "bar-dugme sol")); bar.appendChild(el("span", "")); bar.appendChild(dugme("bar-dugme sag", "Kapat", katmanKapat));
    s.appendChild(bar);
    s.appendChild(el("div", "buyuk-emoji", "🧑‍🏫"));
    s.appendChild(el("h2", "b", "Büyüklere soru"));
    s.appendChild(el("p", "ac", "Devam etmek için bir büyüğünden yardım iste."));
    var kart = el("form", "kart-beyaz"); kart.noValidate = true; kart.id = "kilit-form";
    var q = el("div", "soru", a + " x " + b + " = ?"); q.id = "kilit-soru"; q.setAttribute("aria-label", a + " çarpı " + b + " kaç eder?");
    var inp = el("input", "alan"); inp.id = "kilit-cevap"; inp.type = "text"; inp.inputMode = "numeric"; inp.pattern = "[0-9]*";
    inp.placeholder = "Cevap"; inp.setAttribute("aria-label", "Cevap"); inp.setAttribute("autocomplete", "off");
    inp.addEventListener("input", function () {
      var t = inp.value.replace(/\D/g, "").slice(0, 3);
      if (t !== inp.value) inp.value = t;
      tamam.disabled = !t;
    });
    var tamam = el("button", "dugme-koyu", "Tamam"); tamam.type = "submit"; tamam.id = "kilit-tamam"; tamam.disabled = true;
    kart.appendChild(q); kart.appendChild(inp); kart.appendChild(tamam);
    kart.addEventListener("submit", function (e) {
      e.preventDefault();
      if (parseInt(inp.value, 10) === a * b) sonra(); else katmanKapat();
    });
    s.appendChild(kart);
    k.appendChild(s);
    setTimeout(function () { try { inp.focus(); } catch (e) {} }, 50);
  }
  function paylasimLinki() { return location.origin + location.pathname; }
  var PAYLAS_METIN = "English Words for Kids: çocuklar için resimli ve sesli İngilizce kelimeler.";
  function oneriEkrani() {
    var k = katmanAc("pembe");
    var s = el("div", "sayfa");
    var bar = el("div", "baslik-bar");
    bar.appendChild(el("span", "bar-dugme sol")); bar.appendChild(el("h1", "", "Arkadaşına öner"));
    bar.appendChild(dugme("bar-dugme sag", "Kapat", katmanKapat));
    s.appendChild(bar);
    s.appendChild(el("div", "buyuk-emoji", "🎁"));
    var kart = el("div", "kart-beyaz");
    kart.appendChild(el("p", "ac", "Arkadaşına bu uygulamanın bağlantısını gönder. Telefonunda tarayıcıdan açıp ana ekrana ekleyebilir."));
    var link = el("p", "ac", paylasimLinki()); link.id = "oner-link"; link.style.overflowWrap = "anywhere"; link.style.fontSize = ".9375rem";
    kart.appendChild(link);
    var d = dugme("dugme-koyu", "Bağlantıyı paylaş", paylas); d.id = "paylas";
    kart.appendChild(d);
    var tes = el("p", "tesekkur"); tes.id = "paylas-durum"; tes.setAttribute("role", "status");
    kart.appendChild(tes);
    s.appendChild(kart);
    k.appendChild(s);
  }
  function paylas() {
    var durum = document.getElementById("paylas-durum");
    var url = paylasimLinki();
    function kopyalandi() { if (durum) durum.textContent = "Bağlantı kopyalandı ✓"; }
    function kopyala() {
      function yedek() {
        try {
          var t = document.createElement("textarea"); t.value = url; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0";
          document.body.appendChild(t); t.select(); var ok = document.execCommand("copy"); document.body.removeChild(t);
          if (ok) kopyalandi(); else if (durum) durum.textContent = "Bağlantıyı elle kopyala: " + url;
        } catch (e) { if (durum) durum.textContent = "Bağlantıyı elle kopyala: " + url; }
      }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(kopyalandi, yedek);
        else yedek();
      } catch (e) { yedek(); }
    }
    if (navigator.share) {
      navigator.share({ title: "English Words for Kids", text: PAYLAS_METIN, url: url }).catch(function (e) {
        if (e && e.name === "AbortError") return;
        kopyala();
      });
    } else kopyala();
  }

  // ---------- App Store şeridi ----------
  function seritiKur() {
    if (typeof APP_STORE_ACIK === "undefined" || !APP_STORE_ACIK) return;
    var ua = navigator.userAgent || "";
    var ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (!ios) return;
    var s = document.getElementById("serit"), a = document.createElement("a");
    a.href = APP_STORE_LINK; a.rel = "noopener"; a.textContent = "iPhone'da App Store'dan indirin";
    s.appendChild(a); s.hidden = false;
    document.getElementById("ana").classList.add("seritli");
  }

  // ---------- Başlangıç ----------
  function baslat() {
    if (S.baslandi) return;
    S.baslandi = true;
    katmanKapat();
    yukle();
    sekmeCubuguKur();
    yeniKelime(); // YENİ OTURUM: açılışta rampanın 1. basamağından bir kelime gelir
    seritiKur();
  }
  function acilis() {
    if (!kayitliAd() && !dep.oku(K.adAtlandi)) adEkrani("ilk", baslat);
    else baslat();
  }
  function servisIsleyici() {
    try {
      if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});
    } catch (e) {}
  }

  // Test kancası: sadece adres ?test ile açılırsa (mağaza sürümünde kullanılmaz).
  function testKancasi() {
    if (!/^(127\.0\.0\.1|localhost)$/.test(location.hostname) || !/[?&]test(=|&|$)/.test(location.search)) return; // yayında etkisiz
    window.__ewk = {
      durum: function () {
        return { bugun: bugunkuSayi(), toplam: ogrenilenToplam(), gecmis: S.gecmis.length, konum: S.konum, gezinti: S.gezinti.length, cur: S.cur && S.cur.id, konu: S.kategori };
      },
      kartlar: function () { return kelimeler; },
      sifirla: function () {
        S.gorulen = new Set(); S.gecmis = []; S.gezinti = []; S.konum = 0; S.kuyruk = [];
        dep.yazJson(K.gorulen, []); dep.yazJson(K.gecmis, []); gezintiKaydet();
      },
      // dun: bu kimlikler "dün" görülmüş gibi eklenir
      dunEkle: function (idler) {
        var d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - 1);
        idler.forEach(function (id, i) { S.gecmis.push([id, d.getTime() + i * 1000]); S.gorulen.add(id); });
        S.gecmis.sort(function (a, b) { return b[1] - a[1]; });
        dep.yazJson(K.gorulen, Array.from(S.gorulen)); dep.yazJson(K.gecmis, S.gecmis);
      },
      mufKartlari: function () { return mufKartlari; },
      kategoriler: function () { return kategoriler; },
      temalar: function (sn) { var c = siniflar.filter(function (x) { return x.sinif === (sn || 6); })[0]; return c ? c.temalar : []; },
      siniflar: function () { return siniflar.map(function (c) { return { sinif: c.sinif, ad: c.ad, temalar: c.temalar.length }; }); },
      soruUret: function (temaNo, konuId, sn) {
        var t = null; if (temaNo) (window.__ewk.temalar(sn)).forEach(function (x) { if (x.no === temaNo) t = x; });
        return oyunSorulari(t ? { tema: t } : konuId ? { kategori: konuId } : null).map(function (q) { return { dogru: q.dogru.id, secenekler: q.secenekler.map(function (c) { return c.id; }) }; });
      },
      ovgu: ovguCumlesi,
      adTemizle: adTemizle,
      // bugun: ilk n kelime "bugün görülmüş" olarak yazılır
      bugunDoldur: function (n) {
        S.gecmis = []; var t = Date.now();
        for (var i = 0; i < n && i < kelimeler.length; i++) { S.gecmis.push([kelimeler[i].id, t - i]); S.gorulen.add(kelimeler[i].id); }
        dep.yazJson(K.gorulen, Array.from(S.gorulen)); dep.yazJson(K.gecmis, S.gecmis);
      },
      goster: function (id) { goster(kartlar[id]); },
      sonraki: sonraki, onceki: onceki
    };
  }

  function yukleVeri() {
    // Ders verisi (6, 7, 8. sınıf) yoksa ana uygulama yine açılır; sınıflar sırayla kurulur.
    var mufredat = Promise.all([6, 7, 8].map(function (n) {
      return fetch("data/mufredat" + n + ".json", { credentials: "omit" }).then(function (r) {
        if (!r.ok) throw new Error("müfredat " + r.status);
        return r.json();
      }).catch(function () { return null; });
    }));
    return fetch("data/kelimeler.json", { credentials: "omit" }).then(function (r) {
      if (!r.ok) throw new Error("veri " + r.status);
      return r.json();
    }).then(function (d) { return mufredat.then(function (m) { d.__mufredat = m; return d; }); });
  }
  function hataGoster() {
    var ana = document.getElementById("ana");
    temizle(ana);
    var p = el("p", "aferin", "Uygulama açılamadı. İnterneti açıp sayfayı yenile.");
    p.style.margin = "auto 24px";
    ana.appendChild(p);
  }
  function basla() {
    yukleVeri().then(function (d) {
      kategoriler = d.kategoriler; kelimeler = d.kelimeler;
      kelimeler.forEach(function (k) { kartlar[k.id] = k; });
      (d.__mufredat || []).forEach(mufVeriKur);
      testKancasi();
      acilis();
      servisIsleyici();
    }).catch(hataGoster);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", basla); else basla();
})();
