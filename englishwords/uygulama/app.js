/* English Words for Kids · Web (PWA)
   Uygulamanın (SwiftUI 1.8 (14)) davranışı birebir taşındı:
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
    ad: "ewk.ad", adAtlandi: "ewk.adAtlandi"
  };

  // ---------- Sabitler (uygulamayla aynı) ----------
  var GEZINTI_LIMIT = 300, GECMIS_LIMIT = 5000, ADIM_BOYU = 10, EN_YUKSEK = 5, EN_UZUN_ISIM = 4, KUYRUK = 3;
  var AD_EN_FAZLA = 15;
  var TUR_AD = { n: "isim", v: "fiil", a: "sıfat", adv: "zarf" };

  var kelimeler = [], kategoriler = {}, kartlar = {};

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
    gorulen: new Set(), gecmis: [], gezinti: [], konum: 0, cur: null, sayac: 0, kategori: null, kuyruk: [], baslandi: false
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
  function katmanAc(sinif) {
    katman = document.getElementById("katman");
    katman.className = sinif || "";
    temizle(katman); katman.hidden = false; katman.scrollTop = 0;
    return katman;
  }
  function katmanKapat() {
    var k = document.getElementById("katman");
    k.hidden = true; temizle(k);
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
    ana.dataset.wid = k.id; ana.dataset.sev = String(k.sev); ana.dataset.tur = k.tur;
    ana.dataset.resim = k.resim || ""; ana.dataset.rk = k.rk || "";
    ana.dataset.konum = String(S.konum);

    var onceki_ = ana.querySelector(".orta");
    var ilk = !ana.firstChild;
    if (ilk) kur(ana);

    // Üst çubuk
    ana.querySelector(".rozet.kat .em").textContent = kat.emoji;
    ana.querySelector(".rozet.kat .ad").textContent = kat.ad;
    var bs = bugunkuSayi();
    ana.querySelector(".rozet.yildiz .sayi").textContent = String(bs);
    ana.querySelector(".rozet.yildiz").setAttribute("aria-label", "Bugün " + bs + " kelime");

    // Selam (sadece açılışta, adı olan/olmayan)
    var selam = ana.querySelector(".selam");
    var ad = kayitliAd();
    selam.querySelector(".selam-yazi").textContent = ad ? "Merhaba " + ad + "!" : "Merhaba!";

    // Kelime kartı
    var gorsel = null;
    if (k.resim) gorsel = "foto"; else if (k.emoji) gorsel = "emoji";
    var sahne = ana.querySelector(".sahne");
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
    var t = el("span", "tur " + k.tur, k.tur); t.setAttribute("aria-hidden", "true");
    var hop = dugme("hoparlor", "", function () { soyle(S.cur); }, "Sesli dinle");
    hop.id = "hoparlor"; hop.appendChild(svg(SIMGE.hoparlor));
    satir.appendChild(h); satir.appendChild(t); satir.appendChild(hop);
    sahne.appendChild(satir);
    sahne.appendChild(el("p", "turkce " + k.tur, k.tr));
    if (animasyon) { void sahne.offsetWidth; sahne.classList.add("pop"); }

    // Önceki düğmesi
    var ob = ana.querySelector("#onceki"); if (ob) ob.disabled = !oncekiVar();
    void onceki_;
  }
  function kur(ana) {
    var ust = el("div", "ust");
    var kat = el("div", "rozet kat"); kat.id = "kategori-rozet";
    kat.appendChild(el("span", "em")); kat.appendChild(el("span", "ad"));
    var bosluk = el("div", "bosluk");
    var yil = el("div", "rozet yildiz", ""); yil.setAttribute("role", "img");
    yil.appendChild(el("span", "", "⭐️")); yil.appendChild(el("span", "sayi", "0"));
    var gec = dugme("yuvarlak", "", gecmisAc, "Öğrendiklerim"); gec.id = "gecmis-dugme";
    var s1 = el("span"); s1.appendChild(svg(SIMGE.izgara)); gec.appendChild(s1);
    var ger = dugme("yuvarlak", "", oneriAc, "Arkadaşına öner"); ger.id = "oner-dugme";
    var s2 = el("span"); s2.appendChild(svg(SIMGE.hediye)); ger.appendChild(s2);
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
    var sv = el("p", "surum", SURUM_YAZISI); sv.id = "surum"; alt.appendChild(sv);
    ana.appendChild(alt);
    ana.appendChild(el("div", "yildizlar"));
    jestleriKur(ana);
  }

  // Sola kaydır = Sonraki, sağa kaydır = Önceki, çift dokunma = Sonraki.
  function jestleriKur(ana) {
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
    h.appendChild(el("p", "", SURUM_YAZISI));
    h.appendChild(el("p", "", "Fotoğraflar: Pexels"));
    h.appendChild(el("p", "", "Çizimler: Sun Flower Apps"));
    h.appendChild(el("p", "", "Sun Flower Apps · Yıldırım Öztürk"));
    var ad = dugme("dugme-hakkinda", "Adımı değiştir", function () { adEkrani("degistir", function () { gecmisAc(); ciz(false); }); });
    ad.id = "ad-degistir"; ad.style.marginTop = "10px";
    h.appendChild(ad);
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
      var w = el("b", kel.tur, gorunenIng(kel) + " "); w.appendChild(el("i", "", "(" + kel.tur + ")"));
      b.appendChild(w); b.appendChild(el("small", "", kel.tr));
      b.addEventListener("click", function () { soyle(kel); });
      iz.appendChild(b);
    });
    s.appendChild(iz);
    k.appendChild(s);
  }

  // ---------- Büyüklere soru + Arkadaşına öner ----------
  function oneriAc() {
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
      if (parseInt(inp.value, 10) === a * b) oneriEkrani(); else katmanKapat();
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
    var k = document.getElementById("katman"); k.hidden = true; temizle(k);
    yukle();
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
        return { bugun: bugunkuSayi(), toplam: ogrenilenToplam(), gecmis: S.gecmis.length, konum: S.konum, gezinti: S.gezinti.length, cur: S.cur && S.cur.id };
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
    return fetch("data/kelimeler.json", { credentials: "omit" }).then(function (r) {
      if (!r.ok) throw new Error("veri " + r.status);
      return r.json();
    });
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
      testKancasi();
      acilis();
      servisIsleyici();
    }).catch(hataGoster);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", basla); else basla();
})();
