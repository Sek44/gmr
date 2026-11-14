"use strict";

// Test plan data, isolated from DOM/WebGL so the resolution experiment can
// be checked by Node tests. The full-resolution race is repeated last on the
// same scene to expose order/thermal/warm-up drift.
(function (root) {
  const VERSION = "gcv-render-v3";
  const WARMUP_MS = 1500;
  const SAMPLE_MS = 8000;
  const SPEED = 28;
  const SCENARIOS = Object.freeze([
    Object.freeze({ id: "classic-solo", name: "Classique solo",
      track: "classic", vehicle: "classic", race: false, scale: 1, group: "baseline" }),
    Object.freeze({ id: "classic-race", name: "Classique course",
      track: "classic", vehicle: "classic", race: true, scale: 1, group: "baseline" }),
    Object.freeze({ id: "moto-solo", name: "Moto solo",
      track: "classic", vehicle: "moto", race: false, scale: 1, group: "baseline" }),
    Object.freeze({ id: "classic-race-75", name: "Course 75 %",
      track: "classic", vehicle: "classic", race: true, scale: 0.75, group: "resolution" }),
    Object.freeze({ id: "classic-race-55", name: "Course 55 %",
      track: "classic", vehicle: "classic", race: true, scale: 0.55, group: "resolution" }),
    Object.freeze({ id: "classic-race-repeat", name: "Course 100 % (bis)",
      track: "classic", vehicle: "classic", race: true, scale: 1, group: "repeat" }),
    Object.freeze({ id: "rainbow-race", name: "Arc-en-ciel course",
      track: "rainbow", vehicle: "classic", race: true, scale: 1, group: "baseline" }),
  ]);

  function validatePlan(scenarios = SCENARIOS) {
    if (!Array.isArray(scenarios) || !scenarios.length) return false;
    const ids = new Set(scenarios.map((item) => item.id));
    if (ids.size !== scenarios.length) return false;
    if (!scenarios.every((item) => item.name && item.id &&
      ["classic", "rainbow"].includes(item.track) &&
      ["classic", "moto", "kart", "buggy", "comet"].includes(item.vehicle) &&
      typeof item.race === "boolean" &&
      Number.isFinite(item.scale) && item.scale >= 0.5 && item.scale <= 1)) {
      return false;
    }
    const race = scenarios.find((item) => item.id === "classic-race");
    const scaled = scenarios.filter((item) => item.group === "resolution" ||
      item.group === "repeat");
    return Boolean(race) && scaled.every((item) => item.track === race.track &&
      item.vehicle === race.vehicle && item.race === race.race) &&
      scenarios.findIndex((item) => item.id === "classic-race-repeat") >
      scenarios.findIndex((item) => item.id === "classic-race");
  }

  const api = Object.freeze({ VERSION, WARMUP_MS, SAMPLE_MS, SPEED, SCENARIOS, validatePlan });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.GcvBenchmarkConfig = api;
})(typeof window !== "undefined" ? window : null);
