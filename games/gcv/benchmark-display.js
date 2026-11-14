"use strict";

// Fullscreen support is intentionally optional: some mobile browsers reject it.
// Never silently label a windowed measurement as fullscreen.
(function (root) {
  async function enter(document) {
    const element = document?.documentElement;
    if (!element || typeof element.requestFullscreen !== "function") {
      return { ok: false, reason: "unsupported" };
    }
    try {
      // Call requestFullscreen directly in the user gesture, before any async
      // loading or timers. Do not force screen orientation.
      await element.requestFullscreen();
    } catch {
      return { ok: false, reason: "denied" };
    }
    return document.fullscreenElement === element
      ? { ok: true, reason: null }
      : { ok: false, reason: "not-active" };
  }

  function isActive(document) {
    return Boolean(document?.fullscreenElement);
  }

  function snapshot(document, window, stage) {
    const fullscreen = isActive(document);
    const orientation = window?.screen?.orientation?.type ??
      ((stage.clientWidth >= stage.clientHeight) ? "landscape" : "portrait");
    return {
      mode: fullscreen ? "fullscreen" : "windowed",
      fullscreen,
      orientation,
      viewport: { width: stage.clientWidth, height: stage.clientHeight },
      devicePixelRatio: window.devicePixelRatio || 1,
    };
  }

  const api = Object.freeze({ enter, isActive, snapshot });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.GcvBenchmarkDisplay = api;
})(typeof window !== "undefined" ? window : null);
