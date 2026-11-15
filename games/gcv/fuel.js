"use strict";
// Deterministic fuel-pickup simulation; does not depend on Three.js or the DOM.
const GcvFuel = (() => {
  const RANGE_METRES = 1650;
  const PICKUP_GAIN = 0.38;
  const EMPTY_MAX_SPEED = 100 / 3.6;
  const PICKUP_RADIUS = 2.8;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function create({ positions, sides, sampleCount, trackLength, roadHalfWidth,
    startIndex = 0, finishIndex = sampleCount, closed = true,
    random = Math.random }) {
    const routeLength = (closed ? sampleCount : finishIndex - startIndex) *
      trackLength / sampleCount;
    const count = Math.max(1, Math.floor(Math.max(0, routeLength - 110) / 220));
    let level = 1, distance = 0, seed = 1, pickups = [], version = 0;

    function generate(value) {
      let state = (value >>> 0) || 1;
      const next = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
      };
      const slot = Math.max(1, routeLength - 110) / count;
      pickups = Array.from({ length: count }, (_, i) => {
        const metres = 65 + (i + 0.2 + next() * 0.6) * slot;
        const raw = Math.round(startIndex + metres * sampleCount / trackLength);
        const index = closed ? raw % sampleCount : Math.min(sampleCount, raw);
        const center = positions[index], side = sides[index];
        const lateral = (next() - 0.5) * Math.min(11, roadHalfWidth * 1.25);
        return { x: center.x + side.x * lateral, y: center.y,
          z: center.z + side.z * lateral, collectedAt: null };
      });
      version++;
    }

    function reset() {
      seed = Math.max(1, (random() * 4294967296) >>> 0);
      level = 1;
      distance = 0;
      generate(seed);
    }

    // Swept collision prevents fast cars skipping a pickup between frames.
    function tick(previous, current, travelled, jumpHeight = 0) {
      const moved = Math.max(0, Number.isFinite(travelled) ? travelled : 0);
      distance += moved;
      level = Math.max(0, level - moved / RANGE_METRES);
      let changed = false;
      for (const p of pickups) {
        if (p.collectedAt !== null && closed &&
            distance - p.collectedAt >= trackLength * 0.88) {
          p.collectedAt = null;
          changed = true;
        }
        if (p.collectedAt !== null || level >= 0.999 ||
            jumpHeight > 2 || !previous || !current) continue;
        const dx = current.x - previous.x, dz = current.z - previous.z;
        const length2 = dx * dx + dz * dz;
        const t = length2 > 0 ? clamp(
          ((p.x - previous.x) * dx + (p.z - previous.z) * dz) / length2,
          0, 1) : 0;
        const ox = p.x - (previous.x + dx * t);
        const oz = p.z - (previous.z + dz * t);
        if (ox * ox + oz * oz > PICKUP_RADIUS * PICKUP_RADIUS) continue;
        p.collectedAt = distance;
        level = Math.min(1, level + PICKUP_GAIN);
        changed = true;
      }
      if (changed) version++;
      return changed;
    }

    function snapshot() {
      return { seed, level, distance,
        collectedAt: pickups.map((p) => p.collectedAt) };
    }
    function restore(saved) {
      if (!saved || !Number.isSafeInteger(saved.seed) || saved.seed < 1 ||
          saved.seed > 0xffffffff || !Number.isFinite(saved.level) ||
          !Number.isFinite(saved.distance) || saved.distance < 0) {
        reset(); // Old or damaged session: full tank, fresh pickups.
        return false;
      }
      seed = saved.seed;
      level = clamp(saved.level, 0, 1);
      distance = saved.distance;
      generate(seed);
      if (Array.isArray(saved.collectedAt) &&
          saved.collectedAt.length === pickups.length) {
        pickups.forEach((p, i) => {
          const at = saved.collectedAt[i];
          p.collectedAt = Number.isFinite(at) && at >= 0 && at <= distance
            ? at : null;
        });
      }
      return true;
    }

    reset();
    return { get level() { return level; },
      get empty() { return level <= 0; },
      get pickups() { return pickups; },
      get version() { return version; },
      reset, restore, snapshot, tick };
  }
  return Object.freeze({ create, RANGE_METRES, PICKUP_GAIN, EMPTY_MAX_SPEED });
})();
if (typeof window !== "undefined") window.GcvFuel = GcvFuel;
if (typeof module !== "undefined" && module.exports) module.exports = GcvFuel;
