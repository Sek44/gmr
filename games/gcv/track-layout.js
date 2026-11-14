"use strict";
// One definition for the circuit, finish marker, spawning and future AI.
// Every 2D coordinate is [x, z] in metres; cars travel in array order.
const GcvTrackLayout = (() => {
  const VERSION = 2;
  const SAMPLE_COUNT = 840;
  const ROAD_HALF_WIDTH = 9;
  const SHOULDER_WIDTH = 7; // Seven metres of shoulder on each side.
  const WAYPOINTS = Object.freeze([
    [78, 150], [78, 100], [78, 50], [78, 0], [78, -50], [78, -90],
    [53, -114], [4, -125], [-40, -117], [-75, -90], [-91, -52],
    [-65, -14], [-97, 22], [-100, 60], [-76, 93], [-44, 125],
    [6, 164], [48, 163],
  ].map((point) => Object.freeze(point)));

  // 240 m straight, finishing 160 m into it = 2/3 of the way along.
  const FINISH = Object.freeze({ x: 78, z: -10 });
  const SPAWN = Object.freeze({ x: 78, z: -43 });

  // The Arc-en-ciel sprint is an authored SEQUENCE, not a hand-drawn
  // waypoint list. Only straights may contain crests or rainbow segments.
  // To add a circuit later, supply a template and seed to TrackGenerator.
  // Turning sections are broad enough to avoid extreme handling on mobile.
  const TrackGenerator = typeof module !== "undefined" && module.exports
    ? require("./track-generator.js")
    : window.GcvTrackGenerator;
  if (!TrackGenerator) throw new Error("track-generator.js must load first");

  const SPRINT_TEMPLATE = Object.freeze({
    origin: [0, 90], heading: 0,
    spawnMetres: 20, startMetres: 70, finishMargin: 45,
    sections: Object.freeze([
      { type: "straight", length: 360, lengthVariance: 18,
        hump: { height: 16, widthMetres: 88, crown: 1, crownWidthMetres: 32 } },
      { type: "turn", angle: 55, radius: 90,
        angleVariance: 4, radiusVariance: 6 },
      { type: "straight", length: 385, lengthVariance: 22,
        hump: { height: 14, widthMetres: 91, crown: 1, crownWidthMetres: 32 } },
      { type: "turn", angle: -95, radius: 90,
        angleVariance: 4, radiusVariance: 6 },
      { type: "straight", length: 390, lengthVariance: 24,
        hump: { height: 18, widthMetres: 93, crown: 1, crownWidthMetres: 33 } },
      { type: "turn", angle: 90, radius: 90,
        angleVariance: 4, radiusVariance: 6 },
      // Only about 150 m of multicoloured guidance rails, down from ~430 m.
      { type: "straight", length: 170, lengthVariance: 12, rainbow: true },
      { type: "turn", angle: -70, radius: 100,
        angleVariance: 4, radiusVariance: 6 },
      { type: "straight", length: 410, lengthVariance: 24,
        hump: { height: 15, widthMetres: 97, crown: 1, crownWidthMetres: 34 } },
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
  function select(id) { return id === SPRINT.ID ? SPRINT : GcvTrackLayout; }

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

  return Object.freeze({ VERSION, SAMPLE_COUNT, ROAD_HALF_WIDTH, SHOULDER_WIDTH,
    WAYPOINTS, FINISH, SPAWN, ID: "classic", NAME: "Circuit classique", CLOSED: true,
    CIRCUITS: Object.freeze([{ id: "classic", name: "Circuit classique" },
      { id: SPRINT.ID, name: SPRINT.NAME }]), SPRINT, select,
    nearestIndex, perimeter, SPRINT_TEMPLATE, generateSprint });
})();
if (typeof window !== "undefined") window.GcvTrackLayout = GcvTrackLayout;
if (typeof module !== "undefined" && module.exports) module.exports = GcvTrackLayout;
