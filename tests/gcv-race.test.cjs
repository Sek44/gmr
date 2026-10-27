"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const race = require("../games/gcv/race.js");

// Cross the grid line, finish lap one, then finish lap two physically.
function finishPlayerRace(state, seconds, extraDistance = 0) {
  const gridDistance = race.gridSlot(race.PLAYER_SLOT).distance;
  state = race.advance(state, seconds * 0.02, gridDistance + 2, 0.5);
  state = race.advance(state, seconds * 0.49, state.trackLength, 0.5);
  return race.advance(state, seconds * 0.49,
    state.trackLength + extraDistance, 0.5);
}

test("race uses 10 cars, nine AI and player at the middle grid position", () => {
  const state = race.create(820);
  assert.equal(race.GRID_COUNT, 10);
  assert.equal(race.AI_COUNT, 9);
  assert.equal(state.opponents.length, 9);
  assert.equal(race.PLAYER_SLOT, 4);
  assert.equal(race.position(state), 5);
  assert.equal(new Set(state.opponents.map((ai) => ai.id)).size, 9);
  assert.ok(!state.opponents.some((ai) => ai.id === race.PLAYER_SLOT));
});

test("grid has two columns and safe separation between each row", () => {
  const distances = [];
  for (let index = 0; index < race.GRID_COUNT; index++) {
    const slot = race.gridSlot(index);
    distances.push(slot.distance);
    assert.ok(Math.abs(slot.lateral) >= 2);
    if (index > 1) {
      assert.ok(slot.distance >= race.gridSlot(index - 2).distance + 9);
    }
  }
  assert.equal(race.gridSlot(0).distance, race.gridSlot(1).distance);
  assert.equal(race.gridSlot(8).distance, race.gridSlot(9).distance);
  assert.equal(race.gridSlot(-1), null);
  assert.equal(race.gridSlot(10), null);
});

test("two seconds of staging precede the complete 3-2-1 countdown", () => {
  let state = race.create(800, () => 0.5);
  assert.equal(state.phase, "staging");
  assert.equal(state.gridWait, 2);
  const first = state.opponents.map((ai) => ai.progress);
  const playerStart = state.playerProgress;

  state = race.advance(state, 1, 150);
  assert.equal(state.phase, "staging");
  assert.equal(state.gridWait, 1);
  assert.deepEqual(state.opponents.map((ai) => ai.progress), first);
  assert.equal(state.playerProgress, playerStart);

  state = race.advance(state, 1, 150);
  assert.equal(state.phase, "countdown");
  assert.equal(state.countdown, 3);
  for (const secondsLeft of [2, 1]) {
    state = race.advance(state, 1, 150);
    assert.equal(state.phase, "countdown");
    assert.equal(state.countdown, secondsLeft);
    assert.deepEqual(state.opponents.map((ai) => ai.progress), first);
    assert.equal(state.playerProgress, playerStart);
  }
  state = race.advance(state, 1, 150);
  assert.equal(state.phase, "racing");
  assert.equal(state.playerProgress, playerStart);
  state = race.advance(state, 0.5, 0);
  assert.ok(state.opponents.every((ai, index) => ai.progress > first[index]));
});

test("prestart and countdown consume only their own portion of slow frames", () => {
  let state = race.create(800, () => 0.5);
  state = race.advance(state, 2.5, 900);
  assert.equal(state.phase, "countdown");
  assert.ok(Math.abs(state.countdown - 2.5) < 1e-9);
  assert.equal(state.playerProgress, -race.gridSlot(race.PLAYER_SLOT).distance);
  state = race.advance(state, 3, 900);
  assert.equal(state.phase, "racing");
  assert.ok(Math.abs(state.elapsed - 0.5) < 1e-9);
  assert.equal(state.playerProgress, -race.gridSlot(race.PLAYER_SLOT).distance);
});

test("AI cruise pacing remains ordered from 17–21s leaders to 32–34s backmarkers", () => {
  const distance = 820;
  for (const randomValue of [0, 0.5, 1]) {
    const state = race.create(distance, () => randomValue);
    const times = state.opponents.map((ai) => distance / ai.speed);
    assert.equal(times.length, 9);
    assert.ok(times.slice(0, 3).every((time) => time >= 17 && time <= 21));
    const expectedFastBands = [[17, 18.5], [18.5, 20], [20, 21]];
    for (let i = 0; i < 3; i++) {
      assert.ok(times[i] >= expectedFastBands[i][0] &&
        times[i] <= expectedFastBands[i][1]);
    }
    const expectedOthers = [[21.5, 23.5], [23.5, 25.5],
      [25.5, 27.5], [27.5, 29.5], [30, 32], [32, 34]];
    for (let i = 0; i < expectedOthers.length; i++) {
      const [min, max] = expectedOthers[i];
      assert.ok(times[i + 3] >= min && times[i + 3] <= max);
    }
    for (let i = 1; i < times.length; i++) {
      assert.ok(times[i] >= times[i - 1]);
    }
    for (let i = 0; i < 9; i++) {
      assert.ok(Math.abs(state.opponents[i].targetLapSeconds - times[i]) < 1e-9);
    }
  }
});

