"use strict";
// Continuous roadside guardrails: the same limit drives rendering and collision.
// Collision projects only the lateral overflow back inside the rail, preserving
// forward motion so cars glide along both barriers instead of bouncing.
const GcvBarriers = (() => {
  const RAIL_OFFSET_INWARD = 0.45;
  const CAR_RADIUS = 1.05;

  function create(positions, lapLength, outerHalfWidth) {
    if (!Array.isArray(positions) || positions.length < 3 ||
        !Number.isFinite(lapLength) || lapLength <= 0 ||
        !Number.isFinite(outerHalfWidth) ||
        outerHalfWidth <= RAIL_OFFSET_INWARD + CAR_RADIUS) {
      throw new Error("Invalid road layout");
    }
    // One unbroken loop. Every rendered guardrail segment (including the
    // last-to-first seam) uses the same data as the collision guard.
    return Object.freeze({
      protectedSamples: new Uint8Array(positions.length).fill(1),
      lengthMeters: lapLength,
      railOffset: outerHalfWidth - RAIL_OFFSET_INWARD,
      carLimit: outerHalfWidth - RAIL_OFFSET_INWARD - CAR_RADIUS,
    });
  }

  function resolve(previous, proposed, index, center, side, barriers) {
    if (!barriers.protectedSamples[index]) {
      return { ...proposed, collided: false };
    }
    const dx = proposed.x - center.x;
    const dz = proposed.z - center.z;
    const lateral = dx * side.x + dz * side.z;
    const limit = barriers.carLimit;
    if (Math.abs(lateral) <= limit) return { ...proposed, collided: false };
    const correction = lateral - Math.sign(lateral) * limit;
    // Remove only outward motion. Keep speed, yaw and the distance traveled
    // tangent to the track, even when the car is pressed against the rail.
    return {
      ...proposed, x: proposed.x - side.x * correction,
      z: proposed.z - side.z * correction, collided: true,
    };
  }

  return Object.freeze({ CAR_RADIUS, RAIL_OFFSET_INWARD, create, resolve });
})();
if (typeof window !== "undefined") window.GcvBarriers = GcvBarriers;
if (typeof module !== "undefined" && module.exports) module.exports = GcvBarriers;
