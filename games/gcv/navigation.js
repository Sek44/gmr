"use strict";

// Screen navigation, score iframe and fullscreen controls.
const GcvNavigation = (() => {
  function create({ window, document, location, stage, homePanel, resumeButton,
    menuButton, scoresButton, menuScoresButton, scoresFrame, fullscreenButton,
    menuFullscreenButton, clearControls, getMode, hasSession, activateSession,
    onResume, changed, announce }) {
    let menuOpen = true;
    let scoresOpen = false;

    function sync() {
      homePanel.hidden = !menuOpen;
      stage.classList.toggle("gcv-in-menu", menuOpen);
      resumeButton.hidden = !hasSession();
      resumeButton.textContent = getMode() === "race"
        ? "Reprendre la course" : "Reprendre les essais libres";
      scoresFrame.hidden = !scoresOpen;
      stage.classList.toggle("gcv-scores-open", scoresOpen);
    }

    function resume() {
      menuOpen = false;
      activateSession();
      sync();
      onResume();
      changed();
    }

    function openMenu() {
      clearControls();
      menuOpen = true;
      sync();
      if (hasSession()) changed();
    }

    function openScores() {
      clearControls();
      scoresOpen = true;
      sync();
      scoresFrame.src = "../../scores.html?game=gcv&from=gcv";
      if (hasSession()) changed();
    }

    function closeScores() {
      scoresOpen = false;
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

    resumeButton.addEventListener("click", resume);
    menuButton.addEventListener("click", openMenu);
    scoresButton.addEventListener("click", openScores);
    menuScoresButton.addEventListener("click", openScores);
    window.addEventListener("message", (event) => {
      if (scoresOpen && event.origin === location.origin &&
          event.source === scoresFrame.contentWindow &&
          event.data?.type === "gmr-scores-back") closeScores();
    });
    fullscreenButton.addEventListener("click", toggleFullscreen);
    menuFullscreenButton.addEventListener("click", toggleFullscreen);
    document.addEventListener("fullscreenchange", refreshFullscreen);
    refreshFullscreen();

    return {
      sync, resume, openMenu, openScores, closeScores,
      get paused() { return menuOpen || scoresOpen; },
      get menuOpen() { return menuOpen; },
      get scoresOpen() { return scoresOpen; },
    };
  }
  return { create };
})();

if (typeof window !== "undefined") window.GcvNavigation = GcvNavigation;
if (typeof module !== "undefined" && module.exports) module.exports = GcvNavigation;
