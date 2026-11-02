// Ben Kimim? — web sürümü. Sunucu yok, giriş yok; ad ve sonuçlar sadece bu cihazın tarayıcısında (localStorage).
(function () {
  "use strict";

  const VERSION = "Web v0.1";
  const MAX_NAME = 30;
  const KEY = { name: "bk.name", prompted: "bk.namePromptDone", results: "bk.results" };
  const S = window.BKScoring;
  const app = document.getElementById("app");
  const tabs = document.getElementById("tabs");
  const dialogRoot = document.getElementById("dialog-root");

  let DATA = null;
  let quiz = null; // { test, answers, index, result, busy }

  // ---------- Depolama ----------
  const store = {
    get(k, fallback) {
      try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch (_) { return fallback; }
    },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
    clear() { try { Object.values(KEY).forEach((k) => localStorage.removeItem(k)); } catch (_) {} },
  };
  const getName = () => String(store.get(KEY.name, "") || "").trim();
  const getResults = () => {
    const list = store.get(KEY.results, []);
    return Array.isArray(list) ? list.sort((a, b) => b.date - a.date) : [];
  };

  // ---------- Yardımcılar ----------
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const visibleTest = (id) => (DATA.tests[id] ? DATA.tests[id] : null);
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  const report = () => S.characterReport(getResults().filter((r) => visibleTest(r.testID)), DATA.report);

  function relativeDate(ms) {
    const diff = (ms - Date.now()) / 1000;
    const rtf = new Intl.RelativeTimeFormat("tr", { numeric: "auto" });
    const steps = [[60, "second"], [3600, "minute"], [86400, "hour"], [604800, "day"], [2629800, "week"], [31557600, "month"], [Infinity, "year"]];
    const sizes = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2629800, year: 31557600 };
    for (const [limit, unit] of steps) {
      if (Math.abs(diff) < limit) return rtf.format(Math.round(diff / sizes[unit]), unit);
    }
    return "";
  }

  function toast(text) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  function confirmBox(title, message, okLabel, onOk) {
    dialogRoot.innerHTML = `<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="dlg-t">
      <div class="dialog"><h3 id="dlg-t">${esc(title)}</h3><p>${esc(message)}</p>
      <div class="row2"><button data-act="cancel">Vazgeç</button><button class="red" data-act="ok">${esc(okLabel)}</button></div></div></div>`;
    const close = () => { dialogRoot.innerHTML = ""; };
    dialogRoot.querySelector('[data-act="cancel"]').onclick = close;
    dialogRoot.querySelector(".overlay").onclick = (e) => { if (e.target.classList.contains("overlay")) close(); };
    dialogRoot.querySelector('[data-act="ok"]').onclick = () => { close(); onOk(); };
    dialogRoot.querySelector('[data-act="cancel"]').focus();
  }

  async function share(text) {
    if (navigator.share) {
      try { await navigator.share({ text }); } catch (_) {}
      return;
    }
    try { await navigator.clipboard.writeText(text); toast("Sonuç kopyalandı, istediğin yere yapıştırabilirsin 📋"); }
    catch (_) { toast(text); }
  }

  const topbar = (title, backHref) =>
    `<div class="topbar"><a class="back" href="${backHref}">Geri</a><div class="title">${esc(title)}</div></div>`;
  const funNote = () => `<p class="fun-note">${esc(DATA.funNote)}</p>`;

  function setTabs(active) {
    tabs.hidden = !active;
    app.classList.toggle("no-tabs", !active);
    tabs.querySelectorAll("a").forEach((a) => a.classList.toggle("active", a.dataset.tab === active));
  }

  // ---------- Ekranlar ----------
  function renderNamePrompt() {
    setTabs(null);
    app.innerHTML = `<div class="welcome">
      <img src="logo.png" alt="" width="140" height="140">
      <h1>Ben Kimim?</h1>
      <p class="sub">Eğlenceli testlerle içindeki çaydanlığı, kediyi ya da terliği keşfet! 🎉</p>
      <form id="name-form" autocomplete="off">
        <label class="field-label" for="name">Sana nasıl seslenelim? 👋</label>
        <input class="input" id="name" maxlength="${MAX_NAME}" placeholder="Adın (isteğe bağlı)" autocapitalize="words" autocorrect="off" spellcheck="false" enterkeyhint="done">
        <div class="buttons" style="margin-top:24px">
          <button class="btn-primary pressable" type="submit" disabled>Hadi başlayalım!</button>
          <button class="btn-link" type="button" id="skip">Şimdilik atla</button>
        </div>
      </form>
      <p class="small-note">Tamamen eğlence amaçlıdır. Adın sadece bu cihazda kalır, istersen Ayarlar'dan değiştirebilirsin.</p>
      <p class="version">${VERSION}</p>
    </div>`;
    const input = document.getElementById("name");
    const btn = app.querySelector(".btn-primary");
    input.oninput = () => { btn.disabled = !input.value.trim(); };
    document.getElementById("name-form").onsubmit = (e) => {
      e.preventDefault();
      const n = input.value.trim().slice(0, MAX_NAME);
      if (!n) return;
      store.set(KEY.name, n);
      store.set(KEY.prompted, true);
      route();
    };
    document.getElementById("skip").onclick = () => { store.set(KEY.prompted, true); route(); };
  }

  function renderHome() {
    setTabs("home");
    const name = getName();
    const rep = report();
    const R = DATA.report;
    const dots = Array.from({ length: R.requiredTests }, (_, i) => `<i class="${i < rep.testCount ? "on" : ""}"></i>`).join("");
    const reportInner = `<div class="icon" aria-hidden="true">${rep.isUnlocked ? esc(rep.emoji) : "🔒"}</div>
      <div class="text"><strong>Karakter Karnem</strong>
      ${rep.isUnlocked ? `<small>${esc(rep.title)}</small>` : `<small>Seni çözmemize ${rep.remainingTests} test kaldı</small><div class="dots" aria-hidden="true">${dots}</div>`}
      </div>${rep.isUnlocked ? '<span class="chev" aria-hidden="true"></span>' : ""}`;
    const reportCard = rep.isUnlocked
      ? `<a class="report-entry pressable" href="#/karne" id="report-card">${reportInner}</a>`
      : `<div class="report-entry" id="report-card" aria-label="Karne ${R.requiredTests} test çözünce açılır">${reportInner}</div>`;
    const cards = DATA.categories.map((c, i) =>
      `<a class="cat-card pressable ${[0, 3].includes(i % 4) ? "purple" : ""}" href="#/k/${esc(c.id)}">
        <span class="emoji" aria-hidden="true">${esc(c.emoji)}</span>
        <span class="name">${esc(c.name)}</span><span class="count">${c.entries.length} test</span></a>`).join("");
    app.innerHTML = `<div class="greeting"><h1>${name ? `Merhaba ${esc(name)}! 👋` : "Merhaba! 👋"}</h1>
      <p>Bugün kim olmak istersin?</p></div>${reportCard}<div class="grid">${cards}</div>`;
  }

  function renderCategory(id) {
    const cat = DATA.categories.find((c) => c.id === id);
    if (!cat) return go("#/");
    setTabs("home");
    const rows = cat.entries.map((e) => {
      const ready = !!visibleTest(e.id);
      const inner = `<span class="icon" aria-hidden="true">${esc(e.emoji)}</span>
        <span class="text"><strong>${esc(e.title)}</strong>
        ${e.everyone ? '<span class="everyone">Herkes çözebilir</span>' : ""}
        ${ready ? `<small>${esc(e.intro)}</small>` : ""}</span>
        ${ready ? '<span class="chev" aria-hidden="true"></span>' : '<span class="badge">Yakında</span>'}`;
      return ready ? `<a class="row pressable" href="#/t/${esc(e.id)}">${inner}</a>` : `<div class="row soon">${inner}</div>`;
    }).join("");
    app.innerHTML = `${topbar("", "#/")}<h1 class="large-title">${esc(cat.emoji)} ${esc(cat.name)}</h1><div class="list">${rows}</div>`;
  }

  function startQuiz(id) {
    const test = visibleTest(id);
    if (!test) return go("#/");
    if (!quiz || quiz.test.id !== id) {
      quiz = { test, answers: new Array(test.questions.length).fill(null), index: 0, result: null, busy: false };
    }
    if (quiz.result) renderResult(quiz.test, quiz.result, { retry: true });
    else renderQuestion();
  }

  function renderQuestion() {
    setTabs(null);
    const { test, index, answers } = quiz;
    const q = test.questions[index];
    const total = test.questions.length;
    const letters = ["A", "B", "C", "D", "E"];
    const back = `#/k/${test.category}`;
    app.innerHTML = `${topbar(test.title, back)}
      <div class="quiz-head"><span class="count">Soru ${index + 1} / ${total}</span>
        ${index > 0 ? '<button class="prev pressable" id="prev" aria-label="Önceki soru">↩︎ Önceki</button>' : ""}
        <span aria-hidden="true">${esc(test.emoji)}</span></div>
      <div class="progress" role="progressbar" aria-label="İlerleme" aria-valuenow="${Math.round(((index + 1) / total) * 100)}" aria-valuemin="0" aria-valuemax="100">
        <div style="width:${((index + 1) / total) * 100}%"></div></div>
      <div class="question"><h2>${esc(q.text)}</h2><div class="options">
        ${q.options.map((o, i) => `<button class="option pressable ${answers[index] === i ? "selected" : ""}" data-i="${i}" data-testid="option-${i}">
          <span class="letter">${letters[i % 5]}</span><span class="otext">${esc(o.text)}</span></button>`).join("")}
      </div></div>`;
    const prev = document.getElementById("prev");
    if (prev) prev.onclick = () => { if (!quiz.busy) { quiz.index--; renderQuestion(); } };
    app.querySelectorAll(".option").forEach((b) => { b.onclick = () => select(Number(b.dataset.i)); });
  }

  function select(i) {
    if (!quiz || quiz.busy) return;
    quiz.answers[quiz.index] = i;
    quiz.busy = true;
    app.querySelectorAll(".option").forEach((b) => b.classList.toggle("selected", Number(b.dataset.i) === i));
    if (navigator.vibrate) { try { navigator.vibrate(10); } catch (_) {} }
    const current = quiz;
    setTimeout(() => {
      if (quiz !== current) return;
      quiz.busy = false;
      if (quiz.index < quiz.test.questions.length - 1) { quiz.index++; renderQuestion(); window.scrollTo(0, 0); }
      else finish();
    }, 280);
  }

  function finish() {
    const { test, answers } = quiz;
    if (answers.some((a) => a == null)) return;
    const winId = S.winningResultID(test, answers);
    const winner = test.results.find((r) => r.id === winId);
    if (!winner) return;
    const traitKeys = DATA.report.traits.map((t) => t.key);
    const list = getResults();
    list.unshift({
      id: newId(), date: Date.now(), testID: test.id, testTitle: test.title,
      resultID: winner.id, resultTitle: winner.title, resultEmoji: winner.emoji, resultDescription: winner.description,
      traitScores: S.traitScores(test, answers, traitKeys),
    });
    store.set(KEY.results, list);
    quiz.result = winner;
    renderResult(test, winner, { retry: true });
    window.scrollTo(0, 0);
  }

  function renderResult(test, result, opts) {
    setTabs(null);
    const backHref = opts.closeHref || `#/k/${test ? test.category : ""}`;
    const testTitle = test ? test.title : opts.testTitle;
    const anma = test && test.anmaNotu;
    app.innerHTML = `${topbar("", backHref)}<div class="center">
      <div class="result-test">${esc(testTitle)}</div>
      <div class="big-emoji" aria-hidden="true">${esc(result.emoji)}</div>
      <div class="sen">Sen…</div>
      <h1 class="result-title" id="result-title">${esc(result.title)}</h1>
      <div class="card"><p class="result-desc">${esc(result.description)}</p>
        ${result.quote ? `<p class="quote">“${esc(result.quote)}”</p>` : ""}</div>
      ${anma ? `<div class="card anma"><div class="flag" aria-hidden="true">🇹🇷</div><p>${esc(anma)}</p></div>` : ""}
      <div class="buttons">
        <button class="btn-primary pressable" id="share">📤 Paylaş</button>
        ${opts.retry ? '<button class="btn-secondary pressable" id="retry">↻ Tekrar Çöz</button>' : ""}
        ${opts.retry ? '<a class="btn-link" style="display:grid;place-items:center" href="#/">Ana sayfaya dön</a>' : ""}
      </div>${funNote()}</div>`;
    document.getElementById("share").onclick = () => share(`"${testTitle}" testinde sonucum: ${result.emoji} ${result.title}`);
    const retry = document.getElementById("retry");
    if (retry) retry.onclick = () => {
      quiz = { test, answers: new Array(test.questions.length).fill(null), index: 0, result: null, busy: false };
      renderQuestion();
      window.scrollTo(0, 0);
    };
  }

  function renderSavedResult(id) {
    const saved = getResults().find((r) => r.id === id);
    if (!saved) return go("#/sonuclar");
    const test = visibleTest(saved.testID);
    const live = test && test.results.find((r) => r.id === saved.resultID);
    renderResult(test, {
      emoji: saved.resultEmoji, title: saved.resultTitle, description: saved.resultDescription, quote: live ? live.quote : null,
    }, { closeHref: "#/sonuclar", testTitle: saved.testTitle });
  }

  function renderReport() {
    const rep = report();
    if (!rep.isUnlocked) return go("#/");
    setTabs(null);
    const lines = rep.lines.map((l) => {
      const p = Math.max(-1, Math.min(1, l.position));
      const dot = ((1 - p) / 2) * 100;
      const left = Math.min(dot, 50), width = Math.abs(dot - 50);
      return `<div class="trait"><h3>${esc(l.trait.name)}</h3>
        <div class="bar" aria-hidden="true"><div class="track"></div>
          <div class="fill" style="left:calc(${left}% - 7px);width:calc(${width}% + 14px)"></div>
          <div class="dot" style="left:${dot}%"></div></div>
        <div class="poles"><span class="${l.position > 0.05 ? "on" : ""}">${esc(l.trait.plus.emoji)} ${esc(l.trait.plus.label)}</span>
          <span class="${l.position < -0.05 ? "on" : ""}">${esc(l.trait.minus.emoji)} ${esc(l.trait.minus.label)}</span></div>
        <p>${esc(l.comment)}</p></div>`;
    }).join("");
    app.innerHTML = `${topbar("Karakter Karnem", "#/")}
      <div class="report-head"><div class="emoji" aria-hidden="true">${esc(rep.emoji)}</div>
        <h2 id="report-title">${esc(rep.title)}</h2>
        <div class="why"><b>Neden bu çıktı?</b><span>${esc(rep.reason)}</span></div>
        <p>${esc(rep.summary)}</p></div>
      ${lines}
      <div class="buttons"><button class="btn-primary pressable" id="share">📤 Karnemi Paylaş</button></div>
      <p class="foot">${rep.testCount} test üzerinden hesaplandı. Her yeni testte güncellenir.</p>${funNote()}`;
    document.getElementById("share").onclick = () => share(`Karakter Karnem: ${rep.emoji} ${rep.title}`);
  }

  function renderResults() {
    setTabs("results");
    const list = getResults().filter((r) => visibleTest(r.testID));
    if (!list.length) {
      app.innerHTML = `<h1 class="large-title">Sonuçlarım</h1><div class="empty"><div class="e">🔮</div>
        <h2>Henüz sonuç yok</h2><p>Bir test çöz, sonuçların burada birikmeye başlasın!</p></div>`;
      return;
    }
    app.innerHTML = `<h1 class="large-title">Sonuçlarım</h1><div class="list">${list.map((r) =>
      `<div class="row"><a class="icon pressable" href="#/sonuc/${esc(r.id)}" aria-hidden="true" tabindex="-1">${esc(r.resultEmoji)}</a>
        <a class="text" href="#/sonuc/${esc(r.id)}"><strong>${esc(r.resultTitle)}</strong><small>${esc(r.testTitle)}</small>
        <span class="when">${esc(relativeDate(r.date))}</span></a>
        <button class="del" data-id="${esc(r.id)}" aria-label="Bu sonucu sil">✕</button></div>`).join("")}</div>`;
    app.querySelectorAll(".del").forEach((b) => {
      b.onclick = () => confirmBox("Bu sonuç silinsin mi?", "Karakter karnen de buna göre güncellenir.", "Sil", () => {
        store.set(KEY.results, getResults().filter((r) => r.id !== b.dataset.id));
        renderResults();
      });
    });
  }

  function renderSettings() {
    setTabs("settings");
    app.innerHTML = `<h1 class="large-title">Ayarlar</h1>
      <div class="section-h">Adın</div>
      <div class="group"><input class="input" id="name" maxlength="${MAX_NAME}" placeholder="Adın (isteğe bağlı)" autocapitalize="words" autocorrect="off" spellcheck="false" enterkeyhint="done"></div>
      <p class="section-f">Ana sayfada sana bu adla merhaba deriz. Boş bırakabilirsin.</p>
      <div class="section-h">Veriler</div>
      <div class="group"><div><button class="danger" id="wipe">Verilerimi Sil</button></div></div>
      <p class="section-f">Sonuçların, karakter karnen ve adın yalnızca bu cihazın tarayıcısında saklanır, hiçbir yere gönderilmez. Silme işlemi geri alınamaz.</p>
      <div class="section-h">Hakkında</div>
      <div class="group"><div class="kv"><span>Uygulama</span><span>Ben Kimim?</span></div>
        <div style="color:var(--secondary);font-size:.9375rem">${esc(DATA.funNote)}</div></div>
      <p class="version" id="version">${VERSION}</p>`;
    const input = document.getElementById("name");
    input.value = getName();
    input.oninput = () => store.set(KEY.name, input.value.slice(0, MAX_NAME));
    input.onkeydown = (e) => { if (e.key === "Enter") input.blur(); };
    document.getElementById("wipe").onclick = () =>
      confirmBox("Tüm verilerin silinsin mi?", "Kaydedilen tüm sonuçların, karakter karnen ve adın bu cihazdan silinecek.", "Sil", () => {
        store.clear();
        store.set(KEY.prompted, true);
        quiz = null;
        toast("Verilerin silindi");
        renderSettings();
      });
  }

  // ---------- Yönlendirme ----------
  function go(hash) { if (location.hash !== hash) location.hash = hash; else route(); }

  function route() {
    dialogRoot.innerHTML = "";
    if (!store.get(KEY.prompted, false)) return renderNamePrompt();
    const parts = (location.hash.replace(/^#\/?/, "") || "").split("/").map(decodeURIComponent);
    const [page, arg] = parts;
    if (page !== "t") quiz = null;
    switch (page) {
      case "k": renderCategory(arg); break;
      case "t": startQuiz(arg); break;
      case "karne": renderReport(); break;
      case "sonuclar": renderResults(); break;
      case "sonuc": renderSavedResult(arg); break;
      case "ayarlar": renderSettings(); break;
      default: renderHome();
    }
  }

  window.addEventListener("hashchange", () => { route(); window.scrollTo(0, 0); });

  fetch("data.json?v=0.1")
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => { DATA = d; route(); })
    .catch(() => { app.innerHTML = '<div class="empty"><div class="e">😕</div><h2>Testler yüklenemedi</h2><p>İnternet bağlantını kontrol edip sayfayı yenile.</p></div>'; });

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
