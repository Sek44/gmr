"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Metrics = require("../games/gcv/benchmark-metrics.js");
const Config = require("../games/gcv/benchmark-config.js");
const Display = require("../games/gcv/benchmark-display.js");

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
  assert.ok(Math.abs(result.frameP95Ms - 37) < 1e-9);
  assert.ok(Math.abs(result.frameP99Ms - 39.4) < 1e-9);
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
  assert.match(html, /src="\.\/rendering\.js\?v=/);
  assert.match(html, /src="\.\/vehicles\.js\?v=/);
  assert.match(html, /src="\.\/world-3d\.js\?v=/);
  assert.match(html, /src="\.\/benchmark\.js\?v=/);
  assert.doesNotMatch(html, /play-time|game-state|session\.js|game\.js/);
  assert.doesNotMatch(script, /localStorage|sessionStorage|GmrPlayTime/);
  assert.match(script, /requestAnimationFrame/);
  assert.match(script, /getMetrics\(\)/);
  assert.match(script, /visibilitychange/);
  assert.match(script, /SCENARIOS/);
});

test("standalone benchmark browser scripts load in dependency order", () => {
  const html = fs.readFileSync(path.join(game, "benchmark.html"), "utf8");
  const scriptPaths = [...html.matchAll(/<script defer src="\.\/([^"?]+\.js)(?:\?[^"]+)?"><\/script>/g)]
    .map((match) => match[1]);
  assert.ok(scriptPaths.indexOf("track-progress.js") >= 0);
  assert.ok(scriptPaths.indexOf("track-progress.js") < scriptPaths.indexOf("race.js"),
    "Race depends on TrackProgress and must load after it");

  // Execute the scripts in their actual HTML order. This catches runtime
  // initialization errors caused by missing globals, not just missing tags.
  const sandbox = vm.createContext({ window: {} });
  for (const file of scriptPaths) {
    vm.runInContext(fs.readFileSync(path.join(game, file), "utf8"), sandbox, {
      filename: file, timeout: 1000,
    });
  }
  for (const name of ["GcvTrackProgress", "GcvRace", "GcvTrackLayout",
    "GcvBarriers", "GcvScenery", "GcvWorld3D", "GcvVehicles",
    "GcvRendering", "GcvVisualEffects", "GcvBenchmarkConfig",
    "GcvBenchmarkDisplay", "GcvBenchmarkMetrics"]) {
    assert.ok(sandbox.window[name], `Missing ${name} after loading benchmark scripts`);
  }
});

test("seven scripted runs keep like-for-like resolution comparisons", () => {
  assert.equal(Config.VERSION, "gcv-render-v4");
  assert.equal(Config.SCENARIOS.length, 7);
  assert.ok(Config.validatePlan());
  const full = Config.SCENARIOS.find((item) => item.id === "classic-race");
  const passes = Config.SCENARIOS.filter((item) =>
    item.group === "resolution" || item.group === "repeat");
  assert.deepEqual(passes.map((item) => item.scale), [0.75, 0.55, 1]);
  for (const run of passes) {
    assert.equal(run.track, full.track);
    assert.equal(run.vehicle, full.vehicle);
    assert.equal(run.race, full.race);
  }
  assert.ok(Config.SCENARIOS.findIndex((item) =>
    item.id === "classic-race-repeat") >
    Config.SCENARIOS.findIndex((item) => item.id === "classic-race"));
  assert.equal(Config.validatePlan([{ id: "wrong", name: "bad",
    track: "classic", vehicle: "moto", race: false, scale: 0.1 }]), false);
  assert.ok(Object.isFrozen(Config.SCENARIOS));
});

test("CPU profiler returns distinct phase averages, frame tail and spike rates", () => {
  const sample = (intervalMs, factor) => ({
    intervalMs, drawCalls: 100, triangles: 1000,
    cpuMs: factor * 7,
    routeMs: factor, opponentsMs: factor,
    playerMs: factor, effectsMs: factor,
    cameraMs: factor, submitMs: factor * 2,
  });
  const result = Metrics.summarize([
    sample(16, 1), sample(34, 2), sample(51, 3),
  ]);
  assert.equal(result.frames, 3);
  assert.equal(result.longFramePct, 200 / 3);
  assert.equal(result.over50Pct, 100 / 3);
  assert.equal(result.over20Pct, 200 / 3);
  assert.equal(result.frameMaxMs, 51);
  assert.equal(result.cpuAvgMs, 14);
  assert.ok(Math.abs(result.cpuP95Ms - 20.3) < 1e-9);
  assert.equal(result.cpuMaxMs, 21);
  assert.equal(result.routeAvgMs, 2);
  assert.equal(result.opponentsAvgMs, 2);
  assert.equal(result.playerAvgMs, 2);
  assert.equal(result.effectsAvgMs, 2);
  assert.equal(result.cameraAvgMs, 2);
  assert.equal(result.submitAvgMs, 4);
  assert.equal(result.updateAvgMs, 10);
  assert.ok(result.frameP99Ms > result.frameP95Ms);
});

test("older metric samples still work when per-phase counters are missing", () => {
  const result = Metrics.summarize([
    { intervalMs: 16, cpuMs: 3, drawCalls: 5, triangles: 7 },
  ]);
  assert.equal(result.fps, 62.5);
  assert.equal(result.routeAvgMs, null);
  assert.equal(result.submitAvgMs, null);
  assert.equal(result.updateAvgMs, null);
});

test("resolution comparison detects frame-cap and run-order drift", () => {
  const make = (id, scale, fps) => ({
    id, track: "classic", vehicle: "classic", opponents: 9, scale,
    fps, pixelRatio: scale * 1.7, framebufferWidth: Math.round(800 * scale),
    framebufferHeight: Math.round(1100 * scale),
  });
  const normal = [
    make("classic-race", 1, 40),
    make("classic-race-75", 0.75, 50),
    make("classic-race-55", 0.55, 60),
    make("classic-race-repeat", 1, 38),
  ];
  const result = Metrics.resolutionComparison(normal);
  assert.equal(result.refreshCappedAt60, false);
  assert.equal(result.driftPct, -5);
  assert.equal(result.cases[0].fpsDeltaPct, 25);
  assert.equal(result.cases[1].pixels,
    Math.round(800 * 0.55) * Math.round(1100 * 0.55));
  assert.equal(Metrics.resolutionComparison(normal.slice(0, 3)), null);
  const capped = normal.map((item) => ({ ...item, fps: 60 }));
  assert.equal(Metrics.resolutionComparison(capped).refreshCappedAt60, true);
  const mismatch = normal.map((item) => ({ ...item }));
  mismatch[2].opponents = 0;
  assert.equal(Metrics.resolutionComparison(mismatch), null);
});

test("three report pages provide readable screenshot sections", () => {
  const html = fs.readFileSync(path.join(game, "benchmark.html"), "utf8");
  const code = fs.readFileSync(path.join(game, "benchmark.js"), "utf8");
  const css = fs.readFileSync(path.join(game, "benchmark.css"), "utf8");
  const pages = [...html.matchAll(/data-report-page="(\d+)"/g)]
    .map((match) => Number(match[1]));
  assert.deepEqual(pages, [0, 1, 2]);
  for (const id of [
    "benchmark-overview-rows", "benchmark-cpu-rows", "benchmark-phase-rows",
    "benchmark-resolution-rows", "benchmark-device", "benchmark-hardware",
    "benchmark-run-id", "benchmark-page-number", "benchmark-prev",
    "benchmark-next", "benchmark-end-actions", "benchmark-copy",
    "benchmark-start", "benchmark-windowed", "benchmark-exit-fullscreen",
    "benchmark-capture-mode", "benchmark-display-info",
  ]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(html, /src="\.\/benchmark-config\.js\?v=/);
  assert.match(html, /src="\.\/benchmark-display\.js\?v=/);
  assert.match(code, /setResolutionScale\(scenario\.scale\)/);
  assert.match(code, /performance\.now\(\)/);
  assert.match(code, /metrics\.resolutionComparison\(output\)/);
  assert.match(css, /\[hidden\] \{ display: none !important; \}/);
  assert.doesNotMatch(html, /play-time|game-state|session\.js|game\.js/);
});

test("fullscreen entry succeeds only when the browser confirms activation", async () => {
  let called = 0;
  const document = { fullscreenElement: null, documentElement: {} };
  document.documentElement.requestFullscreen = () => {
    called++;
    document.fullscreenElement = document.documentElement;
    return Promise.resolve();
  };
  assert.deepEqual(await Display.enter(document), { ok: true, reason: null });
  assert.equal(called, 1);
  assert.equal(Display.isActive(document), true);
  assert.deepEqual(Display.snapshot(document, {
    devicePixelRatio: 2.5, screen: { orientation: { type: "portrait-primary" } },
  }, { clientWidth: 400, clientHeight: 820 }), {
    mode: "fullscreen", fullscreen: true, orientation: "portrait-primary",
    viewport: { width: 400, height: 820 }, devicePixelRatio: 2.5,
  });
});

test("fullscreen rejection and unsupported API never report success", async () => {
  assert.deepEqual(await Display.enter({ documentElement: {} }),
    { ok: false, reason: "unsupported" });
  const rejected = { documentElement: {
    requestFullscreen: () => Promise.reject(new Error("not allowed")),
  }, fullscreenElement: null };
  assert.deepEqual(await Display.enter(rejected),
    { ok: false, reason: "denied" });
  const noConfirmation = { documentElement: {
    requestFullscreen: () => Promise.resolve(),
  }, fullscreenElement: null };
  assert.deepEqual(await Display.enter(noConfirmation),
    { ok: false, reason: "not-active" });
  assert.deepEqual(Display.snapshot(noConfirmation, {}, {
    clientWidth: 1280, clientHeight: 632,
  }), {
    mode: "windowed", fullscreen: false, orientation: "landscape",
    viewport: { width: 1280, height: 632 }, devicePixelRatio: 1,
  });
});

test("fullscreen request precedes WebGL import and has explicit fallback", () => {
  const code = fs.readFileSync(path.join(game, "benchmark.js"), "utf8");
  const html = fs.readFileSync(path.join(game, "benchmark.html"), "utf8");
  assert.ok(code.indexOf("await display.enter(document)") > 0);
  assert.ok(code.indexOf("await display.enter(document)") <
    code.indexOf("await import(THREE_URL)"),
    "requestFullscreen must occur inside the user gesture");
  assert.match(code, /startButton.addEventListener\("click", \(\) => start\(true\)\)/);
  assert.match(code, /windowedButton.addEventListener\("click", \(\) => start\(false\)\)/);
  assert.match(code, /lockedDisplay = display.snapshot\(document, window, stage\)/);
  assert.match(code, /fullscreenChangedDuringTest/);
  assert.match(code, /document.removeEventListener\("fullscreenchange"/);
  assert.match(code, /fullscreenRequested,?/);
  assert.match(html, /Sans plein écran/);
});
