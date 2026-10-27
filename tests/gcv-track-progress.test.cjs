"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const track = require("../games/gcv/track-progress.js");

const length = 800, count = 840;

function start(initial = -20, distance = 40) {
  return track.move(track.createMotion(length, initial, 10),
    length, distance, 0.5, 11, count).state;
}

test("one motion state provides official distance, crossing and validated laps", () => {
  const motion = track.createMotion(length, -20, 10);
  assert.equal(motion.started, false);
  assert.equal(motion.laps, 0);
  assert.equal(motion.progress, -20);
  const crossed = track.move(motion, length, 40, 0.5, 11, count);
  assert.deepEqual(crossed.events.map((event) => event.type), ["start"]);
  assert.equal(crossed.state.started, true);
  assert.equal(crossed.state.laps, 0);
  const completed = track.move(crossed.state, length, 790, 0.5, 12, count);
  assert.deepEqual(completed.events.map((event) => event.type), ["lap"]);
  assert.equal(completed.state.laps, 1);
  assert.ok(completed.state.progress >= length);
});

test("approaching the start after nearly one circuit cannot pre-credit a timed lap", () => {
  const crossed = track.move(track.createMotion(length, 750, 70),
    length, 52, 0.5, 71, count);
  assert.equal(crossed.state.laps, 0);
  assert.equal(crossed.state.progress, 26);
  assert.equal(crossed.state.lastFinishProgress, 26);
  assert.equal(crossed.events[0].type, "start");
});

test("travel alone never confirms a finish or creates another lap", () => {
  const state = start();
  const traveled = track.move(state, length, 1500);
  assert.equal(traveled.state.laps, 0);
  assert.ok(traveled.state.progress < length);
  assert.deepEqual(traveled.events, []);
});

test("repeated crossings next to the line do not count U-turns", () => {
  let state = start();
  for (let i = 0; i < 15; i++) {
    state = track.move(state, length, -5).state;
    const crossing = track.move(state, length, 5, 0.5);
    state = crossing.state;
    assert.equal(state.laps, 0);
    assert.deepEqual(crossing.events, []);
  }
  const completed = track.move(state, length, 0.82 * length, 0.5);
  assert.equal(completed.state.laps, 1);
  assert.equal(track.move(completed.state, length, 10, 0.5).state.laps, 1);
});

test("reverse and lateral motion never fabricates forward race distance", () => {
  const forward = { x: 3, z: 4 };
  assert.equal(track.alongTrackTravel(
    { x: 0, z: 0 }, { x: 3, z: 4 }, forward), 5);
  assert.equal(track.alongTrackTravel(
    { x: 0, z: 0 }, { x: -4, z: 3 }, forward), 0);
  assert.equal(track.alongTrackTravel(
    { x: 3, z: 4 }, { x: 0, z: 0 }, forward), -5);
  assert.equal(track.alongTrackTravel(
    { x: 0, z: 0 }, { x: NaN, z: 4 }, forward), 0);
  const state = start();
  assert.equal(track.move(state, length, -12).state.progress, state.progress - 12);
});

test("a finish outside the physical road or backwards is ignored", () => {
  const line = { x: 78, z: -10 }, forward = { x: 0, z: -1 };
  assert.equal(track.finishCrossing(
    { x: 78, z: -20 }, { x: 78, z: 8 }, line, forward, 15), null);
  assert.equal(track.finishCrossing(
    { x: 105, z: 5 }, { x: 105, z: -15 }, line, forward, 15), null);
  assert.equal(track.finishCrossing(
    { x: 78, z: -12 }, { x: 78, z: -17 }, line, forward, 15), null);
  assert.equal(track.finishCrossing(
    { x: 78, z: 1.2 }, { x: 78, z: -14.8 }, line, forward, 15), 0.7);
});

test("a suspicious hairpin sample jump is rejected without changing the anchor", () => {
  const state = track.createMotion(length, 75, 10);
  const jump = track.move(state, length, 70, null, 65, count);
  assert.equal(jump.state.progress, 75);
  assert.equal(jump.state.index, 10);
  const next = track.move(jump.state, length, 3, null, 11, count);
  assert.equal(next.state.progress, 78);
  assert.equal(next.state.index, 11);
});