test("new races get different randomized speeds, always within each band", () => {
  const fastRoll = race.create(820, () => 0.1);
  const slowRoll = race.create(820, () => 0.9);
  for (let i = 0; i < 9; i++) {
    assert.ok(fastRoll.opponents[i].targetLapSeconds <
      slowRoll.opponents[i].targetLapSeconds);
    assert.ok(fastRoll.opponents[i].speed > slowRoll.opponents[i].speed);
  }
});

test("AI pace adapts to track length, but full lap duration is unchanged", () => {
  const first = race.create(820, () => 0.5);
  const extended = race.create(1200, () => 0.5);
  for (let i = 0; i < 9; i++) {
    assert.ok(Math.abs(820 / first.opponents[i].speed -
      1200 / extended.opponents[i].speed) < 1e-9);
  }
});

test("player can overtake the nine AI at full speed", () => {
  const raceState = race.create(800, () => 0.5);
  const started = race.advance(raceState, 5);
  const active = race.advance(started, 6, 380);
  assert.equal(race.position(active), 1);
  assert.ok(active.opponents.every((ai) => ai.progress < 380),
    "AI should stay behind a 380 m player sprint after six seconds");
});

test("older saved races adopt tighter AI pacing bands once", () => {
  const state = race.create(820);
  const saved = JSON.parse(JSON.stringify(state));
  for (const ai of saved.opponents) {
    ai.speed = 9;
    delete ai.targetLapSeconds;
  }
  const restored = race.restore(saved, 820, () => 0.5);
  assert.ok(restored);
  assert.ok(restored.opponents[0].targetLapSeconds >= 17 &&
    restored.opponents[0].targetLapSeconds <= 18.5);
  assert.ok(restored.opponents[1].targetLapSeconds >= 18.5 &&
    restored.opponents[1].targetLapSeconds <= 20);
  assert.ok(restored.opponents[2].targetLapSeconds >= 20 &&
    restored.opponents[2].targetLapSeconds <= 21);
  assert.ok(restored.opponents[8].targetLapSeconds >= 32 &&
    restored.opponents[8].targetLapSeconds <= 34);
  // The randomized difficulty persists instead of changing at every reload.
  const reloaded = race.restore(JSON.parse(JSON.stringify(restored)), 820, () => 0);
  assert.deepEqual(reloaded, restored);
});

test("race completes only after two full laps, not the first start crossing", () => {
  let state = race.advance(race.create(800, () => 0.5), 5);
  state = race.advance(state, 0.2, 40, 0.5); // Grid line: start only.
  assert.equal(state.phase, "racing");
  assert.equal(race.currentLap(state), 1);
  state = race.advance(state, 20, 800, 0.5);
  assert.equal(state.phase, "racing");
  assert.equal(race.currentLap(state), 2);
  state = race.advance(state, 20, 815, 0.5);
  assert.equal(state.phase, "finished");
  assert.ok(state.finishPosition >= 1 && state.finishPosition <= 10);
  assert.ok(state.raceTime > 0);
  // The player's car stops, but all the AI keep driving after the finish.
  const after = race.advance(state, 20, 99999);
  assert.equal(after.phase, "finished");
  assert.equal(after.raceTime, state.raceTime);
  assert.equal(after.finishPosition, state.finishPosition);
  assert.equal(after.playerProgress, state.playerProgress);
  assert.ok(after.opponents.some((ai, index) =>
    ai.progress > state.opponents[index].progress));
});


test("distance or index jitter cannot finish the race without crossing the line", () => {
  let state = race.advance(race.create(800, () => 0.5), 5);
  state = race.advance(state, 0.5, 40, 0.5); // Starting grid.
  state = race.advance(state, 25, 850); // More than one entire lap.
  assert.equal(state.phase, "racing");
  assert.equal(state.playerLapTimes.length, 0);
  assert.equal(race.currentLap(state), 1);
  state = race.advance(state, 25, 850); // Over two laps, still no finish.
  assert.equal(state.phase, "racing");
  assert.equal(state.playerLapTimes.length, 0);
  assert.ok(state.playerProgress < 800);
});

