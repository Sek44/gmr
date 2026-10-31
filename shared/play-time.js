"use strict";
// GMR consumes, but never modifies, the daily exercise credit owned by xfr1.
const GmrPlayTime = (() => {
  const CREDIT_KEY = "entrainement_daily_exercises_v1";
  const USAGE_KEY = "gmr:v1:daily-play-time";
  const VERSION = 1;
  function localDay(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")].join("-");
  }
  function createStore(storage, now = () => new Date()) {
    const failure = (date) => ({
      date, points: 0, minutes: 0, elapsedMs: 0, remainingMs: 0,
      allowed: false, error: true,
    });
    function read() {
      const date = localDay(now());
      try {
        // An absent or expired credit grants no minutes.
        const rawCredit = storage.getItem(CREDIT_KEY);
        let points = 0, minutes = 0;
        if (rawCredit !== null) {
          const credit = JSON.parse(rawCredit);
          if (!credit || credit.version !== 1 ||
              !/^\d{4}-\d{2}-\d{2}$/.test(credit.date) ||
              !Number.isSafeInteger(credit.points) || credit.points < 0 ||
              !Number.isSafeInteger(credit.minutes) || credit.minutes < 0 ||
              credit.minutes > Math.floor(Number.MAX_SAFE_INTEGER / 60000))
            return failure(date);
          if (credit.date === date) {
            points = credit.points;
            minutes = credit.minutes;
          }
        }
        const rawUsage = storage.getItem(USAGE_KEY);
        let elapsedMs = 0, oldDate = false;
        if (rawUsage !== null) {
          const usage = JSON.parse(rawUsage);
          if (!usage || usage.version !== VERSION ||
              !/^\d{4}-\d{2}-\d{2}$/.test(usage.date) ||
              !Number.isSafeInteger(usage.elapsedMs) || usage.elapsedMs < 0)
            return failure(date);
          if (usage.date === date) elapsedMs = usage.elapsedMs;
          else oldDate = true;
        }
        if (rawUsage === null || oldDate) {
          // Reset GMR's counter on the local date boundary.
          storage.setItem(USAGE_KEY, JSON.stringify({ version: VERSION, date, elapsedMs: 0 }));
        }
        const remainingMs = Math.max(0, minutes * 60000 - elapsedMs);
        return { date, points, minutes, elapsedMs, remainingMs,
          allowed: remainingMs > 0, error: false };
      } catch {
        // Corrupt/unsupported records are preserved; fail closed.
        return failure(date);
      }
    }
    function spend(durationMs) {
      const state = read();
      if (state.error || !Number.isFinite(durationMs) || durationMs <= 0 ||
          state.remainingMs <= 0) return state;
      const increment = Math.min(Math.floor(durationMs), state.remainingMs);
      if (increment <= 0) return state;
      try {
        storage.setItem(USAGE_KEY, JSON.stringify({
          version: VERSION, date: state.date, elapsedMs: state.elapsedMs + increment,
        }));
        return read();
      } catch { return failure(state.date); }
    }
    return { read, spend };
  }
  function format(ms, ceil = false) {
    const seconds = (ceil ? Math.ceil : Math.floor)(ms / 1000);
    return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
  }
  function mountSummary(element) {
    if (!element) return;
    const store = createStore(localStorage);
    function refresh() {
      const state = store.read();
      element.textContent = state.error
        ? "Compteur de jeu indisponible (stockage local inaccessible ou incompatible)."
        : state.points + " exercice" + (state.points === 1 ? "" : "s") +
          " · " + state.minutes + " min autorisées" +
          " · " + format(state.elapsedMs) + " utilisées" +
          " · " + format(state.remainingMs, true) + " restantes";
    }
    window.addEventListener("storage", (event) => {
      if (event.key === CREDIT_KEY || event.key === USAGE_KEY || event.key === null) refresh();
    });
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.setInterval(refresh, 1000);
    refresh();
  }
  // host is a positioned game element, including a fullscreen stage.
  // isPlaying must exclude menus, scores, paused games and finished sessions.
  function mountGame({ host, isPlaying, onBlocked = () => {} }) {
    const store = createStore(localStorage);
    const status = document.createElement("div");
    status.className = "gmr-play-status";
    status.setAttribute("role", "status");
    const lock = document.createElement("div");
    lock.className = "gmr-play-lock";
    lock.hidden = true;
    lock.setAttribute("role", "dialog");
    lock.setAttribute("aria-label", "Temps de jeu terminé");
    const panel = document.createElement("div");
    panel.className = "gmr-play-lock-panel";
    const title = document.createElement("h2");
    title.textContent = "Temps de jeu terminé";
    const message = document.createElement("p");
    const link = document.createElement("a");
    link.href = "/xfr1/";
    link.textContent = "Faire des exercices";
    link.className = "button button-primary";
    panel.append(title, message, link);
    lock.append(panel);
    host.append(status, lock);

    let last = performance.now();
    let day = localDay(new Date());
    let active = false;
    let notified = false;
    function tick() {
      const now = performance.now();
      const currentDay = localDay(new Date());
      // Never charge yesterday's active time to today's account.
      if (active && day === currentDay) store.spend(Math.max(0, now - last));
      last = now;
      day = currentDay;
      const state = store.read();
      const playing = !document.hidden && Boolean(isPlaying());
      if (playing && !state.allowed && !notified) {
        notified = true;
        onBlocked();
      }
      if (state.allowed) notified = false;
      active = playing && state.allowed;
      status.textContent = state.error
        ? "Temps de jeu indisponible"
        : "Jeu : " + format(state.remainingMs, true) + " restant" +
          " / " + state.minutes + " min · " + format(state.elapsedMs) + " joué";
      lock.hidden = state.allowed;
      title.textContent = state.error ? "Temps de jeu indisponible" : "Temps de jeu terminé";
      message.textContent = state.error
        ? "Impossible de vérifier le crédit de jeu. Vérifie les données du navigateur."
        : "Tu as utilisé tes " + state.minutes +
          " minutes de jeu aujourd’hui. Termine des exercices pour en gagner davantage.";
      return state;
    }
    const timer = window.setInterval(tick, 250);
    window.addEventListener("storage", (event) => {
      if (event.key === CREDIT_KEY || event.key === USAGE_KEY || event.key === null) tick();
    });
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("pagehide", tick);
    tick();
    return {
      tick,
      canPlay: () => store.read().allowed,
      stop: () => { tick(); window.clearInterval(timer); },
    };
  }
  return { CREDIT_KEY, USAGE_KEY, VERSION, localDay, createStore, mountSummary, mountGame };
})();
if (typeof window !== "undefined") window.GmrPlayTime = GmrPlayTime;
if (typeof module !== "undefined" && module.exports) module.exports = GmrPlayTime;
