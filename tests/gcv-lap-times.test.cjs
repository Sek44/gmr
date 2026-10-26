"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const timing = require("../games/gcv/lap-times.js");
const layout = require("../games/gcv/track-layout.js");

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("top three lap times sort ascending and persist with reference splits", () => {
  const storage = memoryStorage();
  const store = timing.createStore(layout, storage);
  assert.deepEqual(store.top(), []);
  const splitsFor = (ms) => [ms * 0.25, ms * 0.5, ms * 0.75];
  for (const lap of [100000, 89000, 103000, 92000, 87000]) {
    assert.equal(store.record(lap, splitsFor(lap)), true);
  }
  assert.deepEqual(store.top().map((r) => r.ms), [87000, 89000, 92000]);
  assert.equal(store.best().splits[1], 43500);
  assert.deepEqual(timing.createStore(layout, storage).top().map((r) => r.ms),
    [87000, 89000, 92000]);
});

test("a circuit geometry change resets existing lap records automatically", () => {
  const storage = memoryStorage();
  const store = timing.createStore(layout, storage);
  store.record(95000, [24000, 48000, 71000]);
  const other = {
    ...layout,
    WAYPOINTS: layout.WAYPOINTS.map((point, index) =>
      index === 3 ? [point[0] + 5, point[1]] : point),
  };
  assert.notEqual(timing.circuitKey(other), timing.circuitKey(layout));
  assert.deepEqual(timing.createStore(other, storage).top(), []);
  assert.deepEqual(timing.createStore(layout, storage).top(), [],
    "old records must not be resurrected after a layout update");
});

test("changed track width and finish marker reset records as well", () => {
  const storage = memoryStorage();
  timing.createStore(layout, storage).record(90000, [25000, 50000, 70000]);
  assert.deepEqual(timing.createStore({ ...layout, ROAD_HALF_WIDTH: 11 }, storage).top(), []);
  assert.deepEqual(timing.createStore({ ...layout, FINISH: { x: 78, z: -20 } }, storage).top(), []);
});

test("formatting supports minutes, hundredths and signed splits", () => {
  assert.equal(timing.format(86543), "01:26.54");
  assert.equal(timing.format(9450), "00:09.45");
  assert.equal(timing.format(0), "00:00.00");
  assert.equal(timing.formatDelta(-2325), "−2.33 s");
  assert.equal(timing.formatDelta(1240), "+1.24 s");
  assert.equal(timing.formatDelta(null), "—");
});

test("first crossing starts timer without counting partial warmup as a lap", () => {
  let timer = timing.initial(840, 110);
  const warmup = timing.advance(timer, 800, 820, 1000, 840);
  assert.equal(warmup.events.length, 0);
  const line = timing.advance(warmup.state, 835, 845, 100, 840);
  assert.deepEqual(line.events.map((event) => event.type), ["start"]);
  assert.equal(line.state.running, true);
  assert.ok(Math.abs(line.state.elapsedMs - 50) < 1e-8);
});

test("three split checkpoints then finish yield exactly one valid full lap", () => {
  let state = timing.initial(840, 110);
  state = timing.advance(state, 839, 841, 100, 840).state;
  assert.equal(state.running, true);
  const reference = { splits: [21000, 46000, 69000] };
  let previous = 841;
  const events = [];
  for (const next of [950, 1050, 1051, 1250, 1261, 1450, 1470, 1660, 1682]) {
    const changed = timing.advance(state, previous, next, 4000, 840, reference);
    state = changed.state;
    events.push(...changed.events);
    previous = next;
  }
  assert.deepEqual(events.map((event) => event.type), ["split", "split", "split", "lap"]);
  assert.deepEqual(events.filter((e) => e.type === "split").map((e) => e.index), [0, 1, 2]);
  const lap = events.find((event) => event.type === "lap");
  assert.ok(lap.ms > lap.splits[2]);
  assert.equal(lap.splits.length, 3);
  assert.equal(state.running, true);
  assert.equal(state.splits.length, 0);
});

test("intermediate comparison is green when faster and red when slower", () => {
  const initial = { running: true, startAt: 840, elapsedMs: 18000,
    splits: [], splitNumber: 0, delta: null };
  const fast = timing.advance(initial, 1049, 1051, 100, 840,
    { splits: [25000, 50000, 75000] });
  assert.equal(fast.events[0].type, "split");
  assert.ok(fast.state.delta < 0);
  const slow = timing.advance({ ...initial, elapsedMs: 29000 }, 1049, 1051,
    100, 840, { splits: [25000, 50000, 75000] });
  assert.ok(slow.state.delta > 0);
});

test("backward crossings do not create a lap, and fall resets pending sectors", () => {
  let state = { running: true, startAt: 840, elapsedMs: 20000,
    splits: [15000], delta: null, splitNumber: 1 };
  const reverse = timing.advance(state, 1240, 1130, 1000, 840);
  assert.equal(reverse.events.length, 0);
  assert.equal(reverse.state.splits.length, 1);
  const afterFall = timing.initial(840, 1240);
  assert.equal(afterFall.running, false);
  assert.equal(afterFall.startAt, 1680);
});

test("running timer can be restored after a page refresh", () => {
  const saved = { running: true, startAt: 840, elapsedMs: 35000,
    splits: [19000], delta: -1500, splitNumber: 1 };
  assert.deepEqual(timing.restore(saved, 840, 1190), saved);
  assert.equal(timing.restore(saved, 840, 1740).running, false);
});

test("invalid partial or malformed lap records are rejected", () => {
  const store = timing.createStore(layout, memoryStorage());
  assert.equal(store.record(1500, [1000, 500, 1250]), false);
  assert.equal(store.record(-4, [100, 200, 300]), false);
  assert.equal(store.top().length, 0);
});