test("the nearest index may wrap around the sample array", () => {
  const state = track.createMotion(length, 100, 838);
  const moved = track.move(state, length, 7, null, 1, count);
  assert.equal(moved.state.index, 1);
  assert.equal(moved.state.progress, 107);
});

test("a respawn only changes the road hint, never gives travel or a lap", () => {
  const state = start();
  const relocated = track.relocate(state, 300);
  assert.equal(relocated.index, 300);
  assert.equal(relocated.progress, state.progress);
  assert.equal(relocated.laps, state.laps);
  assert.equal(relocated.lastFinishProgress, state.lastFinishProgress);
});

test("saved motion restores the same anti-U-turn checkpoint", () => {
  const completed = track.move(start(), length, 740, 0.5).state;
  assert.equal(completed.laps, 1);
  const saved = JSON.parse(JSON.stringify(completed));
  const restored = track.createMotion(length, -20, 1, saved);
  assert.deepEqual(restored, completed);
  assert.equal(track.move(restored, length, 4, 0.5).state.laps, 1);
});

test("corrupt motion states are rejected", () => {
  const state = start();
  assert.equal(track.restoreMotion({ ...state, laps: -1 }, length), null);
  assert.equal(track.restoreMotion({ ...state, progress: NaN }, length), null);
  assert.equal(track.restoreMotion({ ...state, started: false }, length), null);
  assert.equal(track.restoreMotion({ ...state, lastFinishProgress: null }, length), null);
});

test("three valid finish events yield exactly three completed laps", () => {
  let state = start();
  for (let i = 1; i <= 3; i++) {
    const update = track.move(state, length, 0.82 * length, 0.5);
    assert.equal(update.events.length, 1);
    assert.equal(update.events[0].lap, i);
    state = update.state;
    assert.equal(state.laps, i);
  }
});

test("inside shoulder driving above 75% of lap length is accepted", () => {
  let state = start();
  const rejected = track.move(state, length, 0.74 * length, 0.5);
  assert.equal(rejected.state.laps, 0);
  state = track.move(state, length, 0.82 * length, 0.5).state;
  assert.equal(state.laps, 1);
});

test("nearest road keeps the current hairpin arm despite a closer parallel arm", () => {
  const positions = [];
  for (let i = 0; i < 10; i++) positions.push({ x: i, z: 0 });
  for (let i = 0; i < 10; i++) positions.push({ x: 9 - i, z: 2 });
  const global = track.nearestSample(positions, 20, 5, 1.4);
  assert.equal(global.index, 14);
  const local = track.nearestSample(positions, 20, 5, 1.4, 5, 3, 3);
  assert.equal(local.index, 5);
  assert.equal(track.nearestSample(positions, 20, 6, 1.4,
    local.index, 3, 3).index, 6);
});

test("road tracking can follow the closed circuit over sample zero", () => {
  const points = Array.from({ length: 100 }, (_, i) => ({
    x: Math.cos(i * 2 * Math.PI / 100) * 40,
    z: Math.sin(i * 2 * Math.PI / 100) * 40,
  }));
  const sample = track.nearestSample(points, 100,
    points[0].x, points[0].z, 97, 5, 15);
  assert.equal(sample.index, 0);
});

test("respawn far from the current road corridor falls back to global nearest", () => {
  const positions = Array.from({ length: 30 }, (_, i) => ({ x: i * 10, z: 0 }));
  assert.equal(track.nearestSample(positions, 30, 210, 0, 2, 3, 16).index, 21);
});

test("a teleporting road index with no car displacement cannot invent progress", () => {
  const origin = { x: 120, z: -30 };
  assert.equal(track.alongTrackTravel(origin, origin, { x: 0, z: -1 }), 0);
  assert.equal(track.alongTrackTravel(origin,
    { x: origin.x + 10, z: origin.z }, { x: 0, z: -1 }), 0);
});
