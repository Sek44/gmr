"use strict";

// Game navigation and fullscreen. Shared pages host the game fullscreen in an
// iframe; standalone URLs request fullscreen on the first in-game gesture.
const GcvNavigation = (() => {
  function create({ window, document, location, stage, homePanel, resumeButton,
    resumeCard, resumeDetails, describeSession = () => "",
    menuButton, menuHomeButton, scoresButton, menuScoresButton,
    clearControls, flow, onResume,
    changed, announce }) {
    const listeners = [];
    let enteringFullscreen = false;
    let leaving = false;
    function listen(target, type, handler) {
      target.addEventListener(type, handler);
      listeners.push([target, type, handler]);
    }
    function gameHost() {
      try {
        return window.parent !== window ? window.parent.GmrGameHost : null;
      } catch {
        return null; // Standalone game embedded on another origin.
      }
    }
    function isFullscreen() {
      return document.fullscreenElement === stage || Boolean(gameHost()?.fullscreen);
    }
    function sync() {
      homePanel.hidden = !flow.menuOpen;
      stage.classList.toggle("gcv-in-menu", flow.menuOpen);
      if (resumeCard) resumeCard.hidden = !flow.hasSession;
      resumeButton.hidden = !flow.hasSession;
      resumeButton.textContent = flow.activity === "finished"
        ? "Voir les résultats"
        : flow.mode === "race" ? "Reprendre la course" : "Reprendre les essais";
      if (resumeDetails && flow.hasSession) resumeDetails.textContent = describeSession();
    }
    function ensureFullscreen() {
      if (isFullscreen() || enteringFullscreen) return;
      if (!stage.requestFullscreen) {
        announce("Plein écran non disponible dans ce navigateur.");
        return;
      }
      enteringFullscreen = true;
      // Request before any await: this must run in the original user gesture.
      try {
        Promise.resolve(stage.requestFullscreen({ navigationUI: "hide" }))
          .catch((error) => {
            console.warn("Fullscreen failed:", error);
            announce("Le plein écran a été refusé par le navigateur.");
          })
          .finally(() => { enteringFullscreen = false; });
      } catch (error) {
        enteringFullscreen = false;
        console.warn("Fullscreen failed:", error);
        announce("Le plein écran a été refusé par le navigateur.");
      }
    }
    function resume() {
      ensureFullscreen();
      flow.resume();
      sync();
      onResume();
      changed();
    }
    function openMenu() {
      clearControls();
      flow.openMenu();
      sync();
      if (flow.hasSession) changed();
    }
    function navigateOutside(page) {
      if (leaving) return;
      leaving = true;
      clearControls();
      if (flow.hasSession) changed(); // Save before unloading an iframe.
      const host = gameHost();
      if (host?.navigate) {
        host.navigate(page);
        return;
      }
      const target = new URL(page === "scores"
        ? "../../scores.html?game=gcv&from=gcv" : "../../", location.href);
      const openPage = () => window.location.assign(target.href);
      if (document.fullscreenElement && document.exitFullscreen) {
        Promise.resolve(document.exitFullscreen()).then(openPage, openPage);
      } else {
        openPage();
      }
    }
    const openScores = () => navigateOutside("scores");
    const goHome = () => navigateOutside("home");

    // Direct links cannot fullscreen on page load. Use the first eligible
    // click in the stage (including selecting a vehicle or circuit) instead.
    listen(stage, "click", (event) => {
      if (event.target.closest?.("#menu-home-button, #scores-button, #menu-scores-button")) return;
      ensureFullscreen();
    });
    listen(resumeButton, "click", resume);
    listen(menuButton, "click", openMenu);
    listen(menuHomeButton, "click", goHome);
    listen(scoresButton, "click", openScores);
    listen(menuScoresButton, "click", openScores);

    return {
      sync, resume, openMenu, openScores,
      dispose() {
        for (const [target, type, handler] of listeners)
          target.removeEventListener(type, handler);
      },
      get paused() { return flow.paused; },
      get menuOpen() { return flow.menuOpen; },
      get scoresOpen() { return flow.scoresOpen; },
    };
  }
  return { create };
})();

if (typeof window !== "undefined") window.GcvNavigation = GcvNavigation;
if (typeof module !== "undefined" && module.exports) module.exports = GcvNavigation;
