"use strict";

// Screen navigation, score iframe and fullscreen controls.
const GcvNavigation = (() => {
  function create({ window, document, location, stage, homePanel, resumeButton,
    menuButton, scoresButton, menuScoresButton, scoresFrame, fullscreenButton,
    menuFullscreenButton, clearControls, flow, onResume, changed, announce }) {
    const listeners = [];
    function listen(target, type, handler) {
      target.addEventListener(type, handler);
      listeners.push([target, type, handler]);
    }
    function sync() {
      homePanel.hidden = !flow.menuOpen;
      stage.classList.toggle("gcv-in-menu", flow.menuOpen);
      resumeButton.hidden = !flow.hasSession;
      resumeButton.textContent = flow.mode === "race"
        ? "Reprendre la course" : "Reprendre les essais libres";
      scoresFrame.hidden = !flow.scoresOpen;
      stage.classList.toggle("gcv-scores-open", flow.scoresOpen);
    }

    function resume() {
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

    function openScores() {
      clearControls();
      if (!flow.openScores()) return;
      sync();
      scoresFrame.src = "../../scores.html?game=gcv&from=gcv";
      if (flow.hasSession) changed();
    }

    function closeScores() {
      if (!flow.closeScores()) return;
      scoresFrame.hidden = true;
      scoresFrame.removeAttribute("src");
      sync();
      onResume(); // Do not count time spent in the score iframe.
    }

    function refreshFullscreen() {
      const full = document.fullscreenElement === stage;
      for (const button of [fullscreenButton, menuFullscreenButton]) {
        button.querySelector(".gcv-action-label").textContent =
          full ? "Écran normal" : "Plein écran";
        button.classList.toggle("is-fullscreen", full);
        button.setAttribute("aria-label",
          full ? "Quitter le plein écran" : "Passer en plein écran");
        button.title = full ? "Quitter le plein écran" : "Passer en plein écran";
      }
    }

    async function toggleFullscreen() {
      try {
        if (document.fullscreenElement === stage) {
          await document.exitFullscreen();
        } else if (stage.requestFullscreen) {
          await stage.requestFullscreen();
        } else {
          menuFullscreenButton.querySelector(".gcv-action-label").textContent =
            "Plein écran non disponible";
          announce("Plein écran non disponible dans ce navigateur.");
        }
      } catch (error) {
        console.warn("Fullscreen failed:", error);
        menuFullscreenButton.querySelector(".gcv-action-label").textContent =
          "Plein écran refusé";
        announce("Le plein écran a été refusé par le navigateur.");
      }
    }

    listen(resumeButton, "click", resume);
    listen(menuButton, "click", openMenu);
    listen(scoresButton, "click", openScores);
    listen(menuScoresButton, "click", openScores);
    listen(window, "message", (event) => {
      if (flow.scoresOpen && event.origin === location.origin &&
          event.source === scoresFrame.contentWindow &&
          event.data?.type === "gmr-scores-back") closeScores();
    });
    listen(fullscreenButton, "click", toggleFullscreen);
    listen(menuFullscreenButton, "click", toggleFullscreen);
    listen(document, "fullscreenchange", refreshFullscreen);
    refreshFullscreen();

    return {
      sync, resume, openMenu, openScores, closeScores,
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
