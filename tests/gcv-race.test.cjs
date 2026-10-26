"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const race = require("../games/gcv/race.js");

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

test("hardest opponents take 15–18 seconds; slowest take 39–40 seconds", () => {
  const distance = 820;
  for (const randomValue of [0, 0.5, 1]) {
    const state = race.create(distance, () => randomValue);
    const times = state.opponents.map((ai) => distance / ai.speed);
    assert.equal(times.length, 9);
    assert.ok(times.slice(0, 3).every((time) => time >= 15 && time <= 18));
    const expectedFastBands = [[15, 16], [16, 17], [17, 18]];
    for (let i = 0; i < 3; i++) {
      assert.ok(times[i] >= expectedFastBands[i][0] &&
        times[i] <= expectedFastBands[i][1]);
    }
    assert.ok(times.slice(3, 7).every((time) => time >= 26 && time <= 38));
    assert.ok(times.slice(7).every((time) => time >= 39 && time <= 40));
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
  assert.ok(active.opponents.every((ai) => ai.progress < 340));
});

test("older saved races automatically upgrade their slow AI speeds", () => {
  const state = race.create(820);
  const saved = JSON.parse(JSON.stringify(state));
  for (const ai of saved.opponents) {
    ai.speed = 9;
    delete ai.targetLapSeconds;
  }
  const restored = race.restore(saved, 820, () => 0.5);
  assert.ok(restored);
  assert.ok(restored.opponents[0].targetLapSeconds >= 15 &&
    restored.opponents[0].targetLapSeconds <= 16);
  assert.ok(restored.opponents[1].targetLapSeconds >= 16 &&
    restored.opponents[1].targetLapSeconds <= 17);
  assert.ok(restored.opponents[2].targetLapSeconds >= 17 &&
    restored.opponents[2].targetLapSeconds <= 18);
  assert.ok(restored.opponents[8].targetLapSeconds >= 39 &&
    restored.opponents[8].targetLapSeconds <= 40);
  // The randomized difficulty persists instead of changing at every reload.
  const reloaded = race.restore(JSON.parse(JSON.stringify(restored)), 820, () => 0);
  assert.deepEqual(reloaded, restored);
});

test("race completes only after two full laps, not the first start crossing", () => {
  let state = race.advance(race.create(800, () => 0.5), 5);
  state = race.advance(state, 0.2, 40);
  assert.equal(state.phase, "racing");
  assert.equal(race.currentLap(state), 1);
  state = race.advance(state, 20, 800);
  assert.equal(state.phase, "racing");
  assert.equal(race.currentLap(state), 2);
  state = race.advance(state, 20, 815);
  assert.equal(state.phase, "finished");
  assert.ok(state.finishPosition >= 1 && state.finishPosition <= 10);
  assert.ok(state.raceTime > 0);
  assert.deepEqual(race.advance(state, 20, 99999), state);
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
  state = race.advance(state, 45, 1620 + 100);
  assert.equal(state.phase, "finished");
  const result = race.position(state);
  assert.ok(result > 0 && result <= 10);
  state = race.advance(state, 10, 0);
  assert.equal(race.position(state), result);
});
