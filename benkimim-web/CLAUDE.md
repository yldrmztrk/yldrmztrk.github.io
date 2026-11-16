# Ben Kimim? — web sürümü (Web v0.2)

Canlı adres: https://yldrmztrk.github.io/benkimim-web/ (noindex). Düz HTML/CSS/JS; sunucu, giriş, dış kütüphane YOK.
Ad ve sonuçlar sadece tarayıcıda (localStorage `bk.*`). Hiçbir veri toplanmaz, hiçbir yere gönderilmez.

## Kaynak ve yayın
- Test içerikleri iOS projesinden (`~/Developer/BenKimim`) SADECE OKUNUR; iOS koduna dokunulmaz.
- `data.json` ELLE DÜZENLENMEZ. Üretmek için (depo kökünde): `python3 -I benkimim-web-araclar/build_data.py`
  (iOS `catalog.json` + görünen test JSON'ları + Karakter Karnem metinleri; `magazadaGizli` testler alınmaz).
- DİKKAT: iOS deposundaki eski `web/tools/publish.sh` artık KULLANILMAZ; oradaki `web/site/` Web v0.1'de kaldı,
  çalıştırılırsa bu klasörü eski hâliyle ezer. Güncel kaynak bu klasördür.
- Yayın: bu depoda commit + push → GitHub Pages birkaç dakikada günceller.
- Sürüm değişince birlikte artır: `app.js` `VERSION`, `index.html` ve `sw.js`'deki tüm `?v=`, `sw.js` `CACHE` adı,
  `app.js`'deki `data.json?v=`. Sürüm açılış ekranında ve Ayarlar'da görünür.

## Sıralama kuralı (kalıcı, iOS ile aynı)
- Yeni eklenen kategori ana sayfada EN ÜSTE, yeni test kendi kategorisinin EN ÜSTÜNE gelir ve üstüne "Yeni ✨" etiketi konur.
  Eski testlerin ve kategorilerin sırası değişmez.
- Tek yerden yönetilir: iOS `catalog.json`'da kategoriye/teste `"eklenme": <o ana kadarki en büyük + 1>` ve `"yeni": true`.
  Web'de sıralamayı `app.js` → `newestFirst` yapar (büyük `eklenme` üstte, eşitler katalog sırasında).
  Katalogda olmayan test JSON'u da en üste, "Yeni" etiketiyle gelir.
- Şu an: Burç 🌙 (`eklenme: 1`, "Yeni ✨") ana sayfada ilk. Toplam 13 kategori, 61 test.

## Özellikler
- Sonuç ekranı, Karakter Karnem ve Ayarlar'da "Eğlence amaçlıdır, bilimsel bir değerlendirme değildir 🙂" notu; kaldırma.
- Arkadaşına öner: Ayarlar'da 🎁 satırı → pencere: QR (`qr.js`, sayfanın içinde üretilir, internet gerekmez) web adresine gider,
  "Bağlantıyı paylaş" telefonda paylaşım menüsünü açar, desteklenmezse panoya kopyalar ("Kopyalandı"). Metin `app.js` `RECOMMEND_TEXT`.
