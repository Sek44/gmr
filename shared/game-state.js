"use strict";
// Adapted from xfr1/game-state.js; namespaced for GMR and extended with autosave.
window.GameState = (() => {
  const PREFIX = "gmr:v1:state:";
  const VERSION = 1;

  function create(gameId) {
    if (typeof gameId !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(gameId)) {
      throw new Error("Invalid game identifier");
    }
    const key = PREFIX + gameId;

    function load() {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) return null;
        const data = JSON.parse(raw);
        return data && data.version === VERSION && data.session != null
          ? data.session
          : null;
      } catch {
        return null;
      }
    }

    function save(session) {
      try {
        localStorage.setItem(key, JSON.stringify({ version: VERSION, session }));
        return true;
      } catch {
        return false;
      }
    }

    function clear() {
      try {
        localStorage.removeItem(key);
        return true;
      } catch {
        return false;
      }
    }

    // Games call changed() after each meaningful state mutation.
    // Navigation, refresh and tab hiding also save the current snapshot.
    function bind({ snapshot, restore } = {}) {
      if (typeof snapshot !== "function") {
        throw new TypeError("snapshot must be a function");
      }
      const saved = load();
      if (saved !== null && typeof restore === "function") {
        try { restore(saved); } catch { /* Ignore incompatible old saves. */ }
      }
      let active = true;
      function flush() {
        if (!active) return false;
        try { return save(snapshot()); } catch { return false; }
      }
      function onHidden() {
        if (document.hidden) flush();
      }
      window.addEventListener("pagehide", flush);
      document.addEventListener("visibilitychange", onHidden);
      return {
        changed: flush,
        saveNow: flush,
        stop({ discard = false } = {}) {
          active = false;
          window.removeEventListener("pagehide", flush);
          document.removeEventListener("visibilitychange", onHidden);
          if (discard) clear();
        },
      };
    }

    return { key, load, save, clear, bind };
  }

  return { create };
})();
