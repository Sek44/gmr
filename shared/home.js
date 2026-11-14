"use strict";
(() => {
  window.GmrPlayTime.mountSummary(document.getElementById("gmr-daily-summary"));
  const grid = document.getElementById("game-grid");
  const empty = document.getElementById("empty-games");
  const games = window.GmrCatalog.games;
  empty.hidden = games.length !== 0;

  const assetRoot = "./shared/themes/classic-play/assets/";
  for (const game of games) {
    const link = document.createElement("a");
    link.className = "game-card";
    link.href = "./games/" + encodeURIComponent(game.id) + "/";
    link.setAttribute("aria-label", "Jouer à " + game.title);

    const artwork = document.createElement("span");
    artwork.className = "game-artwork";
    const picture = document.createElement("img");
    picture.className = "game-picture";
    picture.src = game.artwork || assetRoot + "gamepad.svg";
    picture.alt = "";
    picture.loading = "lazy";
    artwork.append(picture);

    const content = document.createElement("span");
    content.className = "game-content";
    const category = document.createElement("span");
    category.className = "game-category";
    category.textContent = game.category || "Jeu";
    const title = document.createElement("h3");
    title.textContent = game.title;
    const action = document.createElement("span");
    action.className = "game-action";
    const saved = window.GameState.create(game.id).load();
    const canResume = saved && (game.saveRevision === undefined ||
      saved.saveRevision === game.saveRevision);
    const actionText = document.createElement("span");
    actionText.textContent = canResume ? "Reprendre" : "Jouer";
    const arrow = document.createElement("img");
    arrow.src = assetRoot + "arrow-right.svg";
    arrow.alt = "";
    arrow.width = 20;
    arrow.height = 20;
    action.append(actionText, arrow);
    content.append(category, title, action);
    link.append(artwork, content);
    grid.append(link);
  }
})();
