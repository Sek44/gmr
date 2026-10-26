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

test("countdown is three seconds and blocks all opponent movement", () => {
  let state = race.create(800);
  const first = state.opponents.map((ai) => ai.progress);
  state = race.advance(state, 1, 150);
  assert.equal(state.phase, "countdown");
  assert.equal(state.countdown, 2);
  assert.deepEqual(state.opponents.map((ai) => ai.progress), first);
  assert.equal(state.playerProgress, -race.gridSlot(race.PLAYER_SLOT).distance);
  state = race.advance(state, 1, 150);
  assert.equal(state.countdown, 1);
  state = race.advance(state, 1, 150);
  assert.equal(state.phase, "racing");
  assert.equal(state.playerProgress, -race.gridSlot(race.PLAYER_SLOT).distance);
});

test("nine AI lap targets span exactly 35 to 50 seconds", () => {
  const distance = 820;
  const state = race.create(distance);
  const lapSeconds = state.opponents.map((ai) => distance / ai.speed);
  assert.equal(lapSeconds.length, 9);
  assert.ok(Math.abs(lapSeconds[0] - 35) < 1e-9);
  assert.ok(Math.abs(lapSeconds[8] - 50) < 1e-9);
  for (let i = 1; i < lapSeconds.length; i++) {
    assert.ok(lapSeconds[i] > lapSeconds[i - 1]);
  }
  assert.ok(state.opponents.every((ai, index) =>
    Math.abs(ai.targetLapSeconds - lapSeconds[index]) < 1e-9));
});

test("AI pace adapts to track length, but full lap duration is unchanged", () => {
  const first = race.create(820);
  const extended = race.create(1200);
  for (let i = 0; i < 9; i++) {
    assert.ok(Math.abs(820 / first.opponents[i].speed -
      1200 / extended.opponents[i].speed) < 1e-9);
  }
});

test("player can overtake the nine AI at full speed", () => {
  const raceState = race.create(800);
  const started = race.advance(raceState, 3);
  const active = race.advance(started, 6, 380);
  assert.equal(race.position(active), 1);
  assert.ok(active.opponents.every((ai) => ai.progress < 140));
});

test("older saved races automatically upgrade their slow AI speeds", () => {
  const state = race.create(820);
  const saved = JSON.parse(JSON.stringify(state));
  for (const ai of saved.opponents) {
    ai.speed = 9;
    delete ai.targetLapSeconds;
  }
  const restored = race.restore(saved, 820);
  assert.ok(restored);
  assert.ok(Math.abs(820 / restored.opponents[0].speed - 35) < 1e-9);
  assert.ok(Math.abs(820 / restored.opponents[8].speed - 50) < 1e-9);
});

test("race completes only after two full laps, not the first start crossing", () => {
  let state = race.advance(race.create(800), 3);
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
  let state = race.advance(race.create(820), 3);
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
  let state = race.advance(race.create(810), 3);
  state = race.advance(state, 45, 1620 + 100);
  assert.equal(state.phase, "finished");
  const result = race.position(state);
  assert.ok(result > 0 && result <= 10);
  state = race.advance(state, 10, 0);
  assert.equal(race.position(state), result);
});
