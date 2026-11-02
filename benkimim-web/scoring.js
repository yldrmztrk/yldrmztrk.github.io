// Puanlama ve Karakter Karnem — iOS'taki Services/Scoring.swift ve Services/CharacterReport.swift ile birebir aynı kurallar.
(function (root) {
  "use strict";

  // En yüksek toplam kazanır; eşitlikte son cevaplardan geriye bakılır, eşitlerden en son puan alan kazanır.
  function winningResultID(test, answers) {
    if (!test.results.length) return null;
    const chosen = [];
    test.questions.forEach((q, i) => {
      const a = answers[i];
      if (a != null && q.options[a]) chosen.push(q.options[a].scores);
    });
    const totals = {};
    test.results.forEach((r) => { totals[r.id] = 0; });
    for (const scores of chosen) {
      for (const id in scores) if (id in totals) totals[id] += scores[id];
    }
    const top = Math.max(...Object.values(totals));
    let tied = new Set(Object.keys(totals).filter((id) => totals[id] === top));
    if (tied.size > 1) {
      for (let i = chosen.length - 1; i >= 0; i--) {
        const hit = new Set(Object.keys(chosen[i]).filter((id) => tied.has(id)));
        if (hit.size) {
          tied = hit;
          if (tied.size === 1) break;
        }
      }
    }
    const winner = test.results.find((r) => tied.has(r.id));
    return winner ? winner.id : null;
  }

  // Seçilen cevapların karakter boyutlarına verdiği puanlar: { sosyal: {plus, minus}, ... }
  function traitScores(test, answers, traitKeys) {
    const totals = {};
    test.questions.forEach((q, i) => {
      const a = answers[i];
      if (a == null || !q.options[a]) return;
      const traits = q.options[a].traits || {};
      for (const key in traits) {
        if (!traitKeys.includes(key)) continue;
        const p = traits[key];
        totals[key] = totals[key] || { plus: 0, minus: 0 };
        if (p > 0) totals[key].plus += p; else totals[key].minus -= p;
      }
    });
    return totals;
  }

  // Kaydedilen sonuçlardan karne. results: [{testID, date (ms), traitScores}]
  function characterReport(results, R) {
    const T = R.threshold;
    const latest = {};
    for (const r of results) {
      if (!r.traitScores) continue;
      const ex = latest[r.testID];
      if (ex && ex.date >= r.date) continue;
      latest[r.testID] = r;
    }
    const totals = {};
    for (const r of Object.values(latest)) {
      for (const key in r.traitScores) {
        if (!R.traits.some((t) => t.key === key)) continue;
        totals[key] = totals[key] || { plus: 0, minus: 0 };
        totals[key].plus += r.traitScores[key].plus;
        totals[key].minus += r.traitScores[key].minus;
      }
    }
    const bucket = (p) => (p >= 0.5 ? 0 : p >= T ? 1 : p >= -T ? 2 : p >= -0.5 ? 3 : 4);
    const lines = R.traits.map((trait, index) => {
      const s = totals[trait.key] || { plus: 0, minus: 0 };
      const position = (s.plus - s.minus) / (s.plus + s.minus + 2);
      return { trait, index, position, comment: trait.comments[bucket(position)] };
    });
    const testCount = Object.keys(latest).length;
    const base = {
      testCount, lines,
      isUnlocked: testCount >= R.requiredTests,
      remainingTests: Math.max(0, R.requiredTests - testCount),
    };

    const ranked = lines.slice().sort((a, b) => Math.abs(b.position) - Math.abs(a.position)); // kararlı sıralama
    const first = ranked[0], second = ranked[1];
    if (Math.abs(first.position) < T) {
      return Object.assign(base, R.balanced, { summary: R.balancedSummary });
    }
    const pole = (l) => (l.position > 0 ? l.trait.plus : l.trait.minus);
    const key = (l) => l.trait.key + (l.position > 0 ? "+" : "-");
    const closing = R.closings[(first.index * 2 + (first.position > 0 ? 0 : 1) + second.index) % R.closings.length];
    let picked, summary;
    if (Math.abs(second.position) < T) {
      picked = R.single[key(first)];
      summary = `${pole(first).lead} Geri kalan her konuda ne az ne fazla, tam kıvamındasın. ${closing}`;
    } else {
      const [a, b] = first.index < second.index ? [first, second] : [second, first];
      picked = R.pair[key(a) + key(b)];
      summary = `${pole(first).lead} ${pole(second).twist} ${closing}`;
    }
    return Object.assign(base, picked || R.balanced, { summary });
  }

  const api = { winningResultID, traitScores, characterReport };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BKScoring = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
