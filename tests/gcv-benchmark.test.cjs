"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Metrics = require("../games/gcv/benchmark-metrics.js");

const game = path.resolve(__dirname, "../games/gcv");

test("benchmark metrics summarize delivered frames and renderer counters", () => {
  const values = [10, 16, 20, 40];
  const result = Metrics.summarize(values.map((intervalMs, index) => ({
    intervalMs, cpuMs: 2 + index,
    drawCalls: 100 + 10 * index, triangles: 10000 + 1000 * index,
  })));
  assert.equal(result.frames, 4);
  assert.equal(result.durationMs, 86);
  assert.ok(Math.abs(result.fps - 4000 / 86) < 1e-9);
  assert.equal(result.frameP50Ms, 18);
  assert.equal(result.frameP95Ms, 37);
  assert.equal(result.frameP99Ms, 39.4);
  assert.equal(result.longFramePct, 25);
  assert.equal(result.drawCallsAvg, 115);
  assert.equal(result.drawCallsMax, 130);
  assert.equal(result.trianglesAvg, 11500);
  assert.equal(result.cpuAvgMs, 3.5);
});

test("benchmark metrics reject invalid frames and handle no samples", () => {
  assert.equal(Metrics.summarize([]), null);
  assert.equal(Metrics.summarize([{ intervalMs: 0, drawCalls: 1,
    triangles: 1, cpuMs: 1 }]), null);
  const result = Metrics.summarize([
    { intervalMs: 16, drawCalls: 5, triangles: 42, cpuMs: 2 },
    { intervalMs: Infinity, drawCalls: 5, triangles: 42, cpuMs: 2 },
  ]);
  assert.equal(result.frames, 1);
  assert.equal(result.frameP99Ms, 16);
  assert.equal(result.longFramePct, 0);
});

test("benchmark is separate from the paid play-time and race state", () => {
  const html = fs.readFileSync(path.join(game, "benchmark.html"), "utf8");
  const script = fs.readFileSync(path.join(game, "benchmark.js"), "utf8");
  assert.match(html, /benchmark-metrics\.js/);
  assert.match(html, /src="\.\/rendering\.js"/);
  assert.match(html, /src="\.\/vehicles\.js"/);
  assert.match(html, /src="\.\/world-3d\.js"/);
  assert.match(html, /src="\.\/benchmark\.js\?v=/);
  assert.doesNotMatch(html, /play-time|game-state|session\.js|game\.js/);
  assert.doesNotMatch(script, /localStorage|sessionStorage|GmrPlayTime/);
  assert.match(script, /requestAnimationFrame/);
  assert.match(script, /getMetrics\(\)/);
  assert.match(script, /visibilitychange/);
  assert.match(script, /SCENARIOS/);
});
