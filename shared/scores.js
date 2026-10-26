"use strict";
// Based on xfr1/scores.js; generic per-game scores, stored independently of xfr1.
window.GameScores = (() => {
  const KEY = "gmr:v1:scores";
  const origins = new WeakMap();
  const messages = {
    perfect: ["Fantastique, un sans-faute !", "Bravo, tu as tout réussi !"],
    high: ["Excellent travail !", "Super résultat, continue !"],
    middle: ["Bien joué, tu progresses !", "Continue, tu es sur la bonne voie !"],
    low: ["Chaque essai te fait progresser !", "Courage, tu vas y arriver !"],
  };

  function raw() {
    const value = localStorage.getItem(KEY);
    if (value === null) return [];
    const data = JSON.parse(value);
    if (!Array.isArray(data)) throw new Error("Invalid score history");
    return data;
  }

  function read() {
    try {
      const records = raw();
      const snapshot = JSON.stringify(records);
      return records.filter((record, index) => {
        if (!record || typeof record !== "object" || Array.isArray(record)) return false;
        origins.set(record, { index, snapshot });
        return true;
      });
    } catch {
      return [];
    }
  }

  function save({ gameId, score, total = null, ...details }) {
    if (typeof gameId !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(gameId) ||
        !Number.isFinite(score) || score < 0 ||
        (total !== null && (!Number.isFinite(total) || total <= 0))) return false;
    try {
      const previous = raw(); // Never overwrite malformed existing history.
      const now = new Date();
      const record = {
        ...details, gameId, score, total,
        date: now.toISOString(),
        time: now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", hour12: false }),
      };
      localStorage.setItem(KEY, JSON.stringify([record, ...previous]));
      return true;
    } catch {
      return false;
    }
  }

  function remove(record) {
    try {
      const origin = origins.get(record);
      const records = raw();
      if (!origin || JSON.stringify(records) !== origin.snapshot) return false;
      records.splice(origin.index, 1);
      localStorage.setItem(KEY, JSON.stringify(records));
      return true;
    } catch {
      return false;
    }
  }

  function label(record) {
    const games = window.GmrCatalog ? window.GmrCatalog.games : [];
    const game = games.find((item) => item.id === record.gameId);
    return game ? game.title : String(record.gameId || "Jeu");
  }

  function time(record) {
    if (typeof record.time === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(record.time)) return record.time;
    if (typeof record.date === "string") {
      const date = new Date(record.date);
      if (!Number.isNaN(date.getTime())) return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", hour12: false });
    }
    return "00:00";
  }

  function encourage(score, total) {
    const ratio = total > 0 ? score / total : 0;
    const group = ratio === 1 ? "perfect" : ratio >= 0.8 ? "high" : ratio >= 0.5 ? "middle" : "low";
    const items = messages[group];
    return items[Math.floor(Math.random() * items.length)];
  }

  function node(tag, className, content) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined) element.textContent = content;
    return element;
  }

  function chart(container, records) {
    const section = node("section", "score-chart");
    section.append(node("h3", "", "Évolution des scores"));
    const chronological = records.slice().reverse();
    const points = chronological.map((record, index) => ({ index, score: Number(record.score), record }))
      .filter((point) => point.record.score !== null && point.record.score !== "" &&
          Number.isFinite(point.score) && point.score >= 0);
    if (!points.length) {
      section.append(node("p", "muted", "Pas encore de score à afficher."));
      container.append(section);
      return;
    }
    const ns = "http://www.w3.org/2000/svg";
    function svgNode(name, attributes, content) {
      const item = document.createElementNS(ns, name);
      for (const [key, value] of Object.entries(attributes)) item.setAttribute(key, String(value));
      if (content !== undefined) item.textContent = String(content);
      return item;
    }
    const width = 600, height = 250, left = 55, right = 20, top = 20, bottom = 42;
    const maxScore = Math.max(10, ...points.map((point) => point.score));
    const step = Math.max(1, Math.ceil(maxScore / 5));
    const ceiling = step * 5;
    const x = (i) => chronological.length === 1 ? (left + width - right) / 2 :
      left + (i / (chronological.length - 1)) * (width - left - right);
    const y = (value) => height - bottom - value / ceiling * (height - top - bottom);
    const svg = svgNode("svg", {
      viewBox: "0 0 600 250", role: "img",
      "aria-label": "Évolution des scores, du plus ancien au plus récent",
    });
    for (let tick = 0; tick <= 5; tick++) {
      const value = tick * step;
      svg.append(
        svgNode("line", { x1: left, x2: width - right, y1: y(value), y2: y(value), class: "score-grid" }),
        svgNode("text", { x: left - 10, y: y(value) + 4, "text-anchor": "end" }, value)
      );
    }
    const byIndex = new Map(points.map((point) => [point.index, point]));
    let segment = [];
    function drawSegment() {
      if (segment.length > 1) svg.append(svgNode("polyline", { points: segment.join(" "), class: "score-line" }));
      segment = [];
    }
    for (let index = 0; index < chronological.length; index++) {
      const point = byIndex.get(index);
      if (!point) { drawSegment(); continue; }
      segment.push(x(index) + "," + y(point.score));
    }
    drawSegment();
    for (const point of points) {
      const dot = svgNode("circle", { cx: x(point.index), cy: y(point.score), r: 4, class: "score-dot" });
      dot.append(svgNode("title", {}, "Partie " + (point.index + 1) + " : " + point.score + " points"));
      svg.append(dot);
    }
    for (const index of new Set([0, Math.floor((chronological.length - 1) / 2), chronological.length - 1])) {
      svg.append(svgNode("text", { x: x(index), y: height - 14, "text-anchor": "middle" }, index + 1));
    }
    section.append(svg);
    container.append(section);
  }

  function enableDeletion(row, record, rerender) {
    let timer = null, x = 0, y = 0;
    function cancel() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      row.classList.remove("holding");
    }
    async function ask() {
      const yes = await AppConfirm.ask({
        title: "Supprimer ce score ?",
        message: label(record) + " · " + record.score + " point(s) · " + time(record),
        confirmText: "Supprimer",
        cancelText: "Conserver",
      });
      if (!yes) return;
      const removed = remove(record);
      rerender();
      if (!removed) {
        const warning = node("p", "error", "Ce score a changé entre-temps. Réessaie.");
        document.getElementById("score-history").append(warning);
      }
    }
    row.tabIndex = 0;
    row.setAttribute("aria-label", label(record) + " : appui long ou touche Suppr pour supprimer");
    row.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.isPrimary === false) return;
      cancel();
      x = event.clientX; y = event.clientY;
      row.classList.add("holding");
      timer = setTimeout(() => { cancel(); ask(); }, 600);
    });
    row.addEventListener("pointermove", (event) => {
      if (Math.hypot(event.clientX - x, event.clientY - y) > 10) cancel();
    });
    for (const name of ["pointerup", "pointercancel", "pointerleave"]) row.addEventListener(name, cancel);
    row.addEventListener("contextmenu", (event) => event.preventDefault());
    row.addEventListener("keydown", (event) => {
      if (event.key === "Delete" || event.key === "Enter") { event.preventDefault(); ask(); }
    });
  }

  // Racing lap records use elapsed milliseconds instead of educational scores.
  // Keep them in their own versioned store so faster times rank first and
  // editing the circuit clears only GCV timing results, not other games.
  function renderGcvLaps(container) {
    if (!window.GcvLapTimes || !window.GcvTrackLayout) return;
    const records = window.GcvLapTimes.createStore(window.GcvTrackLayout).top();
    const section = node("section", "gcv-lap-results");
    section.append(node("h3", "", "Grande Course Voiture · 3 meilleurs tours"));
    if (!records.length) {
      section.append(node("p", "muted", "Aucun tour chronométré sur ce circuit."));
      container.append(section);
      return;
    }
    const scroll = node("div", "table-scroll");
    const table = node("table", "history-table");
    const head = node("thead");
    const columns = node("tr");
    for (const heading of ["Rang", "Temps", "Date", "S1", "S2", "S3"]) {
      columns.append(node("th", "", heading));
    }
    head.append(columns);
    table.append(head);
    const body = node("tbody");
    for (const [index, record] of records.entries()) {
      const row = node("tr");
      const date = new Date(record.date);
      const dateLabel = Number.isNaN(date.getTime())
        ? "—" : date.toLocaleDateString("fr-FR");
      for (const cell of [
        index + 1,
        window.GcvLapTimes.format(record.ms),
        dateLabel,
        ...record.splits.map(window.GcvLapTimes.format),
      ]) row.append(node("td", "", String(cell)));
      body.append(row);
    }
    table.append(body);
    scroll.append(table);
    section.append(scroll);
    container.append(section);
  }

  function render(container, gameId = null) {
    container.replaceChildren();
    const records = read().filter((record) => gameId === null || record.gameId === gameId);
    container.append(node("h2", "", gameId ? "Résultats · " + label({ gameId }) : "Tous mes résultats"));
    if (gameId === "gcv") {
      renderGcvLaps(container);
      return;
    }
    if (!records.length) {
      if (gameId === null) renderGcvLaps(container);
      else {
        container.append(node("p", "muted", "Aucune partie terminée pour le moment."));
        chart(container, records);
      }
      return;
    }
    container.append(node("p", "muted", records.length + " partie(s) enregistrée(s)"));
    container.append(node("p", "muted small", "Appui long sur une ligne pour supprimer un score."));
    const scroll = node("div", "table-scroll");
    const table = node("table", "history-table");
    const head = node("thead");
    const headerRow = node("tr");
    for (const text of ["Date", "Heure", "Jeu", "Score"]) headerRow.append(node("th", "", text));
    head.append(headerRow);
    table.append(head);
    const body = node("tbody");
    for (const record of records) {
      const row = node("tr");
      const date = new Date(record.date);
      const dateLabel = Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("fr-FR");
      const scoreLabel = record.score == null ? "—" :
        Number.isFinite(record.total) && record.total > 0
          ? record.score + " / " + record.total : record.score + " points";
      for (const text of [dateLabel, time(record), label(record), scoreLabel]) row.append(node("td", "", text));
      enableDeletion(row, record, () => render(container, gameId));
      body.append(row);
    }
    table.append(body);
    scroll.append(table);
    container.append(scroll);
    if (gameId) chart(container, records);
    if (gameId === null) renderGcvLaps(container);
  }

  return { key: KEY, read, save, remove, render, encourage, time };
})();
