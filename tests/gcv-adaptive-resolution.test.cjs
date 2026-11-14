"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Adaptive = require("../games/gcv/adaptive-resolution.js");

function fixture() {
  const changes = [];
  const controller = Adaptive.create({ setScale: (scale) => changes.push(scale) });
  let time = 0;
  return {
    controller, changes,
    step(ms, count) {
      for (let i = 0; i < count; i++) {
        time += ms;
        controller.observe(time);
      }
    },
    inactive(milliseconds = 1000) {
      time += milliseconds;
      controller.observe(time, false);
    },
    sampleAt(timestamp) { controller.observe(timestamp); },
    get time() { return time; },
  };
}

test("adaptive rendering keeps full quality on a steady 60/120 Hz device", () => {
  for (const dt of [1000 / 60, 1000 / 120]) {
    const harness = fixture();
    harness.step(dt, Math.ceil(36000 / dt));
    assert.equal(harness.controller.scale, 1);
    assert.deepEqual(harness.changes, []);
  }
  assert.deepEqual(Adaptive.LEVELS, [1, 0.9, 0.8, 0.7, 0.6, 0.55]);
  assert.ok(Object.isFrozen(Adaptive.LEVELS));
});

test("tablet-like 30 FPS sustains enough bad frames to progressively reduce resolution", () => {
  const harness = fixture();
  harness.step(1000 / 33.5, 1000);
  assert.equal(harness.controller.scale, 0.55);
  assert.deepEqual(harness.changes, [0.9, 0.8, 0.7, 0.6, 0.55]);
  assert.ok(harness.controller.lastFps < 40);
  harness.step(1000 / 33.5, 400);
  assert.equal(harness.controller.scale, 0.55);
  assert.equal(harness.changes.length, 5);
});

test("mild slowdown requires two full sampling windows before a downgrade", () => {
  const harness = fixture();
  harness.step(1000 / 52, 145);
  assert.equal(harness.controller.scale, 1);
  harness.step(1000 / 52, 120);
  assert.equal(harness.controller.scale, 0.9);
  assert.deepEqual(harness.changes, [0.9]);
});

test("short frame spikes are not enough to downscale a largely smooth game", () => {
  const harness = fixture();
  for (let i = 0; i < 2700; i++) {
    harness.step(i % 100 === 0 ? 40 : 1000 / 60, 1);
  }
  assert.equal(harness.controller.scale, 1);
});

test("recovery is gradual, and failed upgrades revert with a long hold", () => {
  const harness = fixture();
  harness.step(1000 / 33.5, 980);
  assert.equal(harness.controller.scale, 0.55);
  harness.step(1000 / 60, 1300);
  assert.equal(harness.controller.scale, 0.6);
  assert.equal(harness.controller.evaluatingUpgrade, true);
  harness.step(1000 / 34, 250);
  assert.equal(harness.controller.scale, 0.55);
  assert.equal(harness.controller.evaluatingUpgrade, false);
  // The short recovery must not immediately undo a failed upgrade.
  harness.step(1000 / 60, 1600);
  assert.equal(harness.controller.scale, 0.55);
  harness.step(1000 / 60, 2600);
  assert.ok(harness.controller.scale >= 0.55);
  assert.ok(harness.controller.scale <= 0.6);
});

test("inactivity, huge pauses and explicit resets cannot count as slow frames", () => {
  const harness = fixture();
  harness.step(1000 / 52, 120);
  harness.inactive(15000);
  harness.step(1000 / 60, 320);
  assert.equal(harness.controller.scale, 1);
  harness.sampleAt(harness.time + 5000);
  harness.step(1000 / 60, 300);
  assert.equal(harness.controller.scale, 1);
  harness.controller.reset();
  harness.step(1000 / 60, 120);
  assert.equal(harness.controller.scale, 1);
});

test("invalid input never changes quality and module requires callback", () => {
  assert.throws(() => Adaptive.create({}), TypeError);
  const harness = fixture();
  harness.sampleAt(Infinity);
  harness.sampleAt(-20);
  harness.controller.observe(30, false);
  assert.equal(harness.controller.scale, 1);
  assert.deepEqual(harness.changes, []);
});

test("game integrates adaptive quality only after an active WebGL frame", () => {
  const directory = path.join(__dirname, "../games/gcv");
  const game = fs.readFileSync(path.join(directory, "game.js"), "utf8");
  const html = fs.readFileSync(path.join(directory, "index.html"), "utf8");
  assert.match(game, /const AdaptiveResolution = window\.GcvAdaptiveResolution/);
  assert.match(game, /AdaptiveResolution\.create\(/);
  assert.match(game, /setScale: \(scale\) => rendering\.setResolutionScale\(scale\)/);
  assert.match(game, /adaptiveResolution\.observe\(now, drawing\)/);
  assert.match(game, /if \(drawing\) rendering\.render\(\);\s*adaptiveResolution\.observe/);
  assert.match(game, /adaptiveResolution\.observe\(now, false\)/);
  assert.match(game, /window\.addEventListener\("resize", adaptiveResolution\.reset/);
  assert.match(game, /document\.addEventListener\("fullscreenchange", adaptiveResolution\.reset/);
  assert.match(game, /document\.addEventListener\("visibilitychange", adaptiveResolution\.reset/);
  assert.doesNotMatch(game, /adaptiveResolution\.(?:save|persist)/);
  const render = html.indexOf("./rendering.js?");
  const adaptive = html.indexOf("./adaptive-resolution.js?");
  const main = html.indexOf("./game.js?");
  assert.ok(render >= 0 && adaptive > render && main > adaptive);
  assert.doesNotThrow(() => new vm.Script(fs.readFileSync(
    path.join(directory, "adaptive-resolution.js"), "utf8")));
});
