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

  // Second route: an open point-to-point sprint. Coordinates are scaled
  // to give approximately 1.6 km of driving at the existing car speeds.
  const SPRINT_POINTS = Object.freeze([
    [0, 100], [0, 60], [0, 0], [0, -65], [28, -130],
    [82, -185], [110, -240], [145, -295], [155, -365],
    [123, -420], [70, -475], [10, -535], [-22, -590],
    [-12, -650], [45, -710], [90, -770], [83, -830],
    [36, -895], [-16, -950], [-70, -1015], [-99, -1075],
    [-86, -1145], [-25, -1200], [45, -1260], [75, -1315],
    [62, -1370], [0, -1430], [-40, -1490], [0, -1550],
    [65, -1615], [95, -1680], [84, -1730],
  ].map(([x,z]) => Object.freeze([x * 0.75, z * 0.75])));
  // Spawn and timing gates use the same { x, z } contract as the
  // original track. Array waypoints are only for Catmull-Rom construction.
  const pointAt = ([x, z]) => Object.freeze({ x, z });
  const SPRINT = Object.freeze({
    ID: "rainbow", NAME: "Route Arc-en-ciel", VERSION: 2,
    CLOSED: false, SAMPLE_COUNT: 720, ROAD_HALF_WIDTH,
    SHOULDER_WIDTH, WAYPOINTS: SPRINT_POINTS,
    START: pointAt(SPRINT_POINTS[2]),
    FINISH: pointAt(SPRINT_POINTS[SPRINT_POINTS.length - 2]),
    SPAWN: pointAt(SPRINT_POINTS[1]), // Leave space before the physical starting cap.
    nearestIndex,
    // This marked stretch contains the winding multicoloured guidance rails.
    RAINBOW: Object.freeze([0.51, 0.68]),
    zigzagAt,
    HUMPS: Object.freeze([0.23, 0.39, 0.81]),
  });
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
    nearestIndex, perimeter });
})();
if (typeof window !== "undefined") window.GcvTrackLayout = GcvTrackLayout;
if (typeof module !== "undefined" && module.exports) module.exports = GcvTrackLayout;
