"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const track = require("../games/gcv/track-progress.js");
const race = require("../games/gcv/race.js");
const timing = require("../games/gcv/lap-times.js");

test("one accepted finish drives official lap, race ranking and chronometer", () => {
  const length = 800, samples = 800;
  let motion = track.createMotion(length, -20, 5);
  let state = race.advance(race.create(length, () => 0.5, motion), 5);
  let clock = timing.initial(samples, motion.progress);
  const chronoLaps = [];

  function step(distance, finishFraction = null) {
    const previous = motion.progress;
    const update = track.move(motion, length, distance, finishFraction);
    const measured = timing.advance(clock, previous, update.sectorProgress,
      1000, samples);
    clock = measured.state;
    for (const crossing of update.events) {
      const result = timing.crossFinish(clock, crossing.fraction, 1000,
        samples, crossing.progress);
      clock = result.state;
      chronoLaps.push(...result.events.filter((event) => event.type === "lap"));
    }
    state = race.advance(state, 1, update);
    motion = state.playerMotion;
    assert.equal(state.playerProgress, motion.progress);
    assert.equal(state.playerLapTimes.length, motion.laps);
    assert.equal(race.currentLap(state), Math.min(motion.laps + 1, race.LAPS));
    return update;
  }

  assert.deepEqual(step(40, 0.5).events.map((x) => x.type), ["start"]);
  assert.equal(motion.laps, 0);
  assert.equal(clock.running, true);
  for (let lap = 1; lap <= race.LAPS; lap++) {
    step(200);
    step(200);
    step(200);
    const finish = step(200, 0.5);
    assert.deepEqual(finish.events.map((x) => x.type), ["lap"]);
    assert.equal(motion.laps, lap);
    assert.equal(chronoLaps.length, lap);
    assert.equal(state.phase, lap === race.LAPS ? "finished" : "racing");
  }
  assert.equal(state.playerProgress, race.LAPS * length);
  assert.equal(state.playerLapTimes.length, 3);
  assert.ok(chronoLaps.every((lap) => lap.splits.length === 3));
  assert.equal(state.raceTime, state.playerLapTimes.reduce((sum, t) => sum + t, 0));
});

test("oscillations and unvalidated sector movement cannot produce any lap", () => {
  const length = 800;
  let motion = track.createMotion(length, -20, 5);
  let clock = timing.initial(800, motion.progress);
  let raceState = race.advance(race.create(length, () => 0.5, motion), 5);
  const updates = [[40, 0.5], [300, null], [-300, null],
    [8, 0.5], [5, null], [-5, null], [8, 0.5]];
  for (const [meters, fraction] of updates) {
    const previous = motion.progress;
    const progress = track.move(motion, length, meters, fraction);
    const split = timing.advance(clock, previous, progress.sectorProgress, 1000, 800);
    clock = split.state;
    for (const event of progress.events)
      clock = timing.crossFinish(clock, event.fraction, 1000, 800, event.progress).state;
    raceState = race.advance(raceState, 1, progress);
    motion = raceState.playerMotion;
    assert.equal(motion.laps, 0);
  }
  assert.equal(raceState.playerLapTimes.length, 0);
  assert.equal(clock.startAt, 0);
});

test("a fall relocates the car without advancing lap distance or changing sectors", () => {
  let motion = track.move(track.createMotion(800, -20, 10),
    800, 40, 0.5).state;
  const timer = timing.crossFinish(timing.initial(800, -20),
    0.5, 1000, 800, 0).state;
  const withSector = timing.advance(timer, motion.progress, 240, 1000, 800).state;
  const delayed = timing.elapse(withSector, 2000);
  const relocated = track.relocate(motion, 300);
  assert.equal(relocated.progress, motion.progress);
  assert.equal(relocated.laps, motion.laps);
  assert.equal(delayed.splits.length, 1);
  assert.equal(delayed.elapsedMs, withSector.elapsedMs + 2000);
  motion = track.move(relocated, 800, 0, null, 300, 840).state;
  assert.equal(motion.laps, 0);
});
