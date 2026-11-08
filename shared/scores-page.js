"use strict";
(() => {
  const games = window.GmrCatalog.games;
  const params = new URLSearchParams(location.search);
  const requested = params.get("game");
  const selected = games.some((game) => game.id === requested) ? requested : null;
  const nav = document.getElementById("score-filters");

  for (const game of [{ id: null, title: "Tous" }, ...games]) {
    const link = document.createElement("a");
    link.className = "filter" + (game.id === selected ? " active" : "");
    const url = new URL("./scores.html", location.href);
    if (game.id) url.searchParams.set("game", game.id);
    const from = params.get("from");
    if (from) url.searchParams.set("from", from);
    link.href = url.href;
    link.textContent = game.title;
    if (game.id === selected) link.setAttribute("aria-current", "page");
    nav.append(link);
  }

  const origin = games.find((game) => game.id === params.get("from"));
  if (origin) {
    const back = document.getElementById("scores-back");
    back.href = "./games/" + encodeURIComponent(origin.id) + "/";
    back.setAttribute("aria-label", "Retour au jeu");
  }
  if (window.parent !== window) {
    const back = document.getElementById("scores-back");
    back.setAttribute("aria-label", "Retour au jeu");
    back.addEventListener("click", (event) => {
      event.preventDefault();
      window.parent.postMessage({ type: "gmr-scores-back" }, location.origin);
    });
  }
  // Games declare optional score presentation scripts in the catalog.
  // Load in order so a specialized adapter can register with GameScores
  // before the selected game (or the global history) is rendered.
  async function loadScoreScripts() {
    for (const game of games) {
      if (selected !== null && game.id !== selected) continue;
      for (const source of game.scoreScripts || []) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = new URL(source, location.href).href;
          script.onload = resolve;
          script.onerror = () => reject(new Error("Cannot load score adapter: " + source));
          document.head.append(script);
        });
      }
    }
  }

  const history = document.getElementById("score-history");
  loadScoreScripts().then(() => GameScores.render(history, selected)).catch((error) => {
    console.error("GMR scores:", error);
    GameScores.render(history, selected);
    const warning = document.createElement("p");
    warning.className = "error";
    warning.textContent = "Certains résultats spécifiques ne sont pas disponibles.";
    history.prepend(warning);
  });
})();
