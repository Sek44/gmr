"use strict";

// UI and gameplay form two independent axes: opening scores does not change
// the race, and a fall does not pause the opponents or reset the stopwatch.
const GcvFlow = (() => {
  const SCREEN = Object.freeze({ MENU: "menu", PLAY: "play", SCORES: "scores" });
  const ACTIVITY = Object.freeze({
    EMPTY: "empty", FREE: "free", STAGING: "staging",
    COUNTDOWN: "countdown", RACING: "racing", FINISHED: "finished",
  });
  const nextRacePhase = Object.freeze({
    staging: ["staging", "countdown"],
    countdown: ["countdown", "racing"],
    racing: ["racing", "finished"],
    finished: ["finished"],
  });

  function create() {
    let screen = SCREEN.MENU;
    let previousScreen = SCREEN.MENU;
    let activity = ACTIVITY.EMPTY;
    let vehicle = "on-track";

    function beginFree() {
      activity = ACTIVITY.FREE;
      vehicle = "on-track";
    }

    function beginRace() {
      activity = ACTIVITY.STAGING;
      vehicle = "on-track";
    }

    function restore(mode, phase = null) {
      if (mode === "free") activity = ACTIVITY.FREE;
      else if (mode === "race" && Object.hasOwn(nextRacePhase, phase)) activity = phase;
      else throw new Error("Invalid saved GCV activity");
      // Snapshots are restored at a safe road position, never mid-fall.
      vehicle = "on-track";
    }

    function advanceRace(phase) {
      if (!nextRacePhase[activity]?.includes(phase))
        throw new Error("Invalid GCV race transition: " + activity + " -> " + phase);
      activity = phase;
    }

    function resume() {
      if (activity === ACTIVITY.EMPTY) beginFree();
      screen = SCREEN.PLAY;
    }

    function openMenu() { screen = SCREEN.MENU; }

    function openScores() {
      if (screen === SCREEN.SCORES) return false;
      previousScreen = screen;
      screen = SCREEN.SCORES;
      return true;
    }

    function closeScores() {
      if (screen !== SCREEN.SCORES) return false;
      screen = previousScreen;
      previousScreen = SCREEN.MENU;
      return true;
    }

    function beginFall() {
      if (vehicle === "falling" || (activity !== ACTIVITY.FREE &&
          activity !== ACTIVITY.RACING)) return false;
      vehicle = "falling";
      return true;
    }

    function land() { vehicle = "on-track"; }

    return Object.freeze({
      beginFree, beginRace, restore, advanceRace, resume, openMenu,
      openScores, closeScores, beginFall, land,
      get screen() { return screen; },
      get activity() { return activity; },
      get mode() {
        return nextRacePhase[activity] ? "race" : "free";
      },
      get hasSession() { return activity !== ACTIVITY.EMPTY; },
      // Keep menu layout under the score iframe when opened from home.
      get menuOpen() {
        return screen === SCREEN.MENU ||
          (screen === SCREEN.SCORES && previousScreen === SCREEN.MENU);
      },
      get scoresOpen() { return screen === SCREEN.SCORES; },
      get paused() { return screen !== SCREEN.PLAY; },
      get falling() { return vehicle === "falling"; },
      get canDrive() {
        return !this.falling && (activity === ACTIVITY.FREE ||
          activity === ACTIVITY.RACING);
      },
    });
  }

  return Object.freeze({ SCREEN, ACTIVITY, create });
})();

if (typeof window !== "undefined") window.GcvFlow = GcvFlow;
if (typeof module !== "undefined" && module.exports) module.exports = GcvFlow;
