"use strict";
// Minimal deterministic race against nine deliberately slow opponents.
// Distances are metres measured along the same closed centerline as the player.
const GcvRace = (() => {
  const GRID_COUNT = 10;
  const AI_COUNT = GRID_COUNT - 1;
  const PLAYER_SLOT = 4; // Fifth of ten positions: middle of the grid.
  const LAPS = 2;
  const COUNTDOWN_SECONDS = 3;
  const COLUMN_OFFSET = 3;
  const ROW_SPACING = 9.5;
  const FIRST_ROW_DISTANCE = 12;
  const COLORS = Object.freeze([
    0x39b6d5, 0xf5bd49, 0x80d78a, 0xa189df, 0xf08e64,
    0xe66eb0, 0xe6d765, 0x66bddc, 0x8ccea5,
  ]);

  function gridSlot(index) {
    if (!Number.isInteger(index) || index < 0 || index >= GRID_COUNT) return null;
    return {
      distance: FIRST_ROW_DISTANCE + Math.floor(index / 2) * ROW_SPACING,
      lateral: index % 2 === 0 ? -COLUMN_OFFSET : COLUMN_OFFSET,
    };
  }

  function create(trackLength) {
    if (!Number.isFinite(trackLength) || trackLength <= 0) {
      throw new Error("Invalid track length");
    }
    const opponents = [];
    for (let slot = 0; slot < GRID_COUNT; slot++) {
      if (slot === PLAYER_SLOT) continue;
      const grid = gridSlot(slot);
      opponents.push({
        id: slot, progress: -grid.distance, lateral: grid.lateral,
        // Speeds 28.8–43.2 km/h, far below the player's 250 km/h.
        speed: 8 + ((slot * 7) % 11) * 0.4,
        color: COLORS[slot % COLORS.length],
      });
    }
    return {
      phase: "countdown", countdown: COUNTDOWN_SECONDS, elapsed: 0,
      trackLength, playerProgress: -gridSlot(PLAYER_SLOT).distance,
      opponents, finishPosition: null, raceTime: null,
    };
  }

  function standings(race) {
    const competitors = [
      { id: "player", progress: race.playerProgress },
      ...race.opponents.map(({ id, progress }) => ({ id, progress })),
    ];
    competitors.sort((a, b) => b.progress - a.progress ||
      (a.id === "player" ? -1 : b.id === "player" ? 1 : a.id - b.id));
    return competitors;
  }

  function position(race) {
    if (race.finishPosition !== null) return race.finishPosition;
    return standings(race).findIndex((item) => item.id === "player") + 1;
  }

  function currentLap(race) {
    return Math.min(LAPS, Math.max(1,
      Math.floor(Math.max(0, race.playerProgress) / race.trackLength) + 1));
  }

  function advance(race, elapsedSeconds, playerDistance = 0) {
    const dt = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
    if (!dt || race.phase === "finished") return race;
    if (race.phase === "countdown") {
      const remaining = race.countdown - dt;
      if (remaining > 0) return { ...race, countdown: remaining };
      // A frame spanning GO may include race time after the signal, not before.
      return advance({ ...race, phase: "racing", countdown: 0 },
        Math.max(0, -remaining), 0);
    }
    const opponents = race.opponents.map((item) => ({
      ...item, progress: Math.min(LAPS * race.trackLength,
        item.progress + item.speed * dt),
    }));
    const progress = race.playerProgress + Math.max(0, playerDistance);
    const elapsed = race.elapsed + dt;
    const updated = { ...race, elapsed, opponents,
      playerProgress: Math.min(LAPS * race.trackLength, progress) };
    if (progress >= LAPS * race.trackLength) {
      return { ...updated, phase: "finished",
        finishPosition: position(updated), raceTime: elapsed };
    }
    return updated;
  }

  function restore(saved, trackLength) {
    if (!saved || !Number.isFinite(trackLength) ||
        Math.abs(saved.trackLength - trackLength) > 0.01 ||
        !["countdown", "racing", "finished"].includes(saved.phase) ||
        !Number.isFinite(saved.playerProgress) ||
        !Number.isFinite(saved.elapsed) || saved.elapsed < 0 ||
        !Array.isArray(saved.opponents) || saved.opponents.length !== AI_COUNT ||
        saved.opponents.some((ai) => !Number.isFinite(ai.progress) ||
          !Number.isFinite(ai.lateral) || !Number.isFinite(ai.speed)))
      return null;
    return {
      ...saved, trackLength, opponents: saved.opponents.map((ai) => ({ ...ai })),
      countdown: Math.max(0, Number(saved.countdown) || 0),
    };
  }

  return Object.freeze({ GRID_COUNT, AI_COUNT, PLAYER_SLOT, LAPS,
    COUNTDOWN_SECONDS, gridSlot, create, advance, standings, position,
    currentLap, restore });
})();
if (typeof window !== "undefined") window.GcvRace = GcvRace;
if (typeof module !== "undefined" && module.exports) module.exports = GcvRace;
