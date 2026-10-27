"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const timing = require("../games/gcv/lap-times.js");
const track = require("../games/gcv/track-progress.js");
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

test("GCV lap records start fresh while older local scores remain untouched", () => {
  const storage = memoryStorage();
  const previousKey = "gmr:v1:gcv:lap-records";
  const oldValue = JSON.stringify({ circuit: timing.circuitKey(layout), records: [
    { ms: 85000, splits: [20000, 40000, 60000] },
  ] });
  storage.setItem(previousKey, oldValue);
  assert.notEqual(timing.STORAGE_KEY, previousKey);
  assert.deepEqual(timing.createStore(layout, storage).top(), []);
  assert.equal(storage.getItem(previousKey), oldValue);
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
  // The sample index alone cannot start the clock.
  const ignored = timing.advance(warmup.state, 835, 845, 100, 840);
  assert.deepEqual(ignored.events, []);
  const line = timing.crossFinish(ignored.state, 0.5, 100, 840, 840);
  assert.deepEqual(line.events.map((event) => event.type), ["start"]);
  assert.equal(line.state.running, true);
  assert.ok(Math.abs(line.state.elapsedMs - 50) < 1e-8);
});

test("three split checkpoints then finish yield exactly one valid full lap", () => {
  let state = timing.initial(840, 110);
  state = timing.crossFinish(state, 0.5, 100, 840, 840).state;
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
  const finished = timing.crossFinish(state, 0.5, 4000, 840);
  events.push(...finished.events);
  state = finished.state;
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
  const restored = timing.restore(saved, 840, 1190);
  for (const key of Object.keys(saved)) assert.deepEqual(restored[key], saved[key]);
  assert.equal(timing.restore(saved, 840, 1740).running, false);
});

test("invalid partial or malformed lap records are rejected", () => {
  const store = timing.createStore(layout, memoryStorage());
  assert.equal(store.record(1500, [1000, 500, 1250]), false);
  assert.equal(store.record(-4, [100, 200, 300]), false);
  assert.equal(store.top().length, 0);
});

test("physical finish crossing starts the stopwatch despite skipped sample indexes", () => {
  const line = { x: 78, z: -10 };
  const forward = { x: 0, z: -1 };
  // At speed the vehicle crosses the whole painted strip in one frame.
  const fraction = track.finishCrossing(
    { x: 78, z: 1.2 }, { x: 78, z: -14.8 }, line, forward, 15);
  assert.ok(Math.abs(fraction - 0.7) < 1e-8);
  const waiting = timing.initial(840, 820);
  // A missed or delayed sample index no longer decides if the stopwatch starts.
  const noIndexCrossing = timing.advance(waiting, 825, 827, 100, 840, null, false);
  assert.equal(noIndexCrossing.state.running, false);
  const started = timing.crossFinish(noIndexCrossing.state, fraction, 100, 840, 840);
  assert.deepEqual(started.events.map((e) => e.type), ["start"]);
  assert.equal(started.state.running, true);
  assert.ok(Math.abs(started.state.elapsedMs - 30) < 1e-8);
  assert.equal(started.state.startAt, 840);
});

test("crossing backwards or outside the finish road width cannot start the clock", () => {
  const line = { x: 78, z: -10 }, forward = { x: 0, z: -1 };
  assert.equal(track.finishCrossing(
    { x: 78, z: -20 }, { x: 78, z: 8 }, line, forward, 15), null);
  assert.equal(track.finishCrossing(
    { x: 105, z: 5 }, { x: 105, z: -15 }, line, forward, 15), null);
  assert.equal(track.finishCrossing(
    { x: 78, z: -12 }, { x: 78, z: -17 }, line, forward, 15), null);
  assert.equal(track.finishCrossing(
    { x: 78, z: 2 }, { x: 78, z: 1 }, line, forward, 15), null);
});

