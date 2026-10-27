"use strict";
// Continuous 3D guardrail paths and collision based on the same track
// centerline. A tight inner bend needs a smaller offset to avoid a rail
// folding over itself; the outer rail retains its normal full width.
const GcvBarriers = (() => {
  const RAIL_OFFSET_INWARD = 0.45;
  const CAR_RADIUS = 1.05;
  const INNER_RADIUS_FRACTION = 0.86;
  const CORNER_WINDOW = 6; // Taper the offset smoothly before/after tight turns.
  const MIN_OFFSET = CAR_RADIUS + 0.8;

  function normalAt(positions, index) {
    const n = positions.length;
    const before = positions[(index + n - 1) % n];
    const after = positions[(index + 1) % n];
    const dx = after.x - before.x;
    const dz = after.z - before.z;
    const length = Math.hypot(dx, dz) || 1;
    return { x: -dz / length, z: dx / length };
  }

  function curvatureAt(positions, index) {
    const n = positions.length;
    const a = positions[(index + n - 1) % n];
    const b = positions[index];
    const c = positions[(index + 1) % n];
    const abx = b.x - a.x, abz = b.z - a.z;
    const bcx = c.x - b.x, bcz = c.z - b.z;
    const cross = abx * bcz - abz * bcx;
    const chord = Math.hypot(c.x - a.x, c.z - a.z);
    if (Math.abs(cross) < 1e-9 || chord < 1e-9) {
      return { sign: 0, radius: Infinity };
    }
    const edgeA = Math.hypot(abx, abz);
    const edgeB = Math.hypot(bcx, bcz);
    const radius = edgeA * edgeB * chord / (2 * Math.abs(cross));
    return { sign: Math.sign(cross), radius };
  }

  function create(positions, lapLength, outerHalfWidth, normals = null) {
    if (!Array.isArray(positions) || positions.length < 3 ||
        !Number.isFinite(lapLength) || lapLength <= 0 ||
        !Number.isFinite(outerHalfWidth) ||
        outerHalfWidth <= RAIL_OFFSET_INWARD + CAR_RADIUS ||
        (normals !== null && (!Array.isArray(normals) ||
          normals.length !== positions.length))) {
      throw new Error("Invalid road layout");
    }
    const n = positions.length;
    const standardOffset = outerHalfWidth - RAIL_OFFSET_INWARD;
    const centerNormals = positions.map((_, i) =>
      normals ? { x: normals[i].x, z: normals[i].z } :
        normalAt(positions, i));
    const curvatures = positions.map((_, i) => curvatureAt(positions, i));

    function pathFor(sideSign) {
      const rawOffsets = curvatures.map(({ sign, radius }) =>
        sign === sideSign
          ? Math.min(standardOffset, Math.max(MIN_OFFSET,
            radius * INNER_RADIUS_FRACTION))
          : standardOffset);
      // A sliding minimum avoids abrupt kinks where the inside rail starts
      // narrowing. This is only applied to the inward-facing rail.
      const offsets = rawOffsets.map((_, i) => {
        let safe = standardOffset;
        for (let k = -CORNER_WINDOW; k <= CORNER_WINDOW; k++) {
          const j = (i + k + n) % n;
          safe = Math.min(safe, rawOffsets[j] +
            Math.abs(k) * (standardOffset - rawOffsets[j]) /
              (CORNER_WINDOW + 1));
        }
        return Math.max(MIN_OFFSET, safe);
      });
      const points = positions.map((p, i) => ({
        x: p.x + centerNormals[i].x * sideSign * offsets[i],
        z: p.z + centerNormals[i].z * sideSign * offsets[i],
      }));
      return { points, offsets, limits: offsets.map((v) => v - CAR_RADIUS) };
    }
    const left = pathFor(1), right = pathFor(-1);
    return {
      protectedSamples: new Uint8Array(n).fill(1),
      lengthMeters: lapLength,
      railOffset: standardOffset, carLimit: standardOffset - CAR_RADIUS,
      rails: { left, right },
    };
  }

  function resolve(previous, proposed, index, center, side, barriers) {
    if (!barriers.protectedSamples[index]) {
      return { ...proposed, collided: false };
    }
    const dx = proposed.x - center.x, dz = proposed.z - center.z;
    const lateral = dx * side.x + dz * side.z;
    const limit = barriers.rails
      ? (lateral >= 0 ? barriers.rails.left.limits[index] :
        barriers.rails.right.limits[index])
      : barriers.carLimit;
    if (Math.abs(lateral) <= limit) {
      return { ...proposed, collided: false };
    }
    const excess = lateral - Math.sign(lateral) * limit;
    const result = {
      ...proposed,
      x: proposed.x - side.x * excess,
      z: proposed.z - side.z * excess,
      collided: true,
    };

    // The old collision moved the car but left its nose pointing into the
    // wall. On the next frame the car immediately tried to turn back into it.
    // Remove this outward heading so the car runs along the guardrail
    // instead of appearing to steer towards it by itself.
    if (Number.isFinite(result.yaw) && Math.abs(result.speed || 0) > 0.02) {
      const travelSign = Math.sign(result.speed);
      const vx = -Math.sin(result.yaw) * travelSign;
      const vz = -Math.cos(result.yaw) * travelSign;
      const outward = Math.sign(lateral) * (vx * side.x + vz * side.z);
      if (outward > 1e-5) {
        const tx = side.z, tz = -side.x;
        const along = vx * tx + vz * tz;
        const alongSign = along >= 0 ? 1 : -1;
        // Heading is a body-forward vector, opposite the travel direction
        // when reversing. Keep the original forward/reverse orientation.
        result.yaw = Math.atan2(-tx * alongSign * travelSign,
          -tz * alongSign * travelSign);
      }
    }
    return result;
  }

  return Object.freeze({
    CAR_RADIUS, RAIL_OFFSET_INWARD, INNER_RADIUS_FRACTION,
    normalAt, curvatureAt, create, resolve,
  });
})();
if (typeof window !== "undefined") window.GcvBarriers = GcvBarriers;
if (typeof module !== "undefined" && module.exports) module.exports = GcvBarriers;
