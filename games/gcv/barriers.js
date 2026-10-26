"use strict";
// Roadside protection: identify the exits of bends and constrain only the
// lateral movement of cars that reach a guardrail. No Three.js dependency.
const GcvBarriers = (() => {
  const MIN_LENGTH = 30;
  const DEFAULT_LENGTH = 40;
  const TURN_THRESHOLD_RADIANS = 18 * Math.PI / 180;
  const RAIL_OFFSET_INWARD = 0.45;
  const CAR_RADIUS = 1.05;

  function bendAngle(previous, current, next) {
    const ax = current[0] - previous[0];
    const az = current[1] - previous[1];
    const bx = next[0] - current[0];
    const bz = next[1] - current[1];
    return Math.atan2(ax * bz - az * bx, ax * bx + az * bz);
  }

  function nearestIndex(positions, point) {
    let best = 0, shortest = Infinity;
    for (let i = 0; i < positions.length; i++) {
      const dx = positions[i].x - point[0];
      const dz = positions[i].z - point[1];
      const dist = dx * dx + dz * dz;
      if (dist < shortest) { shortest = dist; best = i; }
    }
    return best;
  }

  function create(positions, waypoints, lapLength, outerHalfWidth,
    sectionLength = DEFAULT_LENGTH) {
    if (!Array.isArray(positions) || positions.length < 3 ||
        !Array.isArray(waypoints) || waypoints.length < 3 ||
        !Number.isFinite(lapLength) || lapLength <= 0 ||
        !Number.isFinite(outerHalfWidth) || outerHalfWidth <= CAR_RADIUS + 1)
      throw Error("Invalid road layout");
    const count = positions.length;
    const distancePerSample = lapLength / count;
    const length = Math.max(MIN_LENGTH, sectionLength);
    const segmentCount = Math.ceil(length / distancePerSample);
    const protectedSamples = new Uint8Array(count);
    const sections = [];
    for (let i = 0; i < waypoints.length; i++) {
      const prev = waypoints[(i + waypoints.length - 1) % waypoints.length];
      const current = waypoints[i];
      const next = waypoints[(i + 1) % waypoints.length];
      if (Math.abs(bendAngle(prev, current, next)) < TURN_THRESHOLD_RADIANS)
        continue;
      const startIndex = nearestIndex(positions, current);
      sections.push({ waypointIndex: i, startIndex,
        lengthMeters: segmentCount * distancePerSample });
      for (let j = 0; j <= segmentCount; j++)
        protectedSamples[(startIndex + j) % count] = 1;
    }
    return {
      protectedSamples, sections,
      // Rail is before the cliff, leaving room for the car's body.
      railOffset: outerHalfWidth - RAIL_OFFSET_INWARD,
      carLimit: outerHalfWidth - RAIL_OFFSET_INWARD - CAR_RADIUS,
    };
  }

  function resolve(previous, proposed, index, center, side, barriers) {
    const protectedHere = Boolean(barriers.protectedSamples[index]);
    if (!protectedHere) return { ...proposed, collided: false };
    const dx = proposed.x - center.x;
    const dz = proposed.z - center.z;
    const lateral = dx * side.x + dz * side.z;
    const limit = barriers.carLimit;
    if (Math.abs(lateral) <= limit) return { ...proposed, collided: false };
    const correction = lateral - Math.sign(lateral) * limit;
    // Only remove the outward, normal component of the displacement. Keep the
    // tangential displacement, forward speed and yaw: the car slides along
    // the rail instead of coming to a halt or bouncing back into the road.
    return {
      ...proposed, x: proposed.x - side.x * correction,
      z: proposed.z - side.z * correction, collided: true,
    };
  }

  return Object.freeze({
    MIN_LENGTH, DEFAULT_LENGTH, CAR_RADIUS, TURN_THRESHOLD_RADIANS,
    bendAngle, create, resolve,
  });
})();
if (typeof window !== "undefined") window.GcvBarriers = GcvBarriers;
if (typeof module !== "undefined" && module.exports) module.exports = GcvBarriers;
