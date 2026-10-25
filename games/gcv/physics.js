"use strict";
// Deterministic, dependency-free driving physics; units: metres, seconds, radians.
const GcvPhysics = (() => {
  const MAX_SPEED = 46; // 165.6 km/h
  const MAX_STEER_RATE = 2.35; // More responsive than the original 1.45 rad/s
  const GRAVITY = 9.81;
  const FALL_SECONDS = 2;
  const CAR_HEIGHT = 0.14;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function advance(state, input, dt) {
    const elapsed = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.05);
    const currentSpeed = clamp(Number(state.speed) || 0, 0, MAX_SPEED);
    const gas = Boolean(input.accelerate);
    const brake = Boolean(input.brake);
    const gravel = Boolean(input.gravel);
    // Gravel slows the car down and slightly reduces lateral grip.
    const drag = 1.4 + 0.006 * currentSpeed * currentSpeed + (gravel ? 7 : 0);
    const acceleration = (gas ? 20 : 0) - (brake ? 31 : 0) - drag;
    const speed = clamp(currentSpeed + acceleration * elapsed, 0, MAX_SPEED);
    const steer = clamp(Number(input.steer) || 0, -1, 1);
    // Full steering response begins at low speed without spinning while stopped.
    const grip = gravel ? 0.78 : 1;
    const yaw = state.yaw - steer * Math.min(speed / 8.5, 1) *
      MAX_STEER_RATE * grip * elapsed;
    return {
      x: state.x - Math.sin(yaw) * speed * elapsed,
      z: state.z - Math.cos(yaw) * speed * elapsed,
      yaw,
      speed,
    };
  }

  // Airborne motion is independent from road steering/braking. Timer starts
  // immediately when the outer edge of the gravel is crossed.
  function startFall(state) {
    const speed = Math.max(0, Number(state.speed) || 0);
    return {
      x: state.x, z: state.z, y: CAR_HEIGHT,
      vx: -Math.sin(state.yaw) * speed,
      vz: -Math.cos(state.yaw) * speed,
      vy: 0, elapsed: 0, remaining: FALL_SECONDS,
    };
  }

  function advanceFall(fall, dt) {
    const step = Math.min(fall.remaining, clamp(Number.isFinite(dt) ? dt : 0, 0, 0.05));
    const elapsed = Math.min(FALL_SECONDS, fall.elapsed + step);
    const damping = Math.exp(-0.12 * step); // Air resistance, not abrupt stopping.
    return {
      x: fall.x + fall.vx * step,
      z: fall.z + fall.vz * step,
      y: CAR_HEIGHT - GRAVITY * elapsed * elapsed / 2,
      vx: fall.vx * damping,
      vz: fall.vz * damping,
      vy: -GRAVITY * elapsed,
      elapsed,
      remaining: Math.max(0, FALL_SECONDS - elapsed),
    };
  }

  return Object.freeze({
    MAX_SPEED, MAX_STEER_RATE, GRAVITY, FALL_SECONDS,
    advance, startFall, advanceFall,
  });
})();

if (typeof window !== "undefined") window.GcvPhysics = GcvPhysics;
if (typeof module !== "undefined" && module.exports) module.exports = GcvPhysics;
