"use strict";

// Pure data summarizer shared by the browser benchmark and Node regression tests.
// Frame intervals are requestAnimationFrame timestamps, not true GPU timings.
(function (root) {
  function percentile(values, rank) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const at = (sorted.length - 1) * rank;
    const low = Math.floor(at), high = Math.ceil(at);
    return sorted[low] + (sorted[high] - sorted[low]) * (at - low);
  }

  function mean(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function summarize(samples) {
    const valid = samples.filter((sample) => Number.isFinite(sample.intervalMs) &&
      sample.intervalMs > 0 && Number.isFinite(sample.drawCalls) &&
      Number.isFinite(sample.triangles) && Number.isFinite(sample.cpuMs));
    if (!valid.length) return null;
    const frames = valid.map((sample) => sample.intervalMs);
    const durationMs = frames.reduce((sum, value) => sum + value, 0);
    return {
      frames: valid.length,
      durationMs,
      fps: valid.length * 1000 / durationMs,
      frameP50Ms: percentile(frames, 0.50),
      frameP95Ms: percentile(frames, 0.95),
      frameP99Ms: percentile(frames, 0.99),
      longFramePct: 100 * frames.filter((value) => value > 33.34).length / valid.length,
      drawCallsAvg: mean(valid.map((sample) => sample.drawCalls)),
      drawCallsMax: Math.max(...valid.map((sample) => sample.drawCalls)),
      trianglesAvg: mean(valid.map((sample) => sample.triangles)),
      cpuAvgMs: mean(valid.map((sample) => sample.cpuMs)),
      cpuP95Ms: percentile(valid.map((sample) => sample.cpuMs), 0.95),
    };
  }

  const api = Object.freeze({ percentile, summarize });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.GcvBenchmarkMetrics = api;
})(typeof window !== "undefined" ? window : null);
