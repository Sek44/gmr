"use strict";
// Track-independent opponent guidance. The displayed road and AI both use
// World3D's sampled Catmull-Rom centreline; no hand-authored AI waypoints.
const GcvAiNavigation = (() => {
  const ACCELERATION = 10;
  const BRAKING = 40;
  const CORNER_ACCELERATION = 82; // Arcade lateral grip, in m/s².
  const STEP = 4; // Metres between planning points; never per-render-frame.
  const LOOK = 12; // Metres either side for stable curvature estimation.
  // Same nine driver identities/relative challenge on every generated route.
  const SKILLS = Object.freeze([1.03, 0.99, 0.94, 0.87, 0.81, 0.75, 0.69, 0.62, 0.55]);
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  function create({ positions, directions, sampleCount, startIndex, trackLength,
    routeLength, laps = 1, closed = true, maxSpeed = 250 / 3.6 }) {
    if (!Array.isArray(positions) || !Array.isArray(directions) ||
        !Number.isInteger(sampleCount) || sampleCount < 3 ||
        positions.length < sampleCount + 1 ||
        directions.length < sampleCount + 1 ||
        !Number.isFinite(trackLength) || trackLength <= 0 ||
        !Number.isFinite(routeLength) || routeLength <= 0 ||
        !Number.isInteger(startIndex) || startIndex < 0 ||
        startIndex >= sampleCount || !Number.isInteger(laps) || laps < 1 ||
        !Number.isFinite(maxSpeed) || maxSpeed <= 0)
      throw new RangeError("Invalid sampled track for AI navigation");

    const finish = routeLength * laps;
    const cache = new Map();
    function sampleIndex(progress) {
      const raw = startIndex + progress * sampleCount / trackLength;
      return closed ? ((raw % sampleCount) + sampleCount) % sampleCount
        : clamp(raw, 0, sampleCount);
    }
    function directionAt(progress) {
      const value = sampleIndex(progress);
      const i = Math.floor(value), j = Math.min(i + 1, sampleCount);
      const fraction = value - i;
      const a = directions[i], b = directions[j];
      const x = a.x * (1 - fraction) + b.x * fraction;
      const z = a.z * (1 - fraction) + b.z * fraction;
      const magnitude = Math.hypot(x, z) || 1;
      return { x: x / magnitude, z: z / magnitude };
    }
    function curveLimit(progress) {
      // Use the *actual world curve* (not the polyline template angles).
      // The two-sided estimate sees entry and exit of a bend before it
      // arrives; the backward brake pass handles approach distances.
      const a = directionAt(progress - LOOK);
      const b = directionAt(progress + LOOK);
      const angle = Math.atan2(a.x * b.z - a.z * b.x,
        a.x * b.x + a.z * b.z);
      const curvature = Math.abs(angle) / (2 * LOOK);
      return Math.min(maxSpeed, Math.sqrt(CORNER_ACCELERATION /
        Math.max(1e-6, curvature)));
    }
    function plan(ai) {
      if (!Number.isFinite(ai.strength) || ai.strength <= 0 ||
          !Number.isFinite(ai.startProgress) || ai.startProgress >= finish)
        throw new RangeError("Invalid AI driver");
      const key = ai.id + ":" + ai.startProgress + ":" + ai.strength;
      if (cache.has(key)) return cache.get(key);
      const distance = finish - ai.startProgress;
      const count = Math.max(1, Math.ceil(distance / STEP));
      const ds = distance / count;
      const speeds = new Float64Array(count + 1);
      const times = new Float64Array(count + 1);
      // A skill factor scales straight-line pace and corner grip together.
      // Speed peaks at the same physical upper bound as the player's car.
      for (let i = 0; i <= count; i++) {
        const progress = ai.startProgress + i * ds;
        speeds[i] = clamp(curveLimit(progress) *
          clamp(ai.strength, 0.35, 1.05), 1, maxSpeed);
      }
      speeds[0] = 0; // All drivers launch from the grid at rest.
      for (let i = 1; i <= count; i++) {
        speeds[i] = Math.min(speeds[i],
          Math.sqrt(speeds[i - 1] ** 2 + 2 * ACCELERATION * ds));
      }
      for (let i = count - 1; i >= 1; i--) {
        speeds[i] = Math.min(speeds[i],
          Math.sqrt(speeds[i + 1] ** 2 + 2 * BRAKING * ds));
      }
      for (let i = 1; i <= count; i++) {
        times[i] = times[i - 1] +
          2 * ds / (speeds[i - 1] + speeds[i]);
      }
      const result = { speeds, times, ds, count,
        start: ai.startProgress, finish, totalTime: times[count] };
      cache.set(key, result);
      return result;
    }
    function sample(ai, seconds) {
      const path = plan(ai);
      const t = clamp(Number.isFinite(seconds) ? seconds : 0,
        0, path.totalTime);
      if (t === path.totalTime) return { progress: finish,
        speed: path.speeds[path.count], finishTime: path.totalTime };
      // Binary search gives deterministic results regardless of frame size.
      let low = 0, high = path.count;
      while (low + 1 < high) {
        const mid = (low + high) >> 1;
        if (path.times[mid] <= t) low = mid;
        else high = mid;
      }
      const duration = path.times[low + 1] - path.times[low];
      const local = t - path.times[low];
      const v0 = path.speeds[low], v1 = path.speeds[low + 1];
      const moved = v0 * local + (v1 - v0) * local * local /
        (2 * duration);
      return {
        progress: Math.min(finish, path.start + low * path.ds + moved),
        speed: v0 + (v1 - v0) * local / duration,
        finishTime: t >= path.totalTime ? path.totalTime : null,
      };
    }
    // Timetable models are runtime-only; saves contain just each driver's
    // start slot, stable skill and elapsed time, so resumes rebuild the
    // exact same route without serializing thousands of samples.
    return Object.freeze({ plan, sample, finish, curveLimit, directionAt });
  }
  return Object.freeze({ create, SKILLS, ACCELERATION, BRAKING });
})();
if (typeof window !== "undefined") window.GcvAiNavigation = GcvAiNavigation;
if (typeof module !== "undefined" && module.exports)
  module.exports = GcvAiNavigation;
