"use strict";
// Based on xfr1/score-view.js: see scores in an iframe without losing the game.
window.ScoreView = (() => {
  function bind({ suspend = () => {}, resume = () => {} } = {}) {
    let frame = null;
    let animations = [];

    function hide() {
      if (!frame) return;
      frame.remove();
      frame = null;
      for (const animation of animations) animation.play();
      animations = [];
      resume();
    }

    function show(url) {
      if (frame) {
        frame.src = url;
        return;
      }
      suspend();
      animations = document.getAnimations
        ? document.getAnimations().filter((a) => a.playState === "running")
        : [];
      for (const animation of animations) animation.pause();
      frame = document.createElement("iframe");
      frame.title = "Mes scores";
      frame.className = "scores-view";
      frame.src = url;
      document.body.append(frame);
      frame.focus();
    }

    document.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey ||
          event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || !url.pathname.endsWith("/scores.html")) return;
      event.preventDefault();
      history.pushState({ ...(history.state || {}), gmrScores: url.href }, "", url.href);
      show(url.href);
    });

    window.addEventListener("popstate", () => {
      if (history.state && history.state.gmrScores) show(history.state.gmrScores);
      else hide();
    });
    window.addEventListener("message", (event) => {
      if (frame && event.origin === location.origin &&
          event.source === frame.contentWindow &&
          event.data && event.data.type === "gmr-scores-back") {
        if (history.state && history.state.gmrScores) history.back();
        else hide();
      }
    });
    return { get open() { return frame !== null; } };
  }
  return { bind };
})();
