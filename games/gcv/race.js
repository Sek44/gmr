"use strict";
// Simple ten-car race: nine AI opponents with a fixed randomized pace per race.
// Distances are metres measured along the same closed centerline as the player.
const GcvRace = (() => {
  const GRID_COUNT = 10;
  const AI_COUNT = GRID_COUNT - 1;
  const PLAYER_SLOT = 4; // Fifth of ten positions: middle of the grid.
  const LAPS = 2;
  // A car taking the inside shoulder around bends covers less physical
  // distance than the track centerline. Keep a generous anti-U-turn guard,
  // while accepting real full laps on legal inside trajectories.
  const MIN_PHYSICAL_LAP_FRACTION = 0.75;
  const COUNTDOWN_SECONDS = 3;
  const GRID_WAIT_SECONDS = 2; // Pause on the grid before the 3-2-1 countdown.
  const AI_ACCELERATION = 10; // m/s²; below the player's ~23.6 m/s² launch.
  const COLUMN_OFFSET = 3;
  const ROW_SPACING = 9.5;
  const FIRST_ROW_DISTANCE = 12;
  // Cruise lap targets: leaders 17–21 s, then a smooth 21.5–34 s field.
  // Actual first laps include acceleration from rest, as for the player.
  // Each target is randomized at race creation. Non-overlapping bands
  // preserve the difficulty order, regardless of the chosen random values.
  const PACE_RANGES = Object.freeze([
    [17, 18.5], [18.5, 20], [20, 21],
    [21.5, 23.5], [23.5, 25.5], [25.5, 27.5], [27.5, 29.5],
    [30, 32], [32, 34],
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
      // Lap completion requires a real forward crossing of the visible line.
      playerStartCrossed: false, lastPhysicalFinishProgress: null,
      distanceModel: "signed-motion-v1",
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
    // Estimated distance is used for standings, never to validate a lap.
    return Math.min(LAPS, (race.playerLapTimes?.length || 0) + 1);
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

  // finishFraction is the fraction of THIS frame at which the player's car
  // physically crossed the visible finish line in the forward direction.
  // Distance alone must never trigger a lap or end the race.
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

    // Signed forward motion: reversing subtracts distance, so the player
    // cannot gain places by oscillating back and forth on one road section.
    const traveled = Number.isFinite(playerDistance) ? playerDistance : 0;
    const rawProgress = race.playerProgress + traveled;
    let confirmedProgress = rawProgress;
    const lapTimes = (race.playerLapTimes || []).slice();
    let startCrossed = race.playerStartCrossed === true;
    let lastCrossingProgress = race.lastPhysicalFinishProgress;
    const crossedLine = Number.isFinite(finishFraction) &&
      finishFraction >= 0 && finishFraction <= 1;
    if (crossedLine) {
      if (!startCrossed) {
        // The grid is BEFORE the line: its first crossing starts lap one.
        startCrossed = true;
        // The grid is behind the start: the first physical crossing anchors
        // distance zero even when sample projection is slightly imprecise.
        confirmedProgress = Math.max(rawProgress, 0);
        lastCrossingProgress = confirmedProgress;
      } else if (lapTimes.length < LAPS &&
          Number.isFinite(lastCrossingProgress) &&
          rawProgress - lastCrossingProgress >=
            MIN_PHYSICAL_LAP_FRACTION * race.trackLength) {
        // Repeated forward crossings after reversing at the line do not count.
        // A nearly complete circuit must separate two accepted crossings.
        const crossingTime = race.elapsed + dt * finishFraction;
        const previousTime = lapTimes.reduce((a, b) => a + b, 0);
        lapTimes.push(Math.max(0, crossingTime - previousTime));
        // A validated physical lap reaches exactly the lap milestone.
        // Otherwise the player may visibly cross the line while the HUD
        // and position remain behind because a few samples were skipped.
        confirmedProgress = Math.max(rawProgress, lapTimes.length * race.trackLength);
        lastCrossingProgress = confirmedProgress;
      }
    }
    const hasFinished = lapTimes.length === LAPS;
    const updated = {
      ...race, elapsed, opponents, playerLapTimes: lapTimes,
      playerStartCrossed: startCrossed,
      lastPhysicalFinishProgress: lastCrossingProgress,
      // Without a real finish crossing, stop the approximate HUD distance
      // short of the next lap. Only confirmed crossings unlock the milestone.
      playerProgress: hasFinished ? finishDistance :
        Math.max(startCrossed ? lapTimes.length * race.trackLength : -Infinity,
          Math.min(confirmedProgress,
            (lapTimes.length + 1) * race.trackLength - 0.001)),
    };
    if (hasFinished) {
      const crossingTime = lapTimes.reduce((a, b) => a + b, 0);
      const finished = { ...updated, phase: "finished",
        raceTime: crossingTime };
      return { ...finished, finishPosition: position(finished) };
    }
    return updated;
  }

  // Old saves ranked the player using a monotonic high-water sample index.
  // A bad track projection could put the player first forever. On migration,
  // reconstruct their race distance from their actual position on the track,
  // preserving only laps confirmed by physical finish crossings.
  function migratePlayerProgress(race, sampleIndex, startIndex, sampleCount) {
    if (!race || race.distanceModel === "signed-motion-v1" ||
        race.phase === "finished" ||
        ![sampleIndex, startIndex, sampleCount].every(Number.isSafeInteger) ||
        sampleCount < 2) return race;
    const offset = ((sampleIndex - startIndex) % sampleCount + sampleCount) %
      sampleCount;
    const fraction = offset / sampleCount;
    const validatedLaps = Math.min(LAPS,
      Array.isArray(race.playerLapTimes) ? race.playerLapTimes.length : 0);
    const crossed = race.playerStartCrossed === true;
    const position = crossed
      ? Math.max(validatedLaps * race.trackLength,
        Math.min((validatedLaps + fraction) * race.trackLength,
          (validatedLaps + 1) * race.trackLength - 0.001))
      : (fraction - 1) * race.trackLength;
    return {
      ...race, playerProgress: position,
      lastPhysicalFinishProgress: crossed
        ? validatedLaps * race.trackLength : null,
      distanceModel: "signed-motion-v1",
    };
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
      // Older in-progress saves did not track real crossings. Resume them
      // conservatively, without awarding another lap on an immediate U-turn.
      playerStartCrossed: typeof saved.playerStartCrossed === "boolean"
        ? saved.playerStartCrossed : saved.playerProgress >= 0,
      lastPhysicalFinishProgress:
        saved.playerStartCrossed === false ? null :
        Number.isFinite(saved.lastPhysicalFinishProgress)
          ? saved.lastPhysicalFinishProgress :
          saved.playerProgress >= 0
            ? (Array.isArray(saved.playerLapTimes) ?
              saved.playerLapTimes.length : 0) * trackLength : null,
      playerLapTimes: Array.isArray(saved.playerLapTimes) &&
        saved.playerLapTimes.length <= LAPS &&
        saved.playerLapTimes.every((x) => Number.isFinite(x) && x >= 0)
        ? saved.playerLapTimes.slice()
        : saved.phase === "finished" && Number.isFinite(saved.raceTime)
          ? [saved.raceTime] : [],
    };
  }

  return Object.freeze({ GRID_COUNT, AI_COUNT, PLAYER_SLOT, LAPS,
    COUNTDOWN_SECONDS, GRID_WAIT_SECONDS, AI_ACCELERATION, PACE_RANGES,
    gridSlot, create, advance, distanceAt, standings, position, classification,
    currentLap, migratePlayerProgress, restore });
})();
if (typeof window !== "undefined") window.GcvRace = GcvRace;
if (typeof module !== "undefined" && module.exports) module.exports = GcvRace;
