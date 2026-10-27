"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Controls = require("../games/gcv/controls.js");
const Hud = require("../games/gcv/hud.js");
const MiniMap = require("../games/gcv/mini-map.js");
const root = path.join(__dirname, "../games/gcv");

test("controls, HUD and map scripts load before the GCV entry point", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const files = ["visual-effects.js", "controls.js", "hud.js", "mini-map.js", "game.js"];
  const positions = files.map((name) => html.indexOf('src="./' + name + '"'));
  assert.ok(positions.every((p) => p >= 0));
  assert.ok(positions.every((p, i) => i === 0 || p > positions[i - 1]));
  for (const name of files) {
    const source = fs.readFileSync(path.join(root, name), "utf8");
    assert.doesNotThrow(() => new vm.Script(source), name);
  }
  const sandbox = { window: {} };
  for (const name of files.slice(1, -1)) {
    vm.runInNewContext(fs.readFileSync(path.join(root, name), "utf8"), sandbox);
  }
  for (const key of ["GcvControls", "GcvHud", "GcvMiniMap"])
    assert.equal(typeof sandbox.window[key].create, "function");
});

function element() {
  const listeners = {};
  const classes = new Set();
  return {
    listeners, style: {}, hidden: false, textContent: "", firstChild: { textContent: "" },
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      toggle: (name, value) => value ? classes.add(name) : classes.delete(name),
      contains: (name) => classes.has(name),
    },
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
    fire(name, event = {}) { for (const fn of listeners[name] || []) fn(event); },
    setAttribute(name, value) { this[name] = value; },
    getBoundingClientRect() { return { left: 10, width: 100 }; },
    setPointerCapture() {}, append() {}, replaceChildren(...children) { this.children = children; },
  };
}

test("steering prioritizes the captured pointer, then returns to the keyboard", () => {
  const win = element(), doc = element(), pad = element(), knob = element();
  const controls = Controls.create({
    window: win, document: doc, stage: element(), pad, knob,
    gasButton: element(), brakeButton: element(),
  });
  const keyboard = (key, type = "keydown") =>
    win.fire(type, { key, preventDefault() {}, altKey: false, ctrlKey: false, metaKey: false });
  keyboard("ArrowRight");
  assert.equal(controls.read().steer, 1);
  assert.equal(knob.style.left, "93%");
  pad.fire("pointerdown", { pointerId: 1, pointerType: "touch", clientX: 10, preventDefault() {} });
  assert.equal(controls.read().steer, -1);
  assert.equal(pad["aria-valuetext"], "Gauche");
  pad.fire("pointermove", { pointerId: 1, clientX: 60 });
  assert.equal(controls.read().steer, 0);
  pad.fire("pointerup", { pointerId: 1 });
  assert.equal(controls.read().steer, 1);
  keyboard("ArrowRight", "keyup");
  assert.equal(controls.read().steer, 0);
});

test("pedals remain active with multiple pointers, and blur/visibility clears everything", () => {
  const win = element(), doc = element(), gas = element(), brake = element();
  const controls = Controls.create({
    window: win, document: doc, stage: element(), pad: element(),
    knob: element(), gasButton: gas, brakeButton: brake,
  });
  for (const id of [10, 11]) gas.fire("pointerdown", { pointerId: id, pointerType: "touch", preventDefault() {} });
  brake.fire("pointerdown", { pointerId: 20, pointerType: "touch", preventDefault() {} });
  assert.equal(controls.read().accelerate, true);
  assert.equal(controls.isBraking(), true);
  gas.fire("pointerup", { pointerId: 10 });
  assert.equal(controls.read().accelerate, true);
  gas.fire("pointercancel", { pointerId: 11 });
  assert.equal(controls.read().accelerate, false);
  win.fire("keydown", { key: "w", preventDefault() {} });
  win.fire("blur");
  assert.deepEqual(controls.read(), { steer: 0, accelerate: false, brake: false });
  assert.equal(brake.classList.contains("is-active"), false);
  win.fire("keydown", { key: "s", preventDefault() {} });
  doc.hidden = true;
  doc.fire("visibilitychange");
  assert.equal(controls.isBraking(), false);
});

