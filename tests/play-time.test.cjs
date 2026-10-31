"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const PlayTime = require("../shared/play-time.js");
function fixture() {
  const map = new Map();
  const storage = {
    getItem: (key) => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
  };
  let date = new Date(2026, 9, 31, 12, 0);
  const store = PlayTime.createStore(storage, () => date);
  function credit(minutes, day = "2026-10-31") {
    map.set(PlayTime.CREDIT_KEY, JSON.stringify({
      version: 1, date: day, points: minutes / 10, minutes, progress: {}, events: [],
    }));
  }
  return { map, storage, store, credit, setDate: (value) => { date = value; } };
}
test("xfr1 credit is read-only and shared usage is persistent", () => {
  const { map, storage, store, credit } = fixture();
  credit(10);
  const original = map.get(PlayTime.CREDIT_KEY);
  assert.equal(store.read().remainingMs, 600000);
  assert.equal(store.spend(8 * 60000).elapsedMs, 480000);
  const other = PlayTime.createStore(storage, () => new Date(2026, 9, 31, 12, 1));
  assert.equal(other.spend(5 * 60000).elapsedMs, 600000);
  assert.equal(store.read().allowed, false);
  assert.equal(store.spend(9000).elapsedMs, 600000);
  assert.equal(map.get(PlayTime.CREDIT_KEY), original);
  credit(20);
  assert.equal(store.read().remainingMs, 600000);
  assert.equal(other.spend(1000).elapsedMs, 601000);
});
test("day rollover resets usage and stale xfr1 credit is ignored", () => {
  const { map, store, credit, setDate } = fixture();
  credit(10);
  store.spend(25000);
  setDate(new Date(2026, 10, 1, 0, 0));
  assert.equal(store.read().elapsedMs, 0);
  assert.equal(store.read().minutes, 0);
  assert.equal(store.read().allowed, false);
  assert.equal(JSON.parse(map.get(PlayTime.USAGE_KEY)).date, "2026-11-01");
  credit(10, "2026-11-01");
  assert.equal(store.spend(1300).elapsedMs, 1300);
});
test("missing credit, malformed storage and unsupported versions fail closed", () => {
  const { map, store, credit } = fixture();
  assert.equal(store.read().allowed, false);
  credit(10);
  map.set(PlayTime.USAGE_KEY, "{invalid");
  assert.equal(store.spend(600).error, true);
  assert.equal(map.get(PlayTime.USAGE_KEY), "{invalid");
  map.delete(PlayTime.USAGE_KEY);
  map.set(PlayTime.CREDIT_KEY, '{"version":2,"date":"2026-10-31","minutes":20,"points":2}');
  assert.equal(store.read().allowed, false);
});
test("storage failure never grants unverified play", () => {
  const store = PlayTime.createStore({ getItem() { throw Error("blocked"); } });
  assert.equal(store.read().allowed, false);
  assert.equal(store.spend(5000).error, true);
});
