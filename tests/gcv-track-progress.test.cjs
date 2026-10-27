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