test("a real finish crossing validates laps and locks the result only on lap two", () => {
  let state = race.advance(race.create(800, () => 0.5), 5);
  state = race.advance(state, 0.5, 40, 0.25);
  state = race.advance(state, 24, 795, 0.75);
  assert.equal(state.playerLapTimes.length, 1);
  assert.equal(state.phase, "racing");
  state = race.advance(state, 20, 800);
  assert.equal(state.phase, "racing", "the distance milestone is not the actual finish");
  assert.equal(state.playerLapTimes.length, 1);
  state = race.advance(state, 1, 1, 0.4);
  assert.equal(state.phase, "finished");
  assert.equal(state.playerLapTimes.length, 2);
  assert.ok(Math.abs(state.raceTime - (0.5 + 24 + 20 + 0.4)) < 1e-9);
});

test("U-turns next to the line never count as full laps", () => {
  let state = race.advance(race.create(800, () => 0.5), 5);
  state = race.advance(state, 0.5, 40, 0.5);
  for (let i = 0; i < 30; i++) {
    state = race.advance(state, 0.4, 0, 0.5);
  }
  assert.equal(state.playerLapTimes.length, 0);
  assert.equal(state.phase, "racing");
  state = race.advance(state, 20, 800, 0.5);
  assert.equal(state.playerLapTimes.length, 1);
  state = race.advance(state, 0.5, 0, 0.5);
  assert.equal(state.playerLapTimes.length, 1);
});

test("physical crossing gate is retained when a race is saved and restored", () => {
  let state = race.advance(race.create(800, () => 0.5), 5);
  state = race.advance(state, 0.5, 40, 0.5);
  state = race.advance(state, 24, 800, 0.5);
  state = race.restore(JSON.parse(JSON.stringify(state)), 800);
  assert.equal(state.playerLapTimes.length, 1);
  state = race.advance(state, 19, 800);
  assert.equal(state.phase, "racing");
  state = race.advance(state, 1, 1, 0.5);
  assert.equal(state.phase, "finished");
});

test("backward movement and falls do not advance player race position", () => {
  let state = race.advance(race.create(820, () => 0.5), 5);
  const previous = state.playerProgress;
  state = race.advance(state, 2, -19);
  assert.equal(state.playerProgress, previous);
  assert.ok(state.opponents.every((ai) => ai.progress > -60));
});

test("race countdown and competitors survive persistence roundtrip", () => {
  let state = race.create(840);
  state = race.advance(state, 0.4);
  const saved = JSON.parse(JSON.stringify(state));
  assert.deepEqual(race.restore(saved, 840), state);
  assert.equal(race.restore(saved, 820), null);
  assert.equal(race.restore({ ...saved, opponents: [] }, 840), null);
});

test("finishing locks the rank and results stay stable", () => {
  let state = race.advance(race.create(810, () => 0.5), 5);
  state = finishPlayerRace(state, 45, 100);
  assert.equal(state.phase, "finished");
  const result = race.position(state);
  assert.ok(result > 0 && result <= 10);
  state = race.advance(state, 10, 0);
  assert.equal(race.position(state), result);
});

test("each player lap records its real duration including sub-frame crossing", () => {
  let state = race.advance(race.create(800, () => 0.5), 5);
  state = race.advance(state, 0.5,
    race.gridSlot(race.PLAYER_SLOT).distance + 4, 0.7);
  state = race.advance(state, 21.5, 735);
  assert.equal(state.playerLapTimes.length, 0);
  state = race.advance(state, 1, 65, 0.5);
  assert.equal(state.playerLapTimes.length, 1);
  const expectedFirst = 22.5; // 0.5 + 21.5 + half of the next 1 s frame.
  assert.ok(Math.abs(state.playerLapTimes[0] - expectedFirst) < 1e-9);
  state = race.advance(state, 24, 800, 0.25);
  assert.equal(state.phase, "finished");
  assert.equal(state.playerLapTimes.length, 2);
  assert.ok(state.playerLapTimes.every((x) => x > 0));
  assert.ok(Math.abs(state.playerLapTimes[0] + state.playerLapTimes[1] -
    state.raceTime) < 1e-9);
});

test("all nine opponents continue finishing behind the displayed results", () => {
  let state = race.advance(race.create(800, () => 0.5), 5);
  state = finishPlayerRace(state, 40, 80);
  assert.equal(state.phase, "finished");
  const savedPosition = state.finishPosition, savedTime = state.raceTime;
  const aiAfterFinish = state.opponents.filter((ai) =>
    !Number.isFinite(ai.finishTime)).length;
  assert.ok(aiAfterFinish > 0);
  for (let i = 0; i < 30; i++) state = race.advance(state, 3, 500);
  assert.equal(state.opponents.filter((ai) =>
    Number.isFinite(ai.finishTime)).length, 9);
  assert.equal(state.playerProgress, 1600);
  assert.equal(state.raceTime, savedTime);
  assert.equal(state.finishPosition, savedPosition);
  assert.deepEqual(race.advance(state, 4), state);
});