test("crossing near the outer dirt shoulder counts if the vehicle stays on the road", () => {
  const fraction = track.finishCrossing(
    { x: 92, z: -4 }, { x: 92, z: -16 },
    { x: 78, z: -10 }, { x: 0, z: -1 }, 15);
  assert.equal(fraction, 0.5);
  assert.equal(track.finishCrossing(
    { x: 94, z: -4 }, { x: 94, z: -16 },
    { x: 78, z: -10 }, { x: 0, z: -1 }, 15), null);
});

test("valid physical crossing completes a timed lap without an index-triggered finish", () => {
  const running = {
    running: true, startAt: 840, elapsedMs: 72000,
    splits: [17000, 36000, 54000], delta: -300, splitNumber: 3,
  };
  const noIndexFinish = timing.advance(
    running, 1674, 1676, 100, 840, null, false);
  assert.equal(noIndexFinish.events.length, 0);
  const finished = timing.crossFinish(noIndexFinish.state, 0.25, 100, 840);
  const lap = finished.events.find((event) => event.type === "lap");
  assert.ok(lap);
  assert.ok(Math.abs(lap.ms - 72025) < 1e-8);
  assert.deepEqual(lap.splits, running.splits);
  assert.equal(finished.state.startAt, 1680);
  assert.ok(Math.abs(finished.state.elapsedMs - 75) < 1e-8);
});

test("touching the finish line without three sectors never earns a record", () => {
  const incomplete = {
    running: true, startAt: 840, elapsedMs: 3000,
    splits: [1000], delta: null, splitNumber: 1,
  };
  const result = timing.crossFinish(incomplete, 0.5, 100, 840);
  assert.equal(result.events.length, 0);
  assert.equal(result.state.startAt, 1680);
  assert.equal(result.state.splits.length, 0);
});

test("fall adds time to the active lap without erasing previously reached sectors", () => {
  const inProgress = {
    running: true, startAt: 840, elapsedMs: 57500,
    splits: [17000, 36000], delta: 900, splitNumber: 2,
  };
  const afterFall = timing.elapse(inProgress, 2000);
  assert.equal(afterFall.elapsedMs, 59500);
  assert.deepEqual(afterFall.splits, [17000, 36000]);
  assert.equal(afterFall.startAt, 840);
  assert.equal(afterFall.splitNumber, 2);
  assert.equal(afterFall.delta, 900);
  assert.equal(inProgress.elapsedMs, 57500, "fall must not mutate saved state");
  const resumed = timing.advance(afterFall, 1469, 1471, 100, 840, null, false);
  assert.equal(resumed.events[0].type, "split");
  assert.ok(resumed.state.splits[2] > 59500);
});

test("the fall penalty is naturally included in the completed lap time", () => {
  const before = { running: true, startAt: 840, elapsedMs: 76000,
    splits: [19000, 40000, 60000], delta: -700, splitNumber: 3 };
  const after = timing.elapse(before, 2000);
  // Just like the game frame: first advance the running timer, then adjust
  // the finish time to the precise fraction of the frame.
  const activeFrame = timing.advance(after, 1675, 1677, 100, 840, null, false);
  const finished = timing.crossFinish(activeFrame.state, 0.5, 100, 840);
  const lap = finished.events.find((event) => event.type === "lap");
  assert.ok(lap);
  assert.equal(lap.ms, 78050);
  assert.deepEqual(lap.splits, before.splits);
});

test("the falling timer remains paused before the first finish crossing", () => {
  const waiting = timing.initial(840, 500);
  assert.strictEqual(timing.elapse(waiting, 2000), waiting);
  assert.equal(waiting.elapsedMs, 0);
  assert.equal(waiting.running, false);
});

