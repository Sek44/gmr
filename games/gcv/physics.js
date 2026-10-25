"use strict";
// Deterministic, dependency-free driving physics; values are metres and seconds.
const GcvPhysics = (() => {
  const MAX_SPEED = 46; // 165.6 km/h
  const MAX_STEER_RATE = 1.45; // radians/s at normal driving speed
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function advance(state, input, dt) {
    const elapsed = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.05);
    const currentSpeed = clamp(Number(state.speed) || 0, 0, MAX_SPEED);
    const gas = Boolean(input.accelerate);
    const brake = Boolean(input.brake);
    const drag = 1.4 + 0.006 * currentSpeed * currentSpeed;
    const acceleration = (gas ? 20 : 0) - (brake ? 31 : 0) - drag;
    const speed = clamp(currentSpeed + acceleration * elapsed, 0, MAX_SPEED);
    const steer = clamp(Number(input.steer) || 0, -1, 1);
    // Turning requires motion. A neutral control maintains the current heading.
    const yaw = state.yaw - steer * Math.min(speed / 14, 1) * MAX_STEER_RATE * elapsed;
    return {
      x: state.x - Math.sin(yaw) * speed * elapsed,
      z: state.z - Math.cos(yaw) * speed * elapsed,
      yaw,
      speed,
    };
  }

  return Object.freeze({ MAX_SPEED, advance });
})();

if (typeof window !== "undefined") window.GcvPhysics = GcvPhysics;
if (typeof module !== "undefined" && module.exports) module.exports = GcvPhysics;
