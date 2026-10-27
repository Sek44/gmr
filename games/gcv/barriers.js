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
  const CONTACT_ALIGN_RATE = 3.5; // Heading converges smoothly in contact.
  const MAX_CONTACT_ANGLE = Math.PI / 3; // Never face backwards along the track.
  const ROAD_EDGE_MARGIN = CAR_RADIUS + 0.35; // Keep posts and car clear of the roadway.
  const MAX_CONTACT_SPEED = 100 / 3.6; // 100 km/h while scraping a guardrail.
  const CONTACT_FRICTION = 4; // Additional m/s² lost to wall rubbing.
  const CONTACT_DAMPING = 0.9; // Speed-dependent wall friction.
  const CONTACT_MARGIN = 0.025; // Still rubbing when exactly flush with a rail.

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

  function segmentsIntersect(a, b, c, d) {
    const ax = b.x - a.x, az = b.z - a.z;
    const bx = d.x - c.x, bz = d.z - c.z;
    const determinant = ax * bz - az * bx;
    if (Math.abs(determinant) < 1e-10) return false;
    const dx = c.x - a.x, dz = c.z - a.z;
    const t = (dx * bz - dz * bx) / determinant;
    const u = (dx * az - dz * ax) / determinant;
    return t > 1e-5 && t < 1 - 1e-5 &&
      u > 1e-5 && u < 1 - 1e-5;
  }

  function railIntersections(points) {
    const hits = [], n = points.length;
    // Check non-neighbouring guardrail segments, including the closing seam.
    for (let i = 0; i < n; i++) {
      const nextI = (i + 1) % n;
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        if (segmentsIntersect(points[i], points[nextI],
          points[j], points[(j + 1) % n])) hits.push([i, j]);
      }
    }
    return hits;
  }

  // Moving a folded inside rail closer to the centerline can put it on the
  // driving surface. Join the arms where they intersect and discard only the
  // tiny folded arc. The rail remains continuous at the outer shoulder.
  function clipFoldedLoops(points, skippedSamples) {
    const n = points.length;
    for (let pass = 0; pass < 24; pass++) {
      const crossings = railIntersections(points);
      if (!crossings.length) return;
      const [i, j] = crossings[0];
      const a = points[i], b = points[(i + 1) % n];
      const c = points[j], d = points[(j + 1) % n];
      const ax = b.x - a.x, az = b.z - a.z;
      const bx = d.x - c.x, bz = d.z - c.z;
      const cx = c.x - a.x, cz = c.z - a.z;
      const determinant = ax * bz - az * bx;
      if (Math.abs(determinant) < 1e-10) break;
      const t = (cx * bz - cz * bx) / determinant;
      const junction = { x: a.x + ax * t, z: a.z + az * t };
      const forward = j - i;
      const backward = n - forward;
      const first = forward <= backward ? i + 1 : j + 1;
      const count = Math.min(forward, backward);
      for (let k = 0; k < count; k++) {
        const index = (first + k) % n;
        points[index] = { ...junction };
        skippedSamples[index] = 1;
      }
    }
    if (railIntersections(points).length) {
      throw new Error("Unable to remove intersecting guardrail loops");
    }
  }

  function untangleRail(positions, normals, sign, offsets, points, minimumOffset) {
    const n = points.length;
    for (let pass = 0; pass < 10; pass++) {
      const crossings = railIntersections(points);
      if (!crossings.length) break;
      const factors = new Float64Array(n).fill(1);
      for (const [i, j] of crossings) {
        // Move the short folded arc closer to the track centerline, with a
        // tapered transition outside both crossing segments.
        const directLength = j - i;
        const start = directLength <= n / 2 ? i : j;
        const count = directLength <= n / 2
          ? directLength + 1 : n - directLength + 1;
        const taper = 8;
        for (let k = -taper; k <= count + taper; k++) {
          const blend = Math.max(0, Math.min(1,
            (k + taper) / taper, (count + taper - k) / taper));
          const index = (start + k + n) % n;
          factors[index] = Math.min(factors[index], 1 - .34 * blend);
        }
      }
      for (let i = 0; i < n; i++) {
        // Uncrossing must never pull a rail back onto the driving surface.
        offsets[i] = Math.max(minimumOffset, offsets[i] * factors[i]);
        points[i].x = positions[i].x + normals[i].x * sign * offsets[i];
        points[i].z = positions[i].z + normals[i].z * sign * offsets[i];
      }
    }
  }

  function create(positions, lapLength, outerHalfWidth, normals = null,
                  roadHalfWidth = null) {
    if (!Array.isArray(positions) || positions.length < 3 ||
        !Number.isFinite(lapLength) || lapLength <= 0 ||
        !Number.isFinite(outerHalfWidth) ||
        outerHalfWidth <= RAIL_OFFSET_INWARD + CAR_RADIUS ||
        (normals !== null && (!Array.isArray(normals) ||
          normals.length !== positions.length)) ||
        (roadHalfWidth !== null && (!Number.isFinite(roadHalfWidth) ||
          roadHalfWidth <= 0 ||
          roadHalfWidth + ROAD_EDGE_MARGIN >=
            outerHalfWidth - RAIL_OFFSET_INWARD))) {
      throw new Error("Invalid road layout");
    }
    const n = positions.length;
    const standardOffset = outerHalfWidth - RAIL_OFFSET_INWARD;
    // The road half-width comes from the same layout as the road mesh.
    // Even on tight inside bends, guardrails must remain on the shoulder.
    const minimumOffset = roadHalfWidth === null ? MIN_OFFSET :
      Math.max(MIN_OFFSET, roadHalfWidth + ROAD_EDGE_MARGIN);
    const centerNormals = positions.map((_, i) =>
      normals ? { x: normals[i].x, z: normals[i].z } :
        normalAt(positions, i));
    const curvatures = positions.map((_, i) => curvatureAt(positions, i));

    function pathFor(sideSign) {
      const rawOffsets = curvatures.map(({ sign, radius }) =>
        // Keep legacy behavior for tracks without a defined roadway width.
        // For GCV, keep the rails near the outside of the entire shoulder.
        roadHalfWidth !== null ? standardOffset :
        sign === sideSign
          ? Math.min(standardOffset, Math.max(minimumOffset,
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
        return Math.max(minimumOffset, safe);
      });
      const points = positions.map((p, i) => ({
        x: p.x + centerNormals[i].x * sideSign * offsets[i],
        z: p.z + centerNormals[i].z * sideSign * offsets[i],
      }));
      const skippedSamples = new Uint8Array(n);
      if (roadHalfWidth !== null) {
        // Eliminate the self-crossing curls instead of reducing the shoulder.
        clipFoldedLoops(points, skippedSamples);
      } else {
        untangleRail(positions, centerNormals, sideSign, offsets, points,
          minimumOffset);
      }
      return { points, offsets, skippedSamples,
        limits: offsets.map((v) => v - CAR_RADIUS) };
    }
    const left = pathFor(1), right = pathFor(-1);
    return {
      protectedSamples: new Uint8Array(n).fill(1),
      lengthMeters: lapLength,
      railOffset: standardOffset, carLimit: standardOffset - CAR_RADIUS,
      rails: { left, right },
    };
  }

  function resolve(previous, proposed, index, center, side, barriers, dt = 1 / 60) {
    if (!barriers.protectedSamples[index]) {
      return { ...proposed, collided: false };
    }
    const dx = proposed.x - center.x, dz = proposed.z - center.z;
    const lateral = dx * side.x + dz * side.z;
    const limit = barriers.rails
      ? (lateral >= 0 ? barriers.rails.left.limits[index] :
        barriers.rails.right.limits[index])
      : barriers.carLimit;
    // Count tangential sliding at the wall as contact, even when there is no
    // new penetration. Otherwise a perfectly aligned car could accelerate
    // past the 100 km/h contact limit.
    if (Math.abs(lateral) < limit - CONTACT_MARGIN) {
      return { ...proposed, collided: false };
    }
    const excess = Math.sign(lateral) * Math.max(0, Math.abs(lateral) - limit);
    const step = Math.max(0, Math.min(0.05, Number.isFinite(dt) ? dt : 1 / 60));
    // Cap a fast impact immediately, then slow the car continuously while
    // rubbing. Preserve the speed sign so backing away stays possible.
    const rawSpeed = Number(proposed.speed) || 0;
    const cappedSpeed = Math.min(Math.abs(rawSpeed), MAX_CONTACT_SPEED);
    const lostSpeed = (CONTACT_FRICTION + CONTACT_DAMPING * cappedSpeed) * step;
    const result = {
      ...proposed,
      x: proposed.x - side.x * excess,
      z: proposed.z - side.z * excess,
      speed: Math.sign(rawSpeed) * Math.max(0, cappedSpeed - lostSpeed),
      collided: true,
    };

    // The vehicle follows the actual physical guardrail, not an approximate
    // centerline: the two tangents may differ at tight bends.
    let forwardX = side.z, forwardZ = -side.x;
    const rail = barriers.rails &&
      (lateral >= 0 ? barriers.rails.left : barriers.rails.right);
    if (rail && rail.points.length >= 3 &&
        !(rail.skippedSamples && rail.skippedSamples[index])) {
      const points = rail.points, n = points.length;
      const before = points[(index + n - 1) % n];
      const after = points[(index + 1) % n];
      const tx = after.x - before.x, tz = after.z - before.z;
      const length = Math.hypot(tx, tz);
      if (length > 1e-8) {
        // Use the same forward direction as the circuit, not the reverse
        // orientation of the rail segment.
        const direction = tx * forwardX + tz * forwardZ >= 0 ? 1 : -1;
        forwardX = direction * tx / length;
        forwardZ = direction * tz / length;
      }
    }

    const railYaw = Math.atan2(-forwardX, -forwardZ);
    const difference = Math.atan2(
      Math.sin(proposed.yaw - railYaw), Math.cos(proposed.yaw - railYaw));
    // Keep the heading in the forward hemisphere on first impact. While the
    // vehicle stays against the wall it aligns progressively, overcoming
    // continuous player steering towards the rail without a sudden snap.
    const safeDifference = Math.max(-MAX_CONTACT_ANGLE,
      Math.min(MAX_CONTACT_ANGLE, difference));
    const alignedYaw = railYaw + safeDifference * Math.exp(-CONTACT_ALIGN_RATE * step);
    // Extra guarantee for very sharp bends: a contracted rail can have a
    // tangent quite different from the road. Collision must NEVER rotate
    // the car into the opposite half-plane of the circuit itself.
    const courseYaw = Math.atan2(-side.z, side.x);
    const courseDifference = Math.atan2(
      Math.sin(alignedYaw - courseYaw), Math.cos(alignedYaw - courseYaw));
    const maxCourseAngle = Math.PI * 0.44; // strictly less than 90 degrees
    result.yaw = courseYaw + Math.max(-maxCourseAngle,
      Math.min(maxCourseAngle, courseDifference));
    return result;
  }

  return Object.freeze({
    CAR_RADIUS, RAIL_OFFSET_INWARD, INNER_RADIUS_FRACTION, ROAD_EDGE_MARGIN,
    MAX_CONTACT_SPEED,
    normalAt, curvatureAt, railIntersections, create, resolve,
  });
})();
if (typeof window !== "undefined") window.GcvBarriers = GcvBarriers;
if (typeof module !== "undefined" && module.exports) module.exports = GcvBarriers;