test("a lap timer survived by save/restore includes time elapsed while falling", () => {
  const started = { running: true, startAt: 840, elapsedMs: 23000,
    splits: [16000], delta: -300, splitNumber: 1 };
  const falling = timing.elapse(started, 2000);
  const persisted = JSON.parse(JSON.stringify(falling));
  const resumed = timing.restore(persisted, 840, 1200);
  assert.equal(resumed.elapsedMs, 25000);
  assert.deepEqual(resumed.splits, started.splits);
  assert.equal(resumed.delta, -300);
});

test("completed lap ranks as first, second or third before saving the time", () => {
  const store = timing.createStore(layout, memoryStorage());
  assert.equal(timing.qualifyingRank(store.top(), 45000), 1);
  store.record(50000, [10000, 20000, 35000]);
  assert.equal(timing.qualifyingRank(store.top(), 42000), 1);
  assert.equal(timing.qualifyingRank(store.top(), 56000), 2);
  store.record(45000, [11000, 23000, 34000]);
  assert.equal(timing.qualifyingRank(store.top(), 47000), 2);
  store.record(65000, [19000, 34000, 50000]);
  assert.equal(timing.qualifyingRank(store.top(), 60000), 3);
  assert.equal(timing.qualifyingRank(store.top(), 71000), null);
  assert.equal(timing.qualifyingRank(store.top(), -15), null);
});

test("after recording the new fastest lap, the top three are ordered", () => {
  const store = timing.createStore(layout, memoryStorage());
  for (const ms of [51000, 54000, 58000]) {
    store.record(ms, [ms * .25, ms * .5, ms * .75]);
  }
  const rank = timing.qualifyingRank(store.top(), 50000);
  assert.equal(rank, 1);
  store.record(50000, [12500, 25000, 37500]);
  assert.deepEqual(store.top().map((entry) => entry.ms), [50000, 51000, 54000]);
});

test("widening only the shoulders migrates the old three best lap records", () => {
  const storage = memoryStorage();
  const formerLayout = { ...layout, SHOULDER_WIDTH: 6 };
  const previousStore = timing.createStore(formerLayout, storage);
  previousStore.record(62000, [15000, 30000, 48000]);
  previousStore.record(61000, [14000, 30000, 45000]);
  assert.ok(timing.sameCircuitRoute(timing.circuitKey(formerLayout),
    timing.circuitKey(layout)));
  assert.notEqual(timing.circuitKey(formerLayout), timing.circuitKey(layout));
  assert.deepEqual(timing.createStore(layout, storage).top()
    .map((record) => record.ms), [61000, 62000]);
  assert.deepEqual(timing.createStore(layout, storage).top()
    .map((record) => record.ms), [61000, 62000]);
});

test("track shape or finish changes are not compatible with old records", () => {
  const currentKey = timing.circuitKey(layout);
  assert.equal(timing.sameCircuitRoute(null, currentKey), false);
  assert.equal(timing.sameCircuitRoute("bad json", currentKey), false);
  assert.equal(timing.sameCircuitRoute(currentKey, currentKey), true);
  assert.equal(timing.sameCircuitRoute(
    timing.circuitKey({ ...layout, ROAD_HALF_WIDTH: 8 }), currentKey), false);
  assert.equal(timing.sameCircuitRoute(
    timing.circuitKey({ ...layout, FINISH: { x: 78, z: 0 } }), currentKey), false);
});

test("reducing shoulders from ten to seven preserves the prior records", () => {
  const storage = memoryStorage();
  const wideLayout = { ...layout, SHOULDER_WIDTH: 10 };
  const oldStore = timing.createStore(wideLayout, storage);
  oldStore.record(58500, [12000, 28000, 43000]);
  oldStore.record(54100, [11000, 26000, 41000]);
  assert.ok(timing.sameCircuitRoute(timing.circuitKey(wideLayout),
    timing.circuitKey(layout)));
  const newStore = timing.createStore(layout, storage);
  assert.deepEqual(newStore.top().map((r) => r.ms), [54100, 58500]);
  assert.deepEqual(timing.createStore(layout, storage).top()
    .map((r) => r.ms), [54100, 58500]);
});
