"use strict";

// Menu choices survive circuit rebuilds and are separate from resumable races.
const GcvPreferences = (() => {
  const KEY = "gmr:v1:gcv:preferences";
  const DEFAULTS = Object.freeze({
    track: "classic", vehicle: "classic", mode: "free", camera: "outside",
  });
  const VALID = Object.freeze({
    track: ["classic", "rainbow"],
    vehicle: ["classic", "moto", "kart", "buggy", "comet"],
    mode: ["free", "race"],
    camera: ["outside", "inside"],
  });

  function normalize(values) {
    const next = {};
    for (const key of Object.keys(DEFAULTS)) {
      next[key] = VALID[key].includes(values?.[key])
        ? values[key] : DEFAULTS[key];
    }
    return next;
  }

  function create(storage) {
    function getStorage() {
      try {
        return storage === undefined
          ? (typeof window !== "undefined" ? window.localStorage : null)
          : storage;
      } catch {
        return null;
      }
    }

    let current = { ...DEFAULTS };
    try {
      const raw = getStorage()?.getItem(KEY);
      if (raw) current = normalize(JSON.parse(raw));
    } catch {
      // Corrupted or forbidden local storage must never block game startup.
    }

    return {
      get() { return { ...current }; },
      set(patch) {
        current = normalize({ ...current, ...patch });
        try { getStorage()?.setItem(KEY, JSON.stringify(current)); } catch {
          // Keep the choice available in memory for this visit.
        }
        return { ...current };
      },
    };
  }

  return Object.freeze({ KEY, DEFAULTS, normalize, create });
})();

if (typeof window !== "undefined") window.GcvPreferences = GcvPreferences;
if (typeof module !== "undefined" && module.exports) module.exports = GcvPreferences;
