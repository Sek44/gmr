"use strict";
// One definition for the circuit, finish marker, spawning and future AI.
// Every 2D coordinate is [x, z] in metres; cars travel in array order.
const GcvTrackLayout = (() => {
  const SAMPLE_COUNT = 840;
  const ROAD_HALF_WIDTH = 9;
  const SHOULDER_WIDTH = 7; // Seven metres of shoulder on each side.
  // The Arc-en-ciel sprint is an authored SEQUENCE, not a hand-drawn
  // waypoint list. Only straights may contain crests or rainbow segments.
  // To add a circuit later, supply a template and seed to TrackGenerator.
  // Turning sections are broad enough to avoid extreme handling on mobile.
  const TrackGenerator = typeof module !== "undefined" && module.exports
    ? require("./track-generator.js")
    : window.GcvTrackGenerator;
  if (!TrackGenerator) throw new Error("track-generator.js must load first");

  // One authored half-lap is repeated after a 180-degree turn.
  // This guarantees a seamless loop for every seed while varying the
  // lengths and radii. The paired S-bends and wide U-turns leave clear
  // shoulders and a long, straight starting grid.
  const CLASSIC_TEMPLATE = Object.freeze({
    origin: [0, 100], heading: 0,
    closed: true, repeat: 2,
    finishMetres: 83, spawnMetres: 108,
    minClearanceMetres: 32,
    sections: Object.freeze([
      { type: "straight", length: 124, lengthVariance: 4 },
      { type: "turn", angle: 32, radius: 36, radiusVariance: 1.5 },
      { type: "straight", length: 30, lengthVariance: 3 },
      { type: "turn", angle: -64, radius: 36, radiusVariance: 1.5 },
      { type: "straight", length: 30, lengthVariance: 3 },
      { type: "turn", angle: 32, radius: 36, radiusVariance: 1.5 },
      { type: "straight", length: 35, lengthVariance: 3 },
      { type: "turn", angle: 90, radius: 30, radiusVariance: 1.5 },
      { type: "straight", length: 42, lengthVariance: 3 },
      { type: "turn", angle: 90, radius: 30, radiusVariance: 1.5 },
    ]),
  });
  // A fixed seed gives all players the same classic track by default.
  function generateClassic(seed = 20261114) {
    const generated = TrackGenerator.build(CLASSIC_TEMPLATE, seed);
    return Object.freeze({
      ...generated, ID: "classic", NAME: "Circuit classique", VERSION: 3,
      SAMPLE_COUNT, ROAD_HALF_WIDTH, SHOULDER_WIDTH,
      nearestIndex, zigzagAt,
    });
  }
  const CLASSIC = generateClassic();

  const SPRINT_TEMPLATE = Object.freeze({
    origin: [0, 90], heading: 0,
    spawnMetres: 20, startMetres: 70, finishMargin: 45,
    sections: Object.freeze([
      { type: "straight", length: 430, lengthVariance: 18,
        hump: { height: 16, widthMetres: 110, crown: 1, crownWidthMetres: 38 } },
      { type: "turn", angle: 55, radius: 90,
        angleVariance: 4, radiusVariance: 6 },
      { type: "straight", length: 440, lengthVariance: 22,
        hump: { height: 14, widthMetres: 112, crown: 1, crownWidthMetres: 38 } },
      { type: "turn", angle: -95, radius: 90,
        angleVariance: 4, radiusVariance: 6 },
      { type: "straight", length: 450, lengthVariance: 24,
        hump: { height: 18, widthMetres: 115, crown: 1, crownWidthMetres: 40 } },
      { type: "turn", angle: 90, radius: 90,
        angleVariance: 4, radiusVariance: 6 },
      // Only about 150 m of multicoloured guidance rails, down from ~430 m.
      { type: "straight", length: 170, lengthVariance: 12, rainbow: true },
      { type: "turn", angle: -70, radius: 100,
        angleVariance: 4, radiusVariance: 6 },
      { type: "straight", length: 460, lengthVariance: 24,
        hump: { height: 15, widthMetres: 117, crown: 1, crownWidthMetres: 40 } },
      { type: "turn", angle: 60, radius: 95,
        angleVariance: 4, radiusVariance: 6 },
      { type: "straight", length: 170, lengthVariance: 12 },
    ]),
  });
  // A different seed yields a new reproducible route, while its features
  // stay attached to the same kinds of section. Future menus can offer
  // multiple seeds without changing the simulation or renderer.
  function generateSprint(seed = 20261114) {
    const generated = TrackGenerator.build(SPRINT_TEMPLATE, seed);
    return Object.freeze({
      ...generated, ID: "rainbow", NAME: "Route Arc-en-ciel", VERSION: 5,
      CLOSED: false, SAMPLE_COUNT: 720, ROAD_HALF_WIDTH, SHOULDER_WIDTH,
      nearestIndex, zigzagAt,
    });
  }
  const SPRINT = generateSprint();
  // Seven short, lively swerves with a much smaller lateral excursion.
  // Smoothstep fades the motion AND its derivative at both section edges.
  function zigzagAt(progress) {
    const t = Math.min(1, Math.max(0, Number(progress) || 0));
    const fade = 0.12;
    const smoothstep = (x) => x * x * (3 - 2 * x);
    const smoothstepDerivative = (x) => 6 * x * (1 - x);
    const entry = Math.min(1, t / fade);
    const exit = Math.min(1, (1 - t) / fade);
    const envelope = smoothstep(entry) * smoothstep(exit);
    const envelopeDerivative =
      (t < fade ? smoothstepDerivative(entry) * smoothstep(exit) / fade : 0) -
      (t > 1 - fade ? smoothstepDerivative(exit) * smoothstep(entry) / fade : 0);
    const phase = t * Math.PI * 14;
    const amplitude = 1.65; // Metres, safely inside the 9 m half-width.
    return {
      offset: amplitude * envelope * Math.sin(phase),
      slope: amplitude * (envelopeDerivative * Math.sin(phase) +
        envelope * Math.PI * 14 * Math.cos(phase)),
    };
  }
  function select(id) { return id === SPRINT.ID ? SPRINT : CLASSIC; }

  function nearestIndex(positions, reference) {
    let bestIndex = 0;
    let bestSquared = Infinity;
    for (let i = 0; i < positions.length - 1; i++) {
      const p = positions[i];
      const distance = (p.x - reference.x) ** 2 + (p.z - reference.z) ** 2;
      if (distance < bestSquared) { bestSquared = distance; bestIndex = i; }
    }
    return bestIndex;
  }

  function perimeter(points) {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      sum += Math.hypot(a[0] - b[0], a[1] - b[1]);
    }
    return sum;
  }

  return Object.freeze({ ...CLASSIC,
    CIRCUITS: Object.freeze([{ id: CLASSIC.ID, name: CLASSIC.NAME },
      { id: SPRINT.ID, name: SPRINT.NAME }]),
    CLASSIC, SPRINT, select, perimeter,
    CLASSIC_TEMPLATE, generateClassic, SPRINT_TEMPLATE, generateSprint });
})();
if (typeof window !== "undefined") window.GcvTrackLayout = GcvTrackLayout;
if (typeof module !== "undefined" && module.exports) module.exports = GcvTrackLayout;
