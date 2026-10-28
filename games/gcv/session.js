"use strict";

// Race/trial transitions, snapshots and autosave; the physics loop remains in game.js.
const GcvSession = (() => {
  function create({ window, state, revision, circuitKey, layoutVersion,
    positions, directions, startIndex, startCenter, startSide, startYaw,
    trackLength, SAMPLE_COUNT, OUTER_HALF_WIDTH, Physics, TrackProgress,
    LapTimes, Race, progressSamples, startOffset, closestRoad, snapBack,
    clearControls, clearLapHold, resetResultsCooldown, renderSession,
    setLapCount, announce, resume }) {
    let binding = null;
    let autosaveElapsed = 0;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    function changed() {
      if (binding) binding.changed();
    }

    function snapshot() {
      const safe = state.falling ? positions[state.respawnIndex] : state.driver;
      const savedMotion = state.falling
        ? TrackProgress.relocate(state.lapTracker, state.respawnIndex)
        : state.lapTracker;
      return {
        saveRevision: revision,
        x: safe.x, z: safe.z,
        yaw: state.falling
          ? Math.atan2(-directions[state.respawnIndex].x, -directions[state.respawnIndex].z)
          : state.driver.yaw,
        speed: state.falling ? 0 : state.driver.speed,
        reverseHold: state.falling ? 0 : state.driver.reverseHold,
        camera: state.cameraMode,
        motion: savedMotion,
        // A fall retains its lap time, but resumes at a safe location.
        lapTimer: state.lapTimer,
        mode: state.gameMode,
        race: state.gameMode === "race" && state.raceState
          ? { ...state.raceState, playerMotion: savedMotion,
            playerProgress: savedMotion.progress }
          : null,
        freeSession: state.gameMode === "race" ? state.freeSession : null,
        circuitKey,
        layoutVersion,
      };
    }

    function restore(saved) {
      if (!saved || saved.saveRevision !== revision) return false;
      if (!LapTimes.sameCircuitRoute(saved.circuitKey, circuitKey) ||
          saved.layoutVersion !== layoutVersion) {
        state.cameraMode = saved.camera === "outside" ? "outside" : "inside";
        return false;
      }
      const valid = ["x", "z", "yaw", "speed"].every((key) => Number.isFinite(saved[key]));
      if (valid && Math.abs(saved.x) < 220 && Math.abs(saved.z) < 220) {
        state.driver = {
          x: saved.x, z: saved.z, yaw: saved.yaw,
          speed: clamp(saved.speed, -Physics.REVERSE_MAX_SPEED, Physics.MAX_SPEED),
          reverseHold: clamp(Number(saved.reverseHold) || 0, 0, Physics.REVERSE_DELAY),
        };
        const near = closestRoad(state.driver.x, state.driver.z);
        if (near.distanceSquared > OUTER_HALF_WIDTH * OUTER_HALF_WIDTH) {
          snapBack(near.index);
        }
      }
      const nearestIndex = closestRoad(state.driver.x, state.driver.z).index;
      state.lapTracker = TrackProgress.createMotion(
        trackLength, startOffset(nearestIndex), nearestIndex, saved.motion);
      state.lapTimer = LapTimes.restore(saved.lapTimer, SAMPLE_COUNT,
        progressSamples(state.lapTracker.progress));
      setLapCount(state.lapTracker.laps);
      state.cameraMode = saved.camera === "outside" ? "outside" : "inside";
      const restoredRace = saved.mode === "race"
        ? Race.restore(saved.race, trackLength) : null;
      state.gameMode = restoredRace ? "race" : "free";
      state.raceState = restoredRace;
      if (restoredRace) state.lapTracker = restoredRace.playerMotion;
      state.freeSession = restoredRace &&
        LapTimes.sameCircuitRoute(saved.freeSession?.circuitKey, circuitKey)
        ? saved.freeSession : null;
      state.hasActiveSession = true;
      return true;
    }

    function startRace() {
      if (state.gameMode === "free") state.freeSession = snapshot();
      clearControls();
      state.gameMode = "race";
      clearLapHold();
      resetResultsCooldown();
      const grid = Race.gridSlot(Race.PLAYER_SLOT);
      const start = startCenter.clone()
        .addScaledVector(directions[startIndex], -grid.distance)
        .addScaledVector(startSide, grid.lateral);
      const current = closestRoad(start.x, start.z).index;
      state.driver = { x: start.x, z: start.z, yaw: startYaw, speed: 0, reverseHold: 0 };
      state.falling = false;
      state.fall = null;
      state.respawnIndex = current;
      state.lapTracker = TrackProgress.createMotion(trackLength, -grid.distance, current);
      state.raceState = Race.create(trackLength, Math.random, state.lapTracker);
      state.lapTimer = LapTimes.initial(SAMPLE_COUNT, progressSamples(state.lapTracker.progress));
      announce("");
      renderSession();
      resume();
    }

    function chooseFree() {
      if (state.gameMode === "free") { resume(); return; }
      clearLapHold();
      resetResultsCooldown();
      const priorFree = state.freeSession;
      clearControls();
      state.gameMode = "free";
      state.raceState = null;
      state.freeSession = null;
      if (priorFree && LapTimes.sameCircuitRoute(priorFree.circuitKey, circuitKey)) {
        restore(priorFree);
      } else {
        restartNearFinish();
      }
      renderSession();
      resume();
    }

    function restartNearFinish() {
      if (state.gameMode === "race") { startRace(); return; }
      clearLapHold();
      // Restart the current attempt, without erasing permanent lap records.
      const beforeLine = startCenter.clone()
        .addScaledVector(directions[startIndex], -10);
      const index = closestRoad(beforeLine.x, beforeLine.z).index;
      clearControls();
      state.driver = {
        x: beforeLine.x, z: beforeLine.z, yaw: startYaw,
        speed: 0, reverseHold: 0,
      };
      state.falling = false;
      state.fall = null;
      state.respawnIndex = index;
      state.lapTracker = TrackProgress.createMotion(trackLength, -10, index);
      state.lapTimer = LapTimes.initial(SAMPLE_COUNT, progressSamples(state.lapTracker.progress));
      setLapCount(0);
      announce("");
      renderSession();
      changed();
    }

    function bind() {
      const store = window.GameState.create("gcv");
      const previous = store.load();
      if (previous && previous.saveRevision !== revision) {
        store.clear(); // Lap times and scores have separate persistent storage.
      }
      binding = store.bind({ snapshot, restore });
    }

    function tickAutosave(dt) {
      autosaveElapsed += dt;
      if (state.hasActiveSession && autosaveElapsed >= 1.5) {
        autosaveElapsed = 0;
        changed();
      }
    }

    return {
      bind, changed, tickAutosave, snapshot, restore,
      startRace, chooseFree, restartNearFinish,
    };
  }
  return { create };
})();

if (typeof window !== "undefined") window.GcvSession = GcvSession;
if (typeof module !== "undefined" && module.exports) module.exports = GcvSession;
