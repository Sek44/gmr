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
  // Target seconds per lap: three strong racers (15–18 s),
  // four mid-field racers (26–38 s), and two backmarkers (39–40 s).
  // Each target is randomized at race creation. Non-overlapping bands
  // preserve the difficulty order, regardless of the chosen random values.
  const PACE_RANGES = Object.freeze([
    [15, 16], [16, 17], [17, 18],
    [26, 29], [30, 33], [34, 36], [37, 38],
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
        finishTime: null,
        speed: trackLength / targetLapSeconds,
        color: COLORS[slot % COLORS.length],
      });
    }
    return {
      phase: "staging", gridWait: GRID_WAIT_SECONDS,
      countdown: COUNTDOWN_SECONDS, elapsed: 0,
      trackLength, playerProgress: -gridSlot(PLAYER_SLOT).distance,
      opponents, finishPosition: null, raceTime: null,
      playerLapTimes: [],
    };
  }

  function standings(race) {
    const competitors = [
      { id: "player", progress: race.playerProgress,
        finishTime: race.raceTime },
      ...race.opponents.map(({ id, progress, finishTime }) =>
        ({ id, progress, finishTime })),
    ];
    // Completed cars are ranked by their actual finish times, never by
    // their clamped identical distance at the finish line. Cars still
    // circulating follow all finishers in current distance order.
    competitors.sort((a, b) => {
      const aDone = Number.isFinite(a.finishTime);
      const bDone = Number.isFinite(b.finishTime);
      if (aDone && bDone) return a.finishTime - b.finishTime ||
        (a.id === "player" ? -1 : b.id === "player" ? 1 : a.id - b.id);
      if (aDone !== bDone) return aDone ? -1 : 1;
      return b.progress - a.progress ||
        (a.id === "player" ? -1 : b.id === "player" ? 1 : a.id - b.id);
    });
    return competitors;
  }

  function position(race) {
    if (race.finishPosition !== null) return race.finishPosition;
    return standings(race).findIndex((item) => item.id === "player") + 1;
  }

  function classification(race) {
    return standings(race).map((entry, i, rows) => {
      const predecessor = i > 0 ? rows[i - 1] : null;
      return {
        rank: i + 1, id: entry.id, finishTime: entry.finishTime,
        progress: entry.progress,
        gap: Number.isFinite(entry.finishTime) &&
          Number.isFinite(predecessor?.finishTime)
          ? Math.max(0, entry.finishTime - predecessor.finishTime) : null,
      };
    });
  }

  function currentLap(race) {
    return Math.min(LAPS, Math.max(1,
      Math.floor(Math.max(0, race.playerProgress) / race.trackLength) + 1));
  }

  function advance(race, elapsedSeconds, playerDistance = 0) {
    const dt = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
    if (!dt) return race;
    if (race.phase === "staging") {
      const remaining = race.gridWait - dt;
      if (remaining > 0) return { ...race, gridWait: remaining };
      return advance({ ...race, phase: "countdown", gridWait: 0 },
        Math.max(0, -remaining), 0);
    }
    if (race.phase === "countdown") {
      const remaining = race.countdown - dt;
      if (remaining > 0) return { ...race, countdown: remaining };
      return advance({ ...race, phase: "racing", countdown: 0 },
        Math.max(0, -remaining), 0);
    }

    const finishDistance = LAPS * race.trackLength;
    const allFinished = race.opponents.every((ai) =>
      Number.isFinite(ai.finishTime));
    if (race.phase === "finished" && allFinished) return race;
    const elapsed = race.elapsed + dt;
    const opponents = race.opponents.map((item) => {
      if (Number.isFinite(item.finishTime)) return item;
      const next = item.progress + item.speed * dt;
      if (next >= finishDistance) {
        // Interpolate precisely within the current frame, so the time is
        // independent of rendering FPS and remains correct behind results.
        const fraction = Math.max(0, Math.min(1,
          (finishDistance - item.progress) / (item.speed * dt)));
        return { ...item, progress: finishDistance,
          finishTime: race.elapsed + dt * fraction };
      }
      return { ...item, progress: next };
    });

    if (race.phase === "finished") {
      // Continue the race in the 3D world after the player has stopped.
      return { ...race, opponents, elapsed };
    }

    const traveled = Math.max(0, playerDistance);
    const newProgress = race.playerProgress + traveled;
    const lapTimes = (race.playerLapTimes || []).slice();
    for (let lap = lapTimes.length + 1; lap <= LAPS; lap++) {
      const milestone = lap * race.trackLength;
      if (newProgress < milestone) break;
      const fraction = traveled > 0 ?
        Math.max(0, Math.min(1,
          (milestone - race.playerProgress) / traveled)) : 1;
      const crossingTime = race.elapsed + dt * fraction;
      const previousTime = lapTimes.length
        ? lapTimes.reduce((a, b) => a + b, 0) : 0;
      lapTimes.push(Math.max(0, crossingTime - previousTime));
    }
    const updated = {
      ...race, elapsed, opponents, playerLapTimes: lapTimes,
      playerProgress: Math.min(finishDistance, newProgress),
    };
    if (newProgress >= finishDistance) {
      const crossingTime = lapTimes.reduce((a, b) => a + b, 0);
      const finished = { ...updated, phase: "finished",
        raceTime: crossingTime };
      return { ...finished, finishPosition: position(finished) };
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
      // Preserve each randomized pace on reload. Opponents from an older
      // difficulty tier are upgraded once, then stay stable across reloads.
      opponents: saved.opponents.map((ai, index) => {
        const [min, max] = PACE_RANGES[index];
        const validTarget = Number.isFinite(ai.targetLapSeconds) &&
          ai.targetLapSeconds >= min && ai.targetLapSeconds <= max;
        const targetLapSeconds = validTarget
          ? ai.targetLapSeconds : lapTarget(index, random);
        const speed = trackLength / targetLapSeconds;
        const finishTime = Number.isFinite(ai.finishTime) && ai.finishTime >= 0
          ? ai.finishTime : ai.progress >= LAPS * trackLength
            ? (LAPS * trackLength + gridSlot(ai.id).distance) / speed : null;
        return { ...ai, targetLapSeconds, speed, finishTime };
      }),
      gridWait: saved.phase === "staging"
        ? Math.max(0, Math.min(GRID_WAIT_SECONDS, Number(saved.gridWait) || GRID_WAIT_SECONDS))
        : 0,
      countdown: Math.max(0, Number(saved.countdown) || 0),
      playerLapTimes: Array.isArray(saved.playerLapTimes) &&
        saved.playerLapTimes.length <= LAPS &&
        saved.playerLapTimes.every((x) => Number.isFinite(x) && x >= 0)
        ? saved.playerLapTimes.slice()
        : saved.phase === "finished" && Number.isFinite(saved.raceTime)
          ? [saved.raceTime] : [],
    };
  }

  return Object.freeze({ GRID_COUNT, AI_COUNT, PLAYER_SLOT, LAPS,
    COUNTDOWN_SECONDS, GRID_WAIT_SECONDS, PACE_RANGES, gridSlot, create, advance, standings, position, classification,
    currentLap, restore });
})();
if (typeof window !== "undefined") window.GcvRace = GcvRace;
if (typeof module !== "undefined" && module.exports) module.exports = GcvRace;
