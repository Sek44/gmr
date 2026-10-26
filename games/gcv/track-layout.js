"use strict";
// One definition for the circuit, finish marker, spawning and future AI.
// Every 2D coordinate is [x, z] in metres; cars travel in array order.
const GcvTrackLayout = (() => {
  const VERSION = 2;
  const SAMPLE_COUNT = 840;
  const WAYPOINTS = Object.freeze([
    [78, 150], [78, 100], [78, 50], [78, 0], [78, -50], [78, -90],
    [53, -114], [4, -125], [-40, -117], [-75, -90], [-91, -52],
    [-65, -14], [-97, 22], [-100, 60], [-76, 93], [-44, 125],
    [6, 164], [48, 163],
  ].map((point) => Object.freeze(point)));

  // 240 m straight, finishing 160 m into it = 2/3 of the way along.
  const FINISH = Object.freeze({ x: 78, z: -10 });
  const SPAWN = Object.freeze({ x: 78, z: -43 });

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

  return Object.freeze({ VERSION, SAMPLE_COUNT, WAYPOINTS, FINISH, SPAWN,
    nearestIndex, perimeter });
})();
if (typeof window !== "undefined") window.GcvTrackLayout = GcvTrackLayout;
if (typeof module !== "undefined" && module.exports) module.exports = GcvTrackLayout;
