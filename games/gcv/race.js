"use strict";
// Simple ten-car race: nine AI opponents with a fixed randomized pace per race.
// Distances are metres measured along the same closed centerline as the player.
const GcvRace = (() => {
  const TrackProgress = typeof GcvTrackProgress !== "undefined"
    ? GcvTrackProgress : require("./track-progress.js");
  const GRID_COUNT = 10;
  const AI_COUNT = GRID_COUNT - 1;
  const PLAYER_SLOT = 4; // Fifth of ten positions: middle of the grid.
  const LAPS = 3;
  const PACE_VERSION = 2;
  const COUNTDOWN_SECONDS = 3;
  const GRID_WAIT_SECONDS = 2; // Pause on the grid before the 3-2-1 countdown.
  const AI_ACCELERATION = 10; // m/s²; below the player's ~23.6 m/s² launch.
  const COLUMN_OFFSET = 3;
  const ROW_SPACING = 9.5;
  const FIRST_ROW_DISTANCE = 12;
  // Cruise lap targets: leaders 15–19 s, then a 19.5–32 s field.
  // Actual first laps include acceleration from rest, as for the player.
  // Each target is randomized at race creation. Non-overlapping bands
  // preserve the difficulty order, regardless of the chosen random values.
  const PACE_RANGES = Object.freeze([
    [15, 16.5], [16.5, 18], [18, 19],
    [19.5, 21.5], [21.5, 23.5], [23.5, 25.5], [25.5, 27.5],
    [28, 30], [30, 32],
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

  function opponentNumber(slot) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= GRID_COUNT ||
        slot === PLAYER_SLOT) return null;
    const index = slot < PLAYER_SLOT ? slot : slot - 1;
    // Vehicle 9 belongs exclusively to the player.
    return index === 8 ? 10 : index + 1;
  }

  function lapTarget(rank, random = Math.random) {
    const [fast, slow] = PACE_RANGES[rank];
    const roll = Number(random());
    const fraction = Number.isFinite(roll) ? Math.min(1, Math.max(0, roll)) : 0.5;
    return fast + (slow - fast) * fraction;
  }

  function create(trackLength, random = Math.random, initialMotion = null) {
    if (!Number.isFinite(trackLength) || trackLength <= 0) {
      throw new Error("Invalid track length");
    }
    const playerMotion = initialMotion ||
      TrackProgress.createMotion(trackLength, -gridSlot(PLAYER_SLOT).distance);
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
      trackLength, laps: LAPS, paceVersion: PACE_VERSION,
      playerProgress: playerMotion.progress, playerMotion,
      opponents, finishPosition: null, raceTime: null,
      playerLapTimes: [],
      // The track progress engine alone validates start/finish crossings.
      distanceModel: "unified-motion-v1",
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
    const rows = standings(race);
    const winnerTime = rows[0]?.finishTime;
    return rows.map((entry, i) => ({
      rank: i + 1, id: entry.id, finishTime: entry.finishTime,
      progress: entry.progress,
      // Each finisher's gap is measured from the winner, not the previous car.
      gap: i > 0 && Number.isFinite(entry.finishTime) &&
        Number.isFinite(winnerTime)
        ? Math.max(0, entry.finishTime - winnerTime) : null,
    }));
  }

  function currentLap(race) {
    return Math.min(LAPS, race.playerMotion.laps + 1);
  }

  // Integrate motion from rest with a limited starting acceleration, then
  // cruise at the selected speed. Using absolute time makes large and small
  // physics frames yield the same position and finish time.
  function distanceAt(seconds, topSpeed) {
    const t = Math.max(0, seconds);
    const tTop = topSpeed / AI_ACCELERATION;
    if (t <= tTop) return AI_ACCELERATION * t * t / 2;
    return topSpeed * (t - tTop / 2);
  }

  function timeAtDistance(distance, topSpeed) {
    const capDistance = topSpeed * topSpeed / (2 * AI_ACCELERATION);
    if (distance <= capDistance)
      return Math.sqrt(Math.max(0, 2 * distance / AI_ACCELERATION));
    return topSpeed / AI_ACCELERATION +
      (distance - capDistance) / topSpeed;
  }

  // Accept either an authoritative TrackProgress.move result (from the game)
  // or signed travel and crossing fraction (for standalone simulations).
  // Both paths use the SAME progression and lap-validation implementation.
  function advance(race, elapsedSeconds, playerDistance = 0, finishFraction = null) {
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
      const before = distanceAt(race.elapsed, item.speed);
      const after = distanceAt(elapsed, item.speed);
      const next = item.progress + (after - before);
      if (next >= finishDistance) {
        // Solve the exact time reached under the acceleration ramp, not a
        // constant-speed guess. Works for slow or large rendering frames.
        return { ...item, progress: finishDistance,
          finishTime: timeAtDistance(before + finishDistance -
            item.progress, item.speed) };
      }
      return { ...item, progress: next };
    });

    if (race.phase === "finished") {
      // Continue the race in the 3D world after the player has stopped.
      return { ...race, opponents, elapsed };
    }

    const motion = playerDistance && typeof playerDistance === "object" &&
      playerDistance.state && Array.isArray(playerDistance.events)
      ? playerDistance
      : TrackProgress.move(race.playerMotion, race.trackLength,
        playerDistance, finishFraction);
    const lapTimes = race.playerLapTimes.slice();
    for (const event of motion.events) {
      if (event.type !== "lap" || event.lap !== lapTimes.length + 1 ||
          lapTimes.length >= LAPS) continue;
      const crossingTime = race.elapsed + dt * event.fraction;
      const previousTime = lapTimes.reduce((a, b) => a + b, 0);
      lapTimes.push(Math.max(0, crossingTime - previousTime));
    }
    const hasFinished = lapTimes.length === LAPS;
    const updated = {
      ...race, elapsed, opponents,
      playerMotion: motion.state,
      playerProgress: hasFinished ? finishDistance : motion.state.progress,
      playerLapTimes: lapTimes,
    };
    if (hasFinished) {
      const crossingTime = lapTimes.reduce((a, b) => a + b, 0);
      const finished = { ...updated, phase: "finished",
        raceTime: crossingTime };
      return { ...finished, finishPosition: position(finished) };
    }
    return updated;
  }

  // Sessions from prior game revisions are intentionally not migrated.
  function restore(saved, trackLength) {
    if (!saved || saved.laps !== LAPS || saved.paceVersion !== PACE_VERSION ||
        saved.distanceModel !== "unified-motion-v1" ||
        !Number.isFinite(trackLength) ||
        Math.abs(saved.trackLength - trackLength) > 0.01 ||
        !["staging", "countdown", "racing", "finished"].includes(saved.phase) ||
        !Number.isFinite(saved.playerProgress) ||
        !Number.isFinite(saved.elapsed) || saved.elapsed < 0 ||
        !TrackProgress.restoreMotion(saved.playerMotion, trackLength) ||
        Math.abs(saved.playerMotion.progress - saved.playerProgress) > 0.001 ||
        saved.playerMotion.laps !== saved.playerLapTimes?.length ||
        !Array.isArray(saved.playerLapTimes) ||
        saved.playerLapTimes.length > LAPS ||
        saved.playerLapTimes.some((ms) => !Number.isFinite(ms) || ms < 0) ||
        !Array.isArray(saved.opponents) || saved.opponents.length !== AI_COUNT ||
        saved.opponents.some((ai) => !Number.isFinite(ai.progress) ||
          !Number.isFinite(ai.lateral) || !Number.isFinite(ai.speed) ||
          !Number.isFinite(ai.targetLapSeconds))) return null;
    return { ...saved };
  }

  return Object.freeze({ GRID_COUNT, AI_COUNT, PLAYER_SLOT, LAPS,
    COUNTDOWN_SECONDS, GRID_WAIT_SECONDS, AI_ACCELERATION, PACE_RANGES,
    gridSlot, opponentNumber, create, advance, distanceAt, standings, position, classification,
    currentLap, restore });
})();
if (typeof window !== "undefined") window.GcvRace = GcvRace;
if (typeof module !== "undefined" && module.exports) module.exports = GcvRace;
