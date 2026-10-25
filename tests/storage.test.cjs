"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function environment() {
  const map = new Map();
  const storage = {
    getItem: (key) => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
  const listeners = new Map();
  const docListeners = new Map();
  function add(target, name, callback) {
    const list = target.get(name) || [];
    list.push(callback);
    target.set(name, list);
  }
  function remove(target, name, callback) {
    target.set(name, (target.get(name) || []).filter((item) => item !== callback));
  }
  const window = {
    addEventListener: (name, fn) => add(listeners, name, fn),
    removeEventListener: (name, fn) => remove(listeners, name, fn),
  };
  const document = {
    hidden: false,
    addEventListener: (name, fn) => add(docListeners, name, fn),
    removeEventListener: (name, fn) => remove(docListeners, name, fn),
  };
  const context = vm.createContext({ window, localStorage: storage, document, Date, Math });
  for (const name of ["game-state.js", "scores.js", "game-ui.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "shared", name), "utf8"), context);
  }
  return { window, storage, listeners, docListeners, document, map };
}

test("game state is namespaced, versioned and restored", () => {
  const { window, map } = environment();
  const a = window.GameState.create("memory");
  const b = window.GameState.create("puzzle");
  assert.equal(a.load(), null);
  assert.equal(a.save({ level: 4 }), true);
  assert.equal(a.load().level, 4);
  assert.equal(b.load(), null);
  assert.equal(map.get("gmr:v1:state:memory").includes('"version":1'), true);
  map.set(a.key, '{"version":2,"session":{"level":99}}');
  assert.equal(a.load(), null);
});

test("autosave after change, navigation and hide; discard prevents accidental resave", () => {
  const { window, document, listeners, docListeners } = environment();
  const store = window.GameState.create("memory");
  let value = 0;
  const tracker = store.bind({ snapshot: () => ({ value }), restore: (snapshot) => { value = snapshot.value; } });
  value = 7;
  tracker.changed();
  assert.equal(store.load().value, 7);
  value = 8;
  for (const callback of listeners.get("pagehide")) callback();
  assert.equal(store.load().value, 8);
  value = 9;
  document.hidden = true;
  for (const callback of docListeners.get("visibilitychange")) callback();
  assert.equal(store.load().value, 9);
  tracker.stop({ discard: true });
  assert.equal(store.load(), null);
  for (const callback of listeners.get("pagehide")) callback();
  assert.equal(store.load(), null);
});

test("scores persist per game and a stale delete does not erase another record", () => {
  const { window, map } = environment();
  window.GmrCatalog = { games: [] };
  const scores = window.GameScores;
  assert.equal(scores.save({ gameId: "memory", score: 3 }), true);
  assert.equal(scores.save({ gameId: "puzzle", score: 5, total: 10 }), true);
  const oldRecord = scores.read()[0];
  assert.equal(scores.read().length, 2);
  assert.equal(scores.save({ gameId: "memory", score: 9 }), true);
  assert.equal(scores.remove(oldRecord), false);
  assert.equal(scores.read().length, 3);
  const newest = scores.read()[0];
  assert.equal(scores.remove(newest), true);
  assert.equal(scores.read().length, 2);
  assert.equal(scores.save({ gameId: "memory", score: -1 }), false);
  assert.equal(map.has("exercices_francais_scores"), false);
});

test("invalid saved score JSON is never overwritten", () => {
  const { window, map } = environment();
  map.set("gmr:v1:scores", "{bad-json");
  assert.deepEqual(Array.from(window.GameScores.read()), []);
  assert.equal(window.GameScores.save({ gameId: "memory", score: 1 }), false);
  assert.equal(map.get("gmr:v1:scores"), "{bad-json");
});

test("numeric keyboard editing helper is reusable", () => {
  const { window } = environment();
  const edit = window.GameUI.editNumber;
  assert.equal(edit("12", "3", 2), "12");
  assert.equal(edit("12", "erase", 4), "1");
  assert.equal(edit("12", "clear", 4), "");
  assert.equal(edit("", "7", 2), "7");
});