test("finish order uses actual times, not the identical clamped final distance", () => {
  let state = race.advance(race.create(800, () => 0.5), 5);
  state = finishPlayerRace(state, 45, 40);
  for (let i = 0; i < 25; i++) state = race.advance(state, 4);
  const rows = race.classification(state);
  assert.equal(rows.length, 10);
  assert.ok(rows.every((row) => Number.isFinite(row.finishTime)));
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].finishTime >= rows[i - 1].finishTime);
    assert.ok(rows[i].gap >= 0);
    assert.ok(Math.abs(rows[i].gap -
      (rows[i].finishTime - rows[i - 1].finishTime)) < 1e-8);
  }
  assert.equal(rows[0].gap, null);
  const player = rows.find((row) => row.id === "player");
  assert.equal(player.rank, race.position(state));
});

test("classification shows unfinished cars after all finishers with no invented times", () => {
  let state = race.advance(race.create(800, () => 0.5), 5);
  state = finishPlayerRace(state, 41, 10);
  const rows = race.classification(state);
  const done = rows.filter((row) => Number.isFinite(row.finishTime));
  const pending = rows.filter((row) => row.finishTime === null);
  assert.ok(done.length > 0);
  assert.ok(pending.length > 0);
  assert.equal(rows[done.length].finishTime, null);
  assert.ok(pending.every((row) => row.gap === null));
});

test("race save restores AI finish times, player laps and locked player result", () => {
  let state = race.advance(race.create(800, () => 0.5), 5);
  state = finishPlayerRace(state, 42, 40);
  const saved = JSON.parse(JSON.stringify(state));
  const restored = race.restore(saved, 800, () => 0);
  assert.deepEqual(restored, state);
  assert.deepEqual(race.classification(restored), race.classification(state));
});

test("AI finish times do not depend on low frame rates", () => {
  const original = race.advance(race.create(800, () => 0.5), 5);
  const oneFrame = race.advance(original, 80);
  let smallFrames = original;
  for (let i = 0; i < 80; i++) smallFrames = race.advance(smallFrames, 1);
  for (let i = 0; i < original.opponents.length; i++) {
    assert.ok(Math.abs(oneFrame.opponents[i].finishTime -
      smallFrames.opponents[i].finishTime) < 1e-7);
  }
});

test("all nine rivals accelerate from stationary instead of starting at cruising speed", () => {
  let state = race.advance(race.create(800, () => 0.5), 5);
  const before = state.opponents.map((ai) => ai.progress);
  state = race.advance(state, 1);
  assert.ok(state.opponents.every((ai, index) =>
    Math.abs(ai.progress - before[index] - race.AI_ACCELERATION / 2) < 1e-9));
  assert.equal(race.AI_ACCELERATION, 10);
});

test("AI start acceleration never exceeds the player's measured launch", () => {
  const physics = require("../games/gcv/physics.js");
  let car = { x: 0, z: 0, yaw: 0, speed: 0 };
  const raceState = race.advance(race.create(800, () => 0.5), 5);
  const initialProgress = raceState.opponents[0].progress;
  for (let i = 1; i <= 90; i++) {
    car = physics.advance(car, { accelerate: true, steer: 0 }, 1 / 60);
    const state = race.advance(raceState, i / 60);
    const aiSpeed = Math.min(state.opponents[0].speed,
      race.AI_ACCELERATION * i / 60);
    assert.ok(aiSpeed <= car.speed + 1e-6,
      "AI speed cannot outpace the player's at any of the first 90 frames");
    const distance = state.opponents[0].progress - initialProgress;
    assert.ok(distance <= -car.z + 1,
      "AI travel at launch cannot be much farther than the player's");
  }
});

test("AI acceleration and arrival timestamps do not depend on frame size", () => {
  const initial = race.advance(race.create(800, () => 0.5), 5);
  const bigFrame = race.advance(initial, 50);
  let smallFrames = initial;
  for (let i = 0; i < 500; i++) smallFrames = race.advance(smallFrames, 0.1);
  for (let i = 0; i < 9; i++) {
    const big = bigFrame.opponents[i], small = smallFrames.opponents[i];
    assert.ok(Math.abs(big.progress - small.progress) < 1e-6);
    if (big.finishTime !== null) {
      assert.ok(Math.abs(big.finishTime - small.finishTime) < 1e-6);
    }
  }
});
