"use strict";

// Pure, testable summary of browser-frame intervals and JS phase timers.
// Timers around renderer.render() include JS submission + possible driver wait:
// neither that duration nor requestAnimationFrame intervals equal GPU time.
(function (root) {
  const PHASES = Object.freeze([
    "routeMs", "opponentsMs", "playerMs", "effectsMs", "cameraMs", "submitMs",
  ]);
  const UPDATE_PHASES = Object.freeze(PHASES.filter((key) => key !== "submitMs"));

  function percentile(values, rank) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const at = (sorted.length - 1) * rank;
    const low = Math.floor(at);
    const high = Math.ceil(at);
    return sorted[low] + (sorted[high] - sorted[low]) * (at - low);
  }
  function mean(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  function averagePhase(samples, key) {
    const values = samples.map((sample) => sample[key])
      .filter((value) => Number.isFinite(value) && value >= 0);
    return values.length === samples.length ? mean(values) : null;
  }
  function summarize(samples) {
    const valid = samples.filter((sample) => Number.isFinite(sample.intervalMs) &&
      sample.intervalMs > 0 && Number.isFinite(sample.drawCalls) &&
      Number.isFinite(sample.triangles) && Number.isFinite(sample.cpuMs) &&
      sample.cpuMs >= 0);
    if (!valid.length) return null;
    const intervals = valid.map((sample) => sample.intervalMs);
    const cpu = valid.map((sample) => sample.cpuMs);
    const durationMs = intervals.reduce((sum, value) => sum + value, 0);
    const phases = Object.fromEntries(PHASES.map((key) =>
      [key.replace(/Ms$/, "AvgMs"), averagePhase(valid, key)]));
    const updateAverage = UPDATE_PHASES.every((key) =>
      Number.isFinite(phases[key.replace(/Ms$/, "AvgMs")]))
      ? UPDATE_PHASES.reduce((sum, key) =>
        sum + phases[key.replace(/Ms$/, "AvgMs")], 0)
      : null;
    return {
      frames: valid.length,
      durationMs,
      fps: valid.length * 1000 / durationMs,
      frameP50Ms: percentile(intervals, 0.50),
      frameP95Ms: percentile(intervals, 0.95),
      frameP99Ms: percentile(intervals, 0.99),
      frameMaxMs: Math.max(...intervals),
      over20Pct: 100 * intervals.filter((value) => value > 20).length / valid.length,
      longFramePct: 100 * intervals.filter((value) => value > 33.34).length / valid.length,
      over50Pct: 100 * intervals.filter((value) => value > 50).length / valid.length,
      drawCallsAvg: mean(valid.map((sample) => sample.drawCalls)),
      drawCallsMax: Math.max(...valid.map((sample) => sample.drawCalls)),
      trianglesAvg: mean(valid.map((sample) => sample.triangles)),
      cpuAvgMs: mean(cpu),
      cpuP95Ms: percentile(cpu, 0.95),
      cpuP99Ms: percentile(cpu, 0.99),
      cpuMaxMs: Math.max(...cpu),
      updateAvgMs: updateAverage,
      ...phases,
    };
  }

  // Like-for-like resolution comparisons: same circuit, vehicle and opponent
  // settings. For refresh-capped devices, never claim more headroom from FPS.
  function resolutionComparison(scenarios) {
    const reference = scenarios?.find((item) => item.id === "classic-race");
    if (!reference) return null;
    const cases = scenarios.filter((item) =>
      ["classic-race", "classic-race-75", "classic-race-55",
        "classic-race-repeat"].includes(item.id));
    if (cases.length !== 4 || cases.some((item) =>
      item.track !== reference.track || item.vehicle !== reference.vehicle ||
      item.opponents !== reference.opponents)) return null;
    const repeat = cases.find((item) => item.id === "classic-race-repeat");
    const driftPct = reference.fps > 0 && repeat?.fps > 0
      ? 100 * (repeat.fps - reference.fps) / reference.fps : null;
    const cap = cases.every((item) => item.fps >= 58.5 && item.fps <= 61.5);
    const differences = cases.filter((item) => item.id !== reference.id)
      .map((item) => ({
        id: item.id,
        scale: item.scale,
        pixelRatio: item.pixelRatio,
        pixels: item.framebufferWidth * item.framebufferHeight,
        fpsDeltaPct: reference.fps > 0
          ? 100 * (item.fps - reference.fps) / reference.fps : null,
      }));
    return { referenceId: reference.id, driftPct, refreshCappedAt60: cap,
      cases: differences };
  }

  const api = Object.freeze({ PHASES, percentile, summarize, resolutionComparison });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.GcvBenchmarkMetrics = api;
})(typeof window !== "undefined" ? window : null);
