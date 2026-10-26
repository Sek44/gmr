"use strict";
// Deterministic, dependency-free driving physics; units: metres, seconds, radians.
const GcvPhysics = (() => {
  const MAX_SPEED = 250 / 3.6; // 250 km/h
  const MAX_STEER_RATE = 1.45; // Original steering sensitivity.
  const BRAKE_DECELERATION = 82; // m/s²; substantially stronger than before.
  const REVERSE_DELAY = 0.8; // Hold the brake this long *after stopping*.
  const REVERSE_MAX_SPEED = 4; // 14.4 km/h
  const REVERSE_ACCELERATION = 7;
  const GRAVITY = 9.81;
  const FALL_SECONDS = 2;
  const CAR_HEIGHT = 0.14;
  const INITIAL_FALL_VELOCITY = -7; // m/s: descent is immediate at the track edge.
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function advance(state, input, dt) {
    const elapsed = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.05);
    const currentSpeed = clamp(Number(state.speed) || 0, -REVERSE_MAX_SPEED, MAX_SPEED);
    const gas = Boolean(input.accelerate);
    const brake = Boolean(input.brake);
    // Paved-road handling on the muddy-looking track AND safety shoulders.
    const drag = 1.4 + 0.003 * currentSpeed * currentSpeed;
    let speed;
    let reverseHold = 0;

    if (brake) {
      if (currentSpeed > 0) {
        speed = Math.max(0, currentSpeed - (BRAKE_DECELERATION + drag) * elapsed);
        // Keep braking at zero before reverse engages; never leap into reverse.
      } else {
        reverseHold = Math.max(0, Number(state.reverseHold) || 0) + elapsed;
        const reverseAcceleration = reverseHold >= REVERSE_DELAY ? REVERSE_ACCELERATION : 0;
        speed = Math.max(-REVERSE_MAX_SPEED, currentSpeed - reverseAcceleration * elapsed);
      }
    } else if (gas) {
      speed = clamp(currentSpeed + (25 - Math.sign(currentSpeed) * drag) * elapsed,
        -REVERSE_MAX_SPEED, MAX_SPEED);
    } else {
      // Drag brings a rolling car to rest in either direction.
      speed = Math.sign(currentSpeed) * Math.max(0, Math.abs(currentSpeed) - drag * elapsed);
    }

    const steer = clamp(Number(input.steer) || 0, -1, 1);
    const yaw = state.yaw - steer * Math.sign(speed) *
      Math.min(Math.abs(speed) / 14, 1) * MAX_STEER_RATE * elapsed;
    return {
      x: state.x - Math.sin(yaw) * speed * elapsed,
      z: state.z - Math.cos(yaw) * speed * elapsed,
      yaw,
      speed,
      reverseHold,
    };
  }

  // An intentionally high threshold for visual mud spray. Normal steering,
  // normal braking and simply touching the shoulder must never spawn mud.
  // This approximates excessive lateral load without changing driving physics.
  function skidIntensity(speed, steering) {
    const v = Math.abs(Number(speed) || 0);
    const turn = Math.min(1, Math.abs(Number(steering) || 0));
    if (v < 30 || turn < 0.80) return 0;
    const lateralLoad = v * MAX_STEER_RATE * turn;
    return Math.min(1.5, Math.max(0, (lateralLoad - 45) / 32));
  }

  // Airborne motion is independent from road steering/braking. Timer starts
  // immediately when the outer edge of the gravel is crossed.
  function startFall(state) {
    const speed = Number(state.speed) || 0; // Preserve signed momentum while reversing.
    return {
      x: state.x, z: state.z, y: CAR_HEIGHT,
      vx: -Math.sin(state.yaw) * speed,
      vz: -Math.cos(state.yaw) * speed,
      initialVy: INITIAL_FALL_VELOCITY,
      vy: INITIAL_FALL_VELOCITY, elapsed: 0, remaining: FALL_SECONDS,
    };
  }

  function advanceFall(fall, dt) {
    // Unlike road integration, the fall timer uses real elapsed time even at low FPS.
    const step = Math.min(fall.remaining, Math.max(0, Number.isFinite(dt) ? dt : 0));
    const elapsed = Math.min(FALL_SECONDS, fall.elapsed + step);
    const damping = Math.exp(-0.12 * step); // Air resistance, not abrupt stopping.
    return {
      x: fall.x + fall.vx * step,
      z: fall.z + fall.vz * step,
      y: CAR_HEIGHT + fall.initialVy * elapsed - GRAVITY * elapsed * elapsed / 2,
      vx: fall.vx * damping,
      vz: fall.vz * damping,
      vy: fall.initialVy - GRAVITY * elapsed,
      initialVy: fall.initialVy,
      elapsed,
      remaining: Math.max(0, FALL_SECONDS - elapsed),
    };
  }

  return Object.freeze({
    MAX_SPEED, MAX_STEER_RATE, BRAKE_DECELERATION,
    REVERSE_DELAY, REVERSE_MAX_SPEED, GRAVITY, FALL_SECONDS,
    INITIAL_FALL_VELOCITY,
    advance, skidIntensity, startFall, advanceFall,
  });
})();

if (typeof window !== "undefined") window.GcvPhysics = GcvPhysics;
if (typeof module !== "undefined" && module.exports) module.exports = GcvPhysics;
