"use strict";
(() => {
  const grid = document.getElementById("game-grid");
  const empty = document.getElementById("empty-games");
  const games = window.GmrCatalog.games;
  empty.hidden = games.length !== 0;

  for (const game of games) {
    const link = document.createElement("a");
    link.className = "game-card";
    link.href = "./games/" + encodeURIComponent(game.id) + "/";
    const icon = document.createElement("span");
    icon.className = "game-symbol";
    icon.textContent = game.icon || "★";
    icon.setAttribute("aria-hidden", "true");
    const title = document.createElement("h3");
    title.textContent = game.title;
    const description = document.createElement("p");
    description.textContent = game.description || "";
    const action = document.createElement("span");
    action.className = "game-action";
    action.textContent = GameState.create(game.id).load() ? "Reprendre →" : "Jouer →";
    link.append(icon, title, description, action);
    grid.append(link);
  }
})();
