"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Layout = require("../games/gcv/track-layout.js");
const Progress = require("../games/gcv/track-progress.js");
const Race = require("../games/gcv/race.js");
const LapTimes = require("../games/gcv/lap-times.js");

test("open route selects a distinct start and finish", () => {
  assert.equal(Layout.select("classic"), Layout);
  assert.equal(Layout.select("rainbow"), Layout.SPRINT);
  assert.equal(Layout.SPRINT.CLOSED, false);
  assert.notDeepEqual(Layout.SPRINT.START, Layout.SPRINT.FINISH);
  for (const gate of [Layout.SPRINT.START, Layout.SPRINT.FINISH, Layout.SPRINT.SPAWN]) {
    assert.ok(Number.isFinite(gate.x) && Number.isFinite(gate.z),
      "every timing marker must use the {x,z} contract");
  }
  assert.equal(typeof Layout.SPRINT.nearestIndex, "function");
  assert.equal(Layout.SPRINT.HUMPS.length, 3);
  assert.ok(Layout.SPRINT.RAINBOW[1] > Layout.SPRINT.RAINBOW[0]);
});

test("an open-route finish requires a start and enough real travel", () => {
  const len = 1500;
  let motion = Progress.createMotion(len, -20);
  let result = Progress.moveOpen(motion, len, 100, null, .5, 1, 1200);
  assert.equal(result.events.length, 0);
  result = Progress.moveOpen(motion, len, 100, .2, null, 1, 1200);
  assert.equal(result.events[0].type, "start");
  motion = result.state;
  result = Progress.moveOpen(motion, len, 500, null, .5, 2, 1200);
  assert.equal(result.state.laps, 0);
  result = Progress.moveOpen(result.state, len, 700, null, .75, 3, 1200);
  assert.equal(result.events[0].type, "lap");
  result = Progress.moveOpen(result.state, len, 1500, null, .5, 4, 1200);
  assert.equal(result.state.laps, 1);
  assert.equal(result.events.length, 0);
});

test("a one-run race ends at the validated open finish", () => {
  let race = Race.create(1500, () => .5, Progress.createMotion(1500, -20), 1);
  race = { ...race, phase: "racing" };
  const start = Progress.moveOpen(race.playerMotion, 1500, 100, .25, null);
  race = Race.advance(race, 2, start);
  const finish = Progress.moveOpen(race.playerMotion, 1500, 1400, null, .6);
  race = Race.advance(race, 29, finish);
  assert.equal(race.phase, "finished");
  assert.equal(race.playerLapTimes.length, 1);
  assert.ok(Math.abs(race.raceTime - 19.4) < 1e-9);
});

test("open timing stops after the second gate", () => {
  let timer = LapTimes.initial(100, -5);
  timer = LapTimes.crossFinish(timer, .5, 100, 100, 0).state;
  timer = LapTimes.advance(timer, 0, 80, 2000, 100).state;
  const finished = LapTimes.completeRoute(timer, .8, 500);
  assert.equal(finished.events[0].type, "lap");
  assert.equal(finished.state.running, false);
});

test("classic and rainbow records do not overwrite each other", () => {
  const data = new Map();
  const storage = { getItem: k => data.get(k) || null, setItem: (k,v) => data.set(k,v) };
  LapTimes.createStore(Layout, storage).record(18000, [4000, 9000, 13000]);
  LapTimes.createStore(Layout.SPRINT, storage).record(32000, [8000, 16000, 24000]);
  assert.equal(LapTimes.createStore(Layout, storage).top()[0].ms, 18000);
  assert.equal(LapTimes.createStore(Layout.SPRINT, storage).top()[0].ms, 32000);
  assert.equal(data.size, 2);
});
