"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const track = require("../games/gcv/track-progress.js");

const count = 420, line = 10, grid = 19;

test("free drive starts with zero completed laps", () => {
  const t = track.create(count, line, grid);
  assert.equal(t.laps, 0);
  assert.equal(t.progress, 9);
});

test("one complete forward crossing of the start line counts a lap", () => {
  let t = track.create(count, line, grid);
  for (let i = grid + 1; i < count + line + 1; i++) {
    t = track.advance(t, i % count, count);
  }
  assert.equal(t.laps, 1);
  assert.equal(t.progress, count);
});

test("driving backwards over the line does not award a lap", () => {
  let t = track.create(count, line, grid);
  for (let i = grid - 1; i > -count / 2; i--) {
    t = track.advance(t, (i + count) % count, count);
  }
  assert.equal(t.laps, 0);
});

test("moving back and forth over the line does not duplicate laps", () => {
  let t = track.create(count, line, grid);
  for (let i = grid + 1; i < count + line + 1; i++) {
    t = track.advance(t, i % count, count);
  }
  assert.equal(t.laps, 1);
  for (const index of [9, 8, 9, 10, 11, 10, 9, 10]) {
    t = track.advance(t, index, count);
  }
  assert.equal(t.laps, 1);
});

test("respawning at a safer point does not invent distance or a lap", () => {
  let t = track.create(count, line, 400);
  t = track.relocate(t, 10);
  assert.equal(t.progress, 390);
  assert.equal(t.index, 10);
  assert.equal(t.laps, 0);
});

test("saved lap count and progress resume consistently", () => {
  const previous = { progress: 2 * count + 13, laps: 2 };
  const t = track.create(count, line, 23, previous);
  assert.equal(t.laps, 2);
  assert.equal(track.advance(t, 24, count).progress, 2 * count + 14);
});

test("an implausible index jump never counts as a lap", () => {
  const t = track.create(count, line, 400);
  const jumped = track.advance(t, 60, count);
  assert.equal(jumped.progress, t.progress);
  assert.equal(jumped.laps, 0);
});

test("physical finish line realigns progression after an index was skipped", () => {
  let state = track.create(840, 156, 814);
  const oldProgress = state.progress;
  const finished = track.syncFinish(state, 840, 157, 840);
  assert.equal(finished.progress, 840);
  assert.equal(finished.index, 157);
  assert.ok(finished.progress > oldProgress);
  assert.equal(track.advance(finished, 160, 840).progress, 843);
});

test("a new start just before the line does not invent a completed lap", () => {
  const count = 840, finish = 160, before = 149;
  const start = track.create(count, finish, before);
  assert.equal(start.laps, 0);
  assert.equal(start.progress, 829);
  assert.equal(track.syncFinish(start, 840, finish + 1, count).progress, 840);
});

test("only an almost complete lap can be synchronized at a finish crossing", () => {
  let t = track.create(840, 160, 157);
  const start = 840;
  t = track.syncFinish(t, start, 161, 840); // First physical crossing.
  assert.equal(track.nearNextFinish(t, start, 840), false);
  for (const index of [160, 159, 158, 159, 160, 161, 162]) {
    t = track.advance(t, index, 840);
    assert.equal(track.nearNextFinish(t, start, 840), false,
      "small U-turns next to the finish cannot count as another lap");
  }
  t = { ...t, progress: start + 840 * 0.85 };
  assert.equal(track.nearNextFinish(t, start, 840), false);
  t = { ...t, progress: start + 840 * 0.98 };
  assert.equal(track.nearNextFinish(t, start, 840), true);
  assert.equal(track.nearNextFinish(t, start + 840, 840), false);
});

test("rejecting a nearby-road index jump preserves the old anchor too", () => {
  const initial = track.create(420, 10, 90);
  const jumped = track.advance(initial, 140, 420);
  assert.equal(jumped.index, 90);
  assert.equal(jumped.progress, initial.progress);
  const continued = track.advance(jumped, 91, 420);
  assert.equal(continued.progress, initial.progress + 1);
});

test("nearest road keeps the current hairpin arm despite a closer parallel arm", () => {
  // Two nearby roads with opposite directions. Global-nearest selection
  // would teleport logical position from index 5 to index 14.
  const positions = [];
  for (let i = 0; i < 10; i++) positions.push({ x: i, z: 0 });
  for (let i = 0; i < 10; i++) positions.push({ x: 9 - i, z: 2 });
  const global = track.nearestSample(positions, 20, 5, 1.4);
  assert.equal(global.index, 14);
  const local = track.nearestSample(positions, 20, 5, 1.4, 5, 3, 3);
  assert.equal(local.index, 5);
  const moved = track.nearestSample(positions, 20, 6, 1.4, local.index, 3, 3);
  assert.equal(moved.index, 6);
});

test("road tracking follows the index wrap without losing a lap", () => {
  const points = Array.from({ length: 100 }, (_, i) => ({
    x: Math.cos(i * 2 * Math.PI / 100) * 40,
    z: Math.sin(i * 2 * Math.PI / 100) * 40,
  }));
  let state = track.create(100, 0, 97);
  for (let i = 98; i <= 200; i++) {
    const p = points[i % 100];
    const nearest = track.nearestSample(points, 100, p.x, p.z,
      state.index, 5, 15);
    state = track.advance(state, nearest.index, 100);
  }
  // Starting just before the line gives a first crossing at 100 and a
  // second after a full further lap at 200.
  assert.equal(state.laps, 2);
  assert.equal(state.progress, 200);
});

test("a true relocation outside the current corridor falls back to global nearest", () => {
  const positions = Array.from({ length: 30 }, (_, i) => ({ x: i * 10, z: 0 }));
  const nearest = track.nearestSample(positions, 30, 210, 0, 2, 3, 16);
  assert.equal(nearest.index, 21);
});

test("race travel counts forward motion, ignores sideways motion and subtracts reverse", () => {
  const forward = { x: 3, z: 4 };
  assert.equal(track.alongTrackTravel(
    { x: 0, z: 0 }, { x: 3, z: 4 }, forward), 5);
  assert.equal(track.alongTrackTravel(
    { x: 0, z: 0 }, { x: -4, z: 3 }, forward), 0);
  assert.equal(track.alongTrackTravel(
    { x: 3, z: 4 }, { x: 0, z: 0 }, forward), -5);
  assert.equal(track.alongTrackTravel(
    { x: 0, z: 0 }, { x: 3, z: 4 }, { x: 0, z: 0 }), 0);
  assert.equal(track.alongTrackTravel(
    { x: 0, z: 0 }, { x: NaN, z: 4 }, forward), 0);
});

test("track index teleports cannot add distance when the car did not move", () => {
  const origin = { x: 120, z: -30 };
  const still = track.alongTrackTravel(origin, origin, { x: 0, z: -1 });
  assert.equal(still, 0);
  // Even large side-to-side contact corrections do not grant overtakes.
  const sideways = track.alongTrackTravel(origin,
    { x: origin.x + 10, z: origin.z }, { x: 0, z: -1 });
  assert.equal(sideways, 0);
});
