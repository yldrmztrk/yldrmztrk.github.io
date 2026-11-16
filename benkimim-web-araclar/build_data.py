#!/usr/bin/env python3
"""iOS uygulamasının içeriğini web sürümü için tek bir JSON dosyasına çevirir.

Kaynaklar (iOS koduna dokunmaz, sadece okur):
  BenKimim/Content/catalog.json, BenKimim/Content/Tests/test_*.json
  BenKimim/Services/CharacterReport.swift, BenKimim/Services/ReportTitles.swift
Çıktı: ~/Developer/yldrmztrk.github.io/benkimim-web/data.json
(iOS deposundaki web/tools/build_data.py'nin web deposundaki kopyası; iOS deposuna hiçbir şey yazmaz.)

iOS'taki TestLibrary.load ile aynı kural: "magazadaGizli": true testler hiç alınmaz,
testi kalmayan kategori gizlenir. Kullanım: python3 -I benkimim-web-araclar/build_data.py
Sıralama (yeni en üstte) app.js'deki newestFirst ile yapılır; burada sadece "eklenme" ve "yeni" aktarılır.
"""
import json, re, sys
from pathlib import Path

IOS = Path.home() / "Developer" / "BenKimim"
APP = IOS / "BenKimim"
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "benkimim-web" / "data.json"
TRAITS = ["sosyal", "plan", "macera", "tempo", "karar"]
STR = r'"((?:[^"\\]|\\.)*)"'


def unescape(s):
    return s.replace('\\"', '"').replace("\\\\", "\\")


def fail(msg):
    sys.exit("HATA: " + msg)


def load_tests():
    catalog = json.loads((APP / "Content/catalog.json").read_text("utf-8"))
    all_tests = [json.loads(p.read_text("utf-8")) for p in sorted((APP / "Content/Tests").glob("test_*.json"))]
    hidden = {t["id"] for t in all_tests if t.get("magazadaGizli")}
    visible = {t["id"]: t for t in all_tests if not t.get("magazadaGizli")}
    categories, tests = [], {}
    for cat in catalog["categories"]:
        entries = [dict(id=e["id"], title=e["title"], emoji=e["emoji"], everyone=bool(e.get("everyone")),
                        eklenme=int(e.get("eklenme", 0)), yeni=bool(e.get("yeni")))
                   for e in cat["tests"] if e["id"] not in hidden]
        listed = {e["id"] for e in cat["tests"]}
        extras = sorted((t for t in visible.values() if t["category"] == cat["id"] and t["id"] not in listed),
                        key=lambda t: t["title"])
        # Katalogda olmayan test JSON'u en yeni sayılır (iOS ile aynı): en üste, "Yeni" etiketiyle
        entries = [dict(id=t["id"], title=t["title"], emoji=t["emoji"], everyone=False, eklenme=10**6, yeni=True)
                   for t in extras] + entries
        ready = [e for e in entries if e["id"] in visible]
        soon = [e for e in entries if e["id"] not in visible]
        if not entries:
            continue
        for e in ready:
            t = visible[e["id"]]
            e["intro"] = t["intro"]
            tests[e["id"]] = {k: t[k] for k in ("id", "category", "title", "emoji", "intro", "results", "questions")}
            if t.get("anmaNotu"):
                tests[e["id"]]["anmaNotu"] = t["anmaNotu"]
            for q in tests[e["id"]]["questions"]:
                for o in q["options"]:
                    o.setdefault("traits", {})
        categories.append(dict(id=cat["id"], name=cat["name"], emoji=cat["emoji"], entries=ready + soon,
                               eklenme=int(cat.get("eklenme", 0)), yeni=bool(cat.get("yeni"))))
    return categories, tests


def section(src, start, end):
    i = src.index(start)
    j = src.index(end, i)
    return src[i:j]


def load_report():
    cr = (APP / "Services/CharacterReport.swift").read_text("utf-8")
    rt = (APP / "Services/ReportTitles.swift").read_text("utf-8")

    names = dict(re.findall(r'case \.(\w+): "([^"]+)"', section(cr, "var name: String", "var plusPole")))
    pole_re = re.compile(r'case \.(\w+):\s*Pole\(label: ' + STR + r', emoji: ' + STR +
                         r',\s*lead: ' + STR + r',\s*twist: ' + STR + r'\)')

    def poles(block):
        return {m[0]: dict(label=unescape(m[1]), emoji=m[2], lead=unescape(m[3]), twist=unescape(m[4]))
                for m in pole_re.findall(block)}

    plus = poles(section(cr, "var plusPole", "var minusPole"))
    minus = poles(section(cr, "var minusPole", "var comments"))
    comments = {}
    for m in re.finditer(r'case \.(\w+): \[(.*?)\]', section(cr, "var comments", "struct Pole"), re.S):
        comments[m[1]] = [unescape(s) for s in re.findall(STR, m[2])]
    closings = [unescape(s) for s in re.findall(STR, section(cr, "closings = [", "]"))]
    balanced_summary = unescape(re.search(r'summary = ' + STR + r'\s*\n\s*return', cr)[1])
    required = int(re.search(r'static let requiredTests = (\d+)', cr)[1])
    threshold = float(re.search(r'static let threshold = ([\d.]+)', cr)[1])

    title_re = re.compile(STR + r':\s*ReportTitle\(emoji: ' + STR + r', title: ' + STR + r',\s*reason: ' + STR + r'\)')

    def titles(block):
        return {m[0]: dict(emoji=m[1], title=unescape(m[2]), reason=unescape(m[3])) for m in title_re.findall(block)}

    b = re.search(r'balanced = ReportTitle\(\s*emoji: ' + STR + r', title: ' + STR + r',\s*reason: ' + STR + r'\)', rt)
    balanced = dict(emoji=b[1], title=unescape(b[2]), reason=unescape(b[3]))
    single = titles(section(rt, "static let single", "static let pair"))
    pair = titles(section(rt, "static let pair", "static func key"))

    # Eksik okuma olursa sessizce geçmesin
    for label, d, n in [("ad", names, 5), ("artı uç", plus, 5), ("eksi uç", minus, 5), ("yorum", comments, 5),
                        ("tek unvan", single, 10), ("ikili unvan", pair, 40)]:
        if len(d) != n:
            fail(f"{label}: {len(d)} bulundu, {n} bekleniyordu")
    if any(len(v) != 5 for v in comments.values()) or len(closings) != 5:
        fail("yorum/kapanış sayısı tutmuyor")

    return dict(
        requiredTests=required, threshold=threshold, closings=closings,
        balanced=balanced, balancedSummary=balanced_summary, single=single, pair=pair,
        traits=[dict(key=k, name=names[k], plus=plus[k], minus=minus[k], comments=comments[k]) for k in TRAITS],
    )


def main():
    categories, tests = load_tests()
    data = dict(categories=categories, tests=tests, report=load_report(),
                funNote="Eğlence amaçlıdır, bilimsel bir değerlendirme değildir 🙂")
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), "utf-8")
    print(f"{len(categories)} kategori, {len(tests)} test -> {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
