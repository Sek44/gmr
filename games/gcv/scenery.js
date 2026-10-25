"use strict";
// Place rocky outcrops entirely off the elevated circuit, even when another
// section of the winding track crosses the proposed location.
const GcvScenery = (() => {
  function placeRock({ center, normal, side, startOffset, radius, roadLimit,
                       trackPoints, existing = [], step = 12, maxSteps = 40 }) {
    const safeTrackDistance = roadLimit + radius + 9;
    for (let attempt = 0; attempt <= maxSteps; attempt++) {
      const distance = (startOffset + attempt * step) * side;
      const x = center.x + normal.x * distance;
      const z = center.z + normal.z * distance;
      if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
      const overlapsRoad = trackPoints.some((p) =>
        (x - p.x) ** 2 + (z - p.z) ** 2 <
          safeTrackDistance ** 2);
      if (overlapsRoad) continue;
      const overlapsRock = existing.some((rock) =>
        (x - rock.x) ** 2 + (z - rock.z) ** 2 <
          (radius + rock.rockRadius + 12) ** 2);
      if (!overlapsRock) return { x, z, rockRadius: radius };
    }
    return null; // Skip rather than creating a rock on the track.
  }
  return Object.freeze({ placeRock });
})();
if (typeof window !== "undefined") window.GcvScenery = GcvScenery;
if (typeof module !== "undefined" && module.exports) module.exports = GcvScenery;
