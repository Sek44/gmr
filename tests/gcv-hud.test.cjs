"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Hud = require("../games/gcv/hud.js");

class FakeClassList {
  constructor(owner) { this.owner = owner; this.values = new Set(); }
  contains(name) { return this.values.has(name); }
  add(name) {
    if (!this.values.has(name)) {
      this.owner.writes++;
      this.values.add(name);
    }
  }
  toggle(name, force) {
    this.owner.writes++;
    if (force === undefined) force = !this.values.has(name);
    if (force) this.values.add(name);
    else this.values.delete(name);
    return force;
  }
}

class FakeNode {
  constructor(initial = "") {
    this.writes = 0;
    this._text = initial;
    this._hidden = false;
    this._title = "";
    this.attrs = new Map();
    this.children = [];
    this.firstChild = null;
    this.style = {};
    this.classList = new FakeClassList(this);
  }
  get textContent() { return this._text; }
  set textContent(value) { this.writes++; this._text = String(value); }
  get hidden() { return this._hidden; }
  set hidden(value) { this.writes++; this._hidden = Boolean(value); }
  get title() { return this._title; }
  set title(value) { this.writes++; this._title = String(value); }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  setAttribute(name, value) { this.writes++; this.attrs.set(name, String(value)); }
  append(...nodes) { this.children.push(...nodes); this.writes++; }
  replaceChildren(...nodes) { this.children = nodes; this.writes++; }
}

function setup(closed = true) {
  const nodes = new Map();
  const get = (id) => {
    if (!nodes.has(id)) nodes.set(id, new FakeNode());
    return nodes.get(id);
  };
  get("lap-count-label").firstChild = new FakeNode();
  const bestTitle = new FakeNode();
  const document = {
    getElementById: get,
    querySelector(selector) {
      return selector === ".gcv-bests-title" ? bestTitle : null;
    },
    createDocumentFragment: () => new FakeNode(),
    createElement: () => new FakeNode(),
    createTextNode: (value) => new FakeNode(value),
  };
  const LapTimes = {
    format: (ms) => (ms / 1000).toFixed(2) + " s",
    formatDelta: (ms) => ms === null ? "—" : String(ms),
  };
  const Race = {
    LAPS: 3, GRID_COUNT: 10,
    position: (state) => state.position,
    currentLap: (state) => state.currentLap,
    classification: (state) => state.classification ?? [],
    opponentNumber: () => 1,
  };
  const hud = Hud.create({
    document, LapTimes, Race, layout: { CLOSED: closed },
  });
  function writes() {
    return [...nodes.values()].reduce((sum, node) =>
      sum + node.writes + (node.firstChild?.writes || 0), 0) +
      bestTitle.writes;
  }
  return { hud, get, nodes, writes, bestTitle };
}

test("speed and gear only mutate DOM when the visible value changes", () => {
  const { hud, get, writes } = setup();
  hud.setSpeed(10);
  const baseline = writes();
  for (let i = 0; i < 180; i++) hud.setSpeed(10 + i * 0.00001);
  assert.equal(writes(), baseline, "unrounded speed changes must not rewrite DOM");
  assert.equal(get("speed-value").textContent, "36");
  hud.setSpeed(-10);
  assert.equal(get("gear-value").textContent, "R");
  assert.ok(writes() > baseline);
  const reversed = writes();
  hud.setSpeed(-10);
  assert.equal(writes(), reversed);
  hud.setSpeed(0);
  assert.equal(get("gear-value").textContent, "");
});

test("chrono updates retain time, delta, hold and style while suppressing duplicate writes", () => {
  const { hud, get, writes } = setup();
  const timer = { running: true, finished: false, elapsedMs: 12345,
    delta: -20, splitNumber: 2 };
  hud.refreshChrono(timer, null);
  const baseline = writes();
  for (let i = 0; i < 100; i++) hud.refreshChrono(timer, null);
  assert.equal(writes(), baseline, "identical HUD snapshots must not touch DOM");
  assert.equal(get("lap-chrono").textContent, "12.35 s");
  assert.equal(get("lap-split-label").textContent, "S2");
  assert.equal(get("lap-delta-value").textContent, "-20");
  assert.ok(get("lap-delta").classList.contains("is-faster"));
  hud.refreshChrono(timer, { ms: 22333, rank: 2 });
  assert.equal(get("lap-chrono").textContent, "22.33 s");
  assert.equal(get("lap-chrono-title").textContent, "TOUR TERMINÉ");
  assert.equal(get("lap-chrono-rank").textContent, "2e meilleur temps");
  assert.ok(get("lap-chrono-box").classList.contains("is-lap-hold"));
  assert.equal(get("lap-chrono-rank").hidden, false);
  timer.delta = 35;
  hud.refreshChrono(timer, null);
  assert.equal(get("lap-chrono-rank").hidden, true);
  assert.ok(get("lap-delta").classList.contains("is-slower"));
  assert.equal(get("lap-delta").classList.contains("is-faster"), false);
  timer.delta = 0;
  hud.refreshChrono(timer, null);
  assert.ok(get("lap-delta").classList.contains("is-even"));
});

