"use strict";
// GCV owns its lap-record score view; shared/scores.js does not know its format.
(() => {
  function node(tag, className, content) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined) element.textContent = content;
    return element;
  }

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

  window.GameScores.registerRenderer("gcv", renderGcvLaps);
})();