test("HUD updates chrono, lap records and race result table without owning race state", () => {
  const elements = {};
  const document = {
    getElementById(id) { return elements[id] ||= element(); },
    createElement() { return element(); },
    createTextNode(value) { return { textContent: value }; },
    createDocumentFragment() { return element(); },
  };
  const HudClock = { format: (ms) => "t=" + ms, formatDelta: (ms) => "d=" + ms };
  const Race = {
    GRID_COUNT: 10, LAPS: 3, position: () => 2, currentLap: () => 3,
    classification: () => [
      { id: 1, rank: 1, finishTime: 10, gap: 0 },
      { id: "player", rank: 2, finishTime: 12, gap: 2 },
    ],
    opponentNumber: (id) => id,
  };
  const hud = Hud.create({ document, LapTimes: HudClock, Race });
  hud.refreshBests([{ ms: 5000 }]);
  assert.equal(elements["best-lap-1"].textContent, "t=5000");
  assert.equal(elements["best-lap-3"].textContent, "—");
  hud.refreshChrono({ running: true, elapsedMs: 2000, delta: -40, splitNumber: 2 }, { ms: 1500, rank: 1 });
  assert.equal(elements["lap-chrono"].textContent, "t=1500");
  assert.equal(elements["lap-chrono-rank"].hidden, false);
  assert.equal(elements["lap-chrono-box"].classList.contains("is-lap-hold"), true);
  assert.equal(elements["lap-delta"].classList.contains("is-faster"), true);
  hud.refreshChrono({ running: true, elapsedMs: 2500, delta: 0, splitNumber: 3 }, null);
  assert.equal(elements["lap-chrono"].textContent, "t=2500");
  assert.equal(elements["lap-chrono-box"].classList.contains("is-lap-hold"), false);
  hud.setSpeed(-10);
  assert.equal(elements["speed-value"].textContent, "36");
  assert.equal(elements["gear-value"].textContent, "R");
  hud.setLapCount(2);
  assert.equal(elements["lap-value"].textContent, "2");
  assert.equal(hud.syncRace({ gameMode: "free", raceState: null, lapCount: 2, lapHold: null, refreshResults: true }), false);
  const raceState = { phase: "finished", raceTime: 12, opponents: [{ id: 1, color: 0x00ffaa }] };
  assert.equal(hud.syncRace({ gameMode: "race", raceState, lapCount: 3, lapHold: null, refreshResults: true }), true);
  assert.equal(elements["race-results"].hidden, false);
  assert.equal(elements["position-value"].textContent, "2ᵉ");
  assert.equal(elements["lap-value"].textContent, "3");
  assert.equal(elements["race-results-status"].textContent.includes("2 / 10"), true);
  assert.equal(hud.syncRace({ gameMode: "race", raceState, lapCount: 3, lapHold: null, refreshResults: false }), false);
});

test("mini-map caches the landscape but redraws live vehicles", () => {
  const draws = { background: 0, player: 0, opponent: 0 };
  const context = () => ({
    createLinearGradient: () => ({ addColorStop() {} }),
    beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {},
    closePath() {}, save() {}, restore() {}, translate() {}, rotate() {},
    fillRect() {}, fillText() {}, strokeText() {}, clearRect() {},
    drawImage() { draws.background++; },
  });
  const visibleCanvas = { width: 320, height: 248, getContext: context };
  const doc = { createElement: () => ({ width: 0, height: 0, getContext: context }) };
  const positions = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }];
  const sides = positions.map(() => ({ x: 1, z: 0 }));
  const minimap = MiniMap.create({
    document: doc, canvas: visibleCanvas, positions, sides,
    SAMPLE_COUNT: 4, ROAD_HALF_WIDTH: 3, OUTER_HALF_WIDTH: 7,
    islands: [], LapTimes: { SPLIT_FRACTIONS: [0.25, 0.5, 0.75] },
    startIndex: 0, startCenter: positions[0], startSide: sides[0],
  });
  minimap.draw({ x: 2, z: 3, yaw: 0 }, [], new Map());
  minimap.draw({ x: 5, z: 6, yaw: Math.PI }, [{ id: 1, color: 0xff0000 }],
    new Map([[1, { position: { x: 7, z: 8 } }]]));
  assert.equal(draws.background, 2);
});