test("free driving and race labels preserve transitions without frame-by-frame mutations", () => {
  const { hud, get, writes } = setup(false);
  const free = { gameMode: "free", raceState: null, lapCount: 0,
    lapHold: null, refreshResults: false };
  hud.syncRace(free);
  const baseline = writes();
  for (let i = 0; i < 200; i++) hud.syncRace(free);
  assert.equal(writes(), baseline);
  assert.equal(get("session-mode-label").textContent, "Essais libres · N° 9");
  assert.equal(get("lap-count-label").firstChild.textContent,
    "Parcours terminés : ");

  const state = { position: 3, currentLap: 1, phase: "staging", countdown: 3,
    opponents: [] };
  const input = { ...free, gameMode: "race", raceState: state, refreshResults: false };
  hud.syncRace(input);
  assert.equal(get("race-overlay-title").textContent, "Prépare-toi !");
  const staging = writes();
  hud.syncRace(input);
  assert.equal(writes(), staging);
  state.phase = "countdown";
  hud.syncRace(input);
  assert.equal(get("race-overlay-title").textContent, "3");
  assert.equal(get("race-overlay").hidden, false);
  state.countdown = 2.2;
  hud.syncRace(input);
  assert.equal(get("race-overlay-title").textContent, "3",
    "displayed countdown must use the original ceiling behavior");
  state.countdown = 1.2;
  hud.syncRace(input);
  assert.equal(get("race-overlay-title").textContent, "2");
  state.phase = "racing";
  hud.syncRace(input);
  assert.equal(get("race-overlay").hidden, true);
  state.phase = "finished";
  state.raceTime = 21.3;
  hud.syncRace(input);
  assert.equal(get("race-overlay-title").textContent, "Arrivée !");
  assert.equal(get("race-overlay").hidden, false);
  hud.syncRace(free);
  assert.equal(get("race-overlay").hidden, true);
});

test("bests, lap count, and pending race results remain visible", () => {
  const { hud, get, writes } = setup();
  const records = [{ ms: 17000 }, { ms: 19000 }];
  hud.refreshBests(records);
  hud.setLapCount(2);
  const baseline = writes();
  hud.refreshBests(records);
  hud.setLapCount(2);
  assert.equal(writes(), baseline);
  assert.equal(get("best-lap-1").textContent, "17.00 s");
  assert.equal(get("best-lap-3").textContent, "—");
  assert.equal(get("lap-value").textContent, "2");
  const state = { position: 1, currentLap: 3, phase: "finished", raceTime: 32.5,
    opponents: [{ id: "ai1", color: 0xff0000 }], classification: [
      { id: "player", rank: 1, finishTime: 32.5, gap: 0 },
      { id: "ai1", rank: 2, finishTime: null, gap: null },
    ] };
  assert.equal(hud.syncRace({ gameMode: "race", raceState: state,
    lapCount: 3, lapHold: null, refreshResults: true }), true);
  assert.equal(get("race-results-status").textContent,
    "1 / 10 voitures à l’arrivée · les autres poursuivent la course.");
  assert.equal(get("race-results-body").children.length, 1);
});

test("game refreshes normal chrono once after the simulation and lap-hold updates", () => {
  const game = fs.readFileSync(path.join(__dirname, "../games/gcv/game.js"), "utf8");
  const carFunction = game.slice(game.indexOf("    function updateCar("),
    game.indexOf("    let frameId =", game.indexOf("    function updateCar(")));
  const frameFunction = game.slice(game.indexOf("    function frame(now)"),
    game.indexOf("    drawMap();\n    updateCar(0);",
      game.indexOf("    function frame(now)")));
  assert.doesNotMatch(carFunction, /refreshChrono\(\)/);
  assert.match(frameFunction, /updateCar\(dt, realDt\);[\s\S]*tickLapHold\(realDt\);[\s\S]*refreshChrono\(\)/);
  assert.equal((frameFunction.match(/refreshChrono\(\)/g) || []).length, 1);
});
