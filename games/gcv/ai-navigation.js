"use strict";
// Track-independent opponent guidance. The displayed road and AI both use
// World3D's sampled Catmull-Rom centreline; no hand-authored AI waypoints.
const GcvAiNavigation = (() => {
  const Physics = typeof GcvPhysics !== "undefined"
    ? GcvPhysics : require("./physics.js");
  const ACCELERATION = 10;
  const BRAKING = 40;
  const CORNER_ACCELERATION = 82; // Arcade lateral grip, in m/s².
  const STEP = 4; // Metres between planning points; never per-render-frame.
  const LOOK = 12; // Metres either side for stable curvature estimation.
  // Same nine driver identities/relative challenge on every generated route.
  const SKILLS = Object.freeze([1.03, 0.99, 0.94, 0.87, 0.81, 0.75, 0.69, 0.62, 0.55]);
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  function create({ positions, directions, sampleCount, startIndex, trackLength,
    routeLength, laps = 1, closed = true, maxSpeed = 250 / 3.6,
    roadHalfWidth = 9, heightAt = () => 0 }) {
    if (!Array.isArray(positions) || !Array.isArray(directions) ||
        !Number.isInteger(sampleCount) || sampleCount < 3 ||
        positions.length < sampleCount + 1 ||
        directions.length < sampleCount + 1 ||
        !Number.isFinite(trackLength) || trackLength <= 0 ||
        !Number.isFinite(routeLength) || routeLength <= 0 ||
        !Number.isInteger(startIndex) || startIndex < 0 ||
        startIndex >= sampleCount || !Number.isInteger(laps) || laps < 1 ||
        !Number.isFinite(maxSpeed) || maxSpeed <= 0 ||
        !Number.isFinite(roadHalfWidth) || roadHalfWidth <= 3 ||
        typeof heightAt !== "function")
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
      // Replaying many races on one screen must not retain every old
      // driver timetable forever. A clear rebuild costs only a few ms.
      if (cache.size >= 27) cache.clear();
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
    // All pseudo-physics is a pure function of race time and the same
    // sampled road as the player. A resume or a dropped frame cannot alter
    // an opponent's lane, angle, jump, or finishing time.
    function fractionAt(progress) {
      const raw = startIndex / sampleCount + progress / trackLength;
      return closed ? ((raw % 1) + 1) % 1 : clamp(raw, 0, 1);
    }
    function laneAt(ai, progress) {
      const gridLateral = Number(ai.lateral) || 0;
      const start = Number.isFinite(ai.startProgress) ? ai.startProgress : 0;
      const travelled = Math.max(0, progress - start);
      const f = clamp(travelled / 55, 0, 1);
      const transition = f * f * (3 - 2 * f);
      const seed = Number.isFinite(ai.laneSeed) ? ai.laneSeed :
        (((ai.id || 0) * 0.1743) % 1 + 1) % 1;
      // Individual preferred lanes with long, gentle lane changes. There
      // are no random calls during the race and no abrupt per-frame jitter.
      const target = 3.4 * Math.sin(seed * 9.87 + 0.35) +
        1.9 * Math.sin(progress / 145 + seed * 12.7) +
        1.0 * Math.sin(progress / 67 + seed * 27.4);
      return clamp(gridLateral * (1 - transition) + target * transition,
        -roadHalfWidth + 2.2, roadHalfWidth - 2.2);
    }
    // Direct evaluation of the existing distance/time timetable, with no
    // dependency on how frequently the renderer advances.
    function sampleAt(path, seconds) {
      const t = clamp(Number.isFinite(seconds) ? seconds : 0,
        0, path.totalTime);
      if (t === path.totalTime) return { progress: finish,
        speed: path.speeds[path.count], finishTime: path.totalTime };
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
        speed: v0 + (v1 - v0) * local / duration, finishTime: null,
      };
    }
    function airborneHeight(jump, time, progress) {
      const t = Math.max(0, time - jump.takeoff);
      return jump.roadY + jump.velocity * t -
        0.5 * Physics.JUMP_GRAVITY * t * t -
        heightAt(fractionAt(progress));
    }
    function jumpsFor(ai, path) {
      if (path.jumps) return path.jumps;
      const jumps = [];
      let cooldownEnd = 0;
      for (let i = 1; i < path.count; i++) {
        const takeoff = path.times[i];
        if (takeoff < cooldownEnd) continue;
        const progress = path.start + i * path.ds;
        const fraction = fractionAt(progress);
        // Exactly the same takeoff criterion, road profile, gravity, and
        // safe paved-road requirement as the player.
        const velocity = Physics.takeoffVelocity(fraction, path.speeds[i],
          trackLength, heightAt, laneAt(ai, progress),
          roadHalfWidth - 1.8);
        if (velocity === null) continue;
        const jump = { takeoff, velocity, roadY: heightAt(fraction),
          landing: path.totalTime };
        let lastTime = takeoff, airborne = false;
        for (let j = i + 1; j <= path.count &&
            path.times[j] - takeoff <= 8; j++) {
          const nextTime = path.times[j];
          const nextProgress = path.start + j * path.ds;
          const height = airborneHeight(jump, nextTime, nextProgress);
          if (height > Physics.JUMP_CLEARANCE) airborne = true;
          if (airborne && height <= 0) {
            let low = lastTime, high = nextTime;
            for (let k = 0; k < 12; k++) {
              const mid = (low + high) / 2;
              if (airborneHeight(jump, mid,
                sampleAt(path, mid).progress) > 0) low = mid;
              else high = mid;
            }
            jump.landing = high;
            break;
          }
          lastTime = nextTime;
        }
        if (!airborne) continue;
        jumps.push(jump);
        cooldownEnd = jump.landing + 1;
      }
      path.jumps = jumps;
      return jumps;
    }
    function sample(ai, seconds) {
      const path = plan(ai);
      const result = sampleAt(path, seconds);
      const progress = result.progress, speed = result.speed;
      const lateral = laneAt(ai, progress);
      const laneSlope = (laneAt(ai, progress + 2) -
        laneAt(ai, progress - 2)) / 4;
      const a = directionAt(progress - LOOK);
      const b = directionAt(progress + LOOK);
      const angle = Math.atan2(a.x * b.z - a.z * b.x,
        a.x * b.x + a.z * b.z);
      const curvature = angle / (2 * LOOK);
      // The yaw leads into the corner a little more than the travel
      // direction: rear tyres appear to slide rather than being on rails.
      const slip = clamp(curvature * speed * speed * 0.00135, -0.12, 0.12);
      const yawOffset = -Math.atan(laneSlope) - slip;
      const roll = clamp(-slip * 0.6 - laneSlope * 0.12, -0.10, 0.10);
      const slope = (heightAt(fractionAt(progress + 3)) -
        heightAt(fractionAt(progress - 3))) / 6;
      let pitch = clamp(Math.atan(slope), -0.22, 0.22);
      let jumpY = 0, landing = 0;
      for (const jump of jumpsFor(ai, path)) {
        if (seconds >= jump.takeoff && seconds < jump.landing) {
          jumpY = Math.max(0, airborneHeight(jump, seconds, progress));
          const vy = jump.velocity -
            Physics.JUMP_GRAVITY * (seconds - jump.takeoff);
          pitch = clamp(vy * 0.015, -0.22, 0.22);
          break;
        }
        if (seconds >= jump.landing && seconds < jump.landing + 0.34) {
          landing = Math.pow(1 - (seconds - jump.landing) / 0.34, 2);
          pitch += 0.045 * landing *
            Math.sin((seconds - jump.landing) * 34);
        }
      }
      return { ...result, lateral, yawOffset, roll, pitch,
        jumpY, landing };
    }
    // Timetable models are runtime-only; saves contain just each driver's
    // start slot, stable skill and elapsed time, so resumes rebuild the
    // exact same route without serializing thousands of samples.
    return Object.freeze({ plan, sample, finish, curveLimit, directionAt, laneAt });
  }
  return Object.freeze({ create, SKILLS, ACCELERATION, BRAKING });
})();
if (typeof window !== "undefined") window.GcvAiNavigation = GcvAiNavigation;
if (typeof module !== "undefined" && module.exports)
  module.exports = GcvAiNavigation;
