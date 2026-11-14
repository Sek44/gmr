"use strict";
// Shared fullscreen launcher: the user gesture belongs to the link click in
// the host document. Navigation would cancel fullscreen, so games run in a
// same-origin iframe while the host itself remains fullscreen.
(() => {
  const root = new URL("../", document.currentScript.src);
  // A new host document (including a refresh of GMR home) gets a new
  // cache key. Pass it to the iframe so both its HTML and assets are fresh.
  const refreshKey = String(Date.now());
  function freshGameUrl(destination) {
    const url = new URL(destination);
    url.searchParams.set("gmr-refresh", refreshKey);
    return url.href;
  }
  const host = document.createElement("div");
  host.className = "gmr-game-host";
  host.hidden = true;
  const frame = document.createElement("iframe");
  frame.title = "Jeu";
  frame.setAttribute("allow", "fullscreen");
  frame.setAttribute("allowfullscreen", "");
  host.append(frame);
  document.body.append(host);

  let navigating = false;
  let gameId = null;

  function navigate(page) {
    if (host.hidden || navigating) return;
    navigating = true;
    const target = page === "scores" ? new URL("scores.html", root) : new URL("./", root);
    if (page === "scores" && gameId) {
      target.searchParams.set("game", gameId);
      target.searchParams.set("from", gameId);
      target.searchParams.set("gmr-refresh", refreshKey);
    }
    const openPage = () => window.location.assign(target.href);
    if (document.fullscreenElement && document.exitFullscreen) {
      Promise.resolve(document.exitFullscreen()).then(openPage, openPage);
    } else {
      openPage();
    }
  }

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 ||
        event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const link = event.target.closest?.("a[href]");
    if (!link || link.hasAttribute("download") ||
        (link.target && link.target !== "_self")) return;
    const destination = new URL(link.href);
    const game = window.GmrCatalog?.games.find((item) => {
      const gameUrl = new URL("games/" + encodeURIComponent(item.id) + "/", root);
      return item.fullscreen && destination.origin === gameUrl.origin &&
        (destination.pathname === gameUrl.pathname ||
         destination.pathname === gameUrl.pathname + "index.html");
    });
    if (!game) return;

    event.preventDefault();
    const gameUrl = freshGameUrl(destination.href);
    if (!host.requestFullscreen) {
      window.location.assign(gameUrl);
      return;
    }

    gameId = game.id;
    navigating = false;
    host.hidden = false;
    frame.title = game.title;
    // requestFullscreen must be called synchronously inside the click event;
    // never await iframe loading or a new document before requesting it.
    let request;
    try {
      request = host.requestFullscreen({ navigationUI: "hide" });
    } catch (error) {
      console.warn("Fullscreen unavailable:", error);
      window.location.assign(gameUrl);
      return;
    }
    frame.src = gameUrl;
    Promise.resolve(request).catch((error) => {
      console.warn("Fullscreen unavailable:", error);
      if (!navigating) window.location.assign(gameUrl);
    });
  });

  document.addEventListener("fullscreenchange", () => {
    // A browser/user initiated exit leaves the game and returns to the
    // launching page. Explicit navigation uses navigate() instead.
    if (host.hidden || navigating || document.fullscreenElement === host) return;
    frame.removeAttribute("src");
    host.hidden = true;
    window.location.reload();
  });

  window.GmrGameHost = Object.freeze({
    navigate,
    get fullscreen() { return document.fullscreenElement === host; },
  });
})();
