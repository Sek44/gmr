"use strict";
// Simple ten-car race: nine AI opponents with a fixed randomized pace per race.
// Distances are metres measured along the same closed centerline as the player.
const GcvRace = (() => {
  const GRID_COUNT = 10;
  const AI_COUNT = GRID_COUNT - 1;
  const PLAYER_SLOT = 4; // Fifth of ten positions: middle of the grid.
  const LAPS = 2;
  const COUNTDOWN_SECONDS = 3;
  const GRID_WAIT_SECONDS = 2; // Pause on the grid before the 3-2-1 countdown.
  const COLUMN_OFFSET = 3;
  const ROW_SPACING = 9.5;
  const FIRST_ROW_DISTANCE = 12;
  // Targets, seconds per complete lap: three strong racers (20–28 s),
  // four intermediate racers and two backmarkers (39–40 s).
  // Nonoverlapping bands preserve difficulty order while varying every race.
  const PACE_RANGES = Object.freeze([
    [20, 22.5], [23, 25.5], [26, 28],
    [29, 31.5], [32, 34.5], [35, 36.5], [37, 38],
    [39, 39.5], [39.5, 40],
  ].map((range) => Object.freeze(range)));

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

  function lapTarget(rank, random = Math.random) {
    const [fast, slow] = PACE_RANGES[rank];
    const roll = Number(random());
    const fraction = Number.isFinite(roll) ? Math.min(1, Math.max(0, roll)) : 0.5;
    return fast + (slow - fast) * fraction;
  }

  function create(trackLength, random = Math.random) {
    if (!Number.isFinite(trackLength) || trackLength <= 0) {
      throw new Error("Invalid track length");
    }
    const opponents = [];
    for (let slot = 0; slot < GRID_COUNT; slot++) {
      if (slot === PLAYER_SLOT) continue;
      const grid = gridSlot(slot);
      const rank = opponents.length;
      const targetLapSeconds = lapTarget(rank, random);
      opponents.push({
        id: slot, progress: -grid.distance, lateral: grid.lateral,
        // Speed is fixed at launch but randomized between races. Its target
        // is based on the real circuit length, not a constant speed value.
        targetLapSeconds,
        speed: trackLength / targetLapSeconds,
        color: COLORS[slot % COLORS.length],
      });
    }
    return {
      phase: "staging", gridWait: GRID_WAIT_SECONDS,
      countdown: COUNTDOWN_SECONDS, elapsed: 0,
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
    if (race.phase === "staging") {
      const remaining = race.gridWait - dt;
      if (remaining > 0) return { ...race, gridWait: remaining };
      // The grid settles for two full seconds BEFORE 3-2-1 begins.
      return advance({ ...race, phase: "countdown", gridWait: 0 },
        Math.max(0, -remaining), 0);
    }
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

  function restore(saved, trackLength, random = Math.random) {
    if (!saved || !Number.isFinite(trackLength) ||
        Math.abs(saved.trackLength - trackLength) > 0.01 ||
        !["staging", "countdown", "racing", "finished"].includes(saved.phase) ||
        !Number.isFinite(saved.playerProgress) ||
        !Number.isFinite(saved.elapsed) || saved.elapsed < 0 ||
        !Array.isArray(saved.opponents) || saved.opponents.length !== AI_COUNT ||
        saved.opponents.some((ai) => !Number.isFinite(ai.progress) ||
          !Number.isFinite(ai.lateral) || !Number.isFinite(ai.speed)))
      return null;
    return {
      ...saved, trackLength,
      // Preserve each randomized pace on reload. Older 35–50s opponents
      // are upgraded once to a fresh pace in the new difficulty tier.
      opponents: saved.opponents.map((ai, index) => {
        const [min, max] = PACE_RANGES[index];
        const validTarget = Number.isFinite(ai.targetLapSeconds) &&
          ai.targetLapSeconds >= min && ai.targetLapSeconds <= max;
        const targetLapSeconds = validTarget
          ? ai.targetLapSeconds : lapTarget(index, random);
        return { ...ai, targetLapSeconds, speed: trackLength / targetLapSeconds };
      }),
      gridWait: saved.phase === "staging"
        ? Math.max(0, Math.min(GRID_WAIT_SECONDS, Number(saved.gridWait) || GRID_WAIT_SECONDS))
        : 0,
      countdown: Math.max(0, Number(saved.countdown) || 0),
    };
  }

  return Object.freeze({ GRID_COUNT, AI_COUNT, PLAYER_SLOT, LAPS,
    COUNTDOWN_SECONDS, GRID_WAIT_SECONDS, PACE_RANGES, gridSlot, create, advance, standings, position,
    currentLap, restore });
})();
if (typeof window !== "undefined") window.GcvRace = GcvRace;
if (typeof module !== "undefined" && module.exports) module.exports = GcvRace;
