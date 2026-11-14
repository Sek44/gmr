"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const physics = require("../games/gcv/physics.js");

const standing = () => ({ x: 0, z: 0, yaw: 0, speed: 0 });

test("accelerating drives a stationary car forward", () => {
  let car = standing();
  for (let i = 0; i < 90; i++) {
    car = physics.advance(car, { accelerate: true, brake: false, steer: 0 }, 1 / 60);
  }
  assert.ok(car.speed > 0 && car.speed <= physics.MAX_SPEED);
  assert.ok(car.z < 0);
  assert.equal(car.x, 0);
  assert.equal(car.yaw, 0);
});

test("hard braking stops the car before the delayed reverse engages", () => {
  let car = { x: 0, z: 0, yaw: 0, speed: 30 };
  for (let i = 0; i < 25; i++) {
    car = physics.advance(car, { brake: true, steer: 0 }, 1 / 60);
  }
  assert.equal(car.speed, 0);
  assert.ok(car.reverseHold >= 0 && car.reverseHold < physics.REVERSE_DELAY);
});

test("left and right steering turn the car in opposite directions", () => {
  const rolling = { x: 0, z: 0, yaw: 0, speed: 22 };
  const left = physics.advance(rolling, { steer: -1 }, 1 / 60);
  const right = physics.advance(rolling, { steer: 1 }, 1 / 60);
  assert.ok(left.x < 0 && left.yaw > 0);
  assert.ok(right.x > 0 && right.yaw < 0);
  assert.equal(rolling.yaw, 0, "advance must not mutate the original car");
});

test("a stationary car does not spin when the direction is touched", () => {
  const car = physics.advance(standing(), { steer: 1 }, 1 / 60);
  assert.equal(car.yaw, 0);
});

test("speed and time steps are bounded", () => {
  let car = { x: 0, z: 0, yaw: 0, speed: physics.MAX_SPEED };
  car = physics.advance(car, { accelerate: true, steer: 0 }, 5);
  assert.equal(car.speed, physics.MAX_SPEED);
  assert.ok(Math.abs(car.z) <= physics.MAX_SPEED * 0.05 + 0.0001);
});

test("no input allows the car to coast to a stop", () => {
  let car = { x: 0, z: 0, yaw: 0, speed: 12 };
  for (let i = 0; i < 4000; i++) {
    car = physics.advance(car, {}, 1 / 60);
  }
  assert.equal(car.speed, 0);
});

test("steering returns to its original 1.45 rad/s sensitivity", () => {
  const rolling = { x: 0, z: 0, yaw: 0, speed: 18 };
  const turned = physics.advance(rolling, { steer: 1 }, 1 / 60);
  assert.ok(Math.abs(turned.yaw + 1.45 / 60) < 1e-9);
  assert.equal(physics.MAX_STEER_RATE, 1.45);
});

test("earth shoulder and track have identical paved-road handling", () => {
  const rolling = { x: 0, z: 0, yaw: 0, speed: 20 };
  const road = physics.advance(rolling, { accelerate: true, steer: 1 }, 1 / 60);
  const shoulder = physics.advance(rolling,
    { accelerate: true, steer: 1, gravel: true }, 1 / 60);
  assert.deepEqual(shoulder, road);
});

test("a falling car keeps forward momentum while gravity lowers it", () => {
  const initial = { x: 4, z: 15, yaw: 0, speed: 18 };
  let fall = physics.startFall(initial);
  assert.equal(fall.remaining, 2);
  for (let i = 0; i < 60; i++) fall = physics.advanceFall(fall, 1 / 60);
  assert.ok(fall.z < initial.z - 10, "car should travel into the air");
  assert.ok(fall.y < -4.5, "car should have fallen under gravity");
  assert.ok(fall.vy < 0, "downward velocity increases");
  assert.ok(Math.abs(fall.remaining - 1) < 1e-8, "countdown starts with the fall");
  for (let i = 0; i < 60; i++) fall = physics.advanceFall(fall, 1 / 60);
  assert.ok(Math.abs(fall.remaining) < 1e-8);
  assert.ok(Math.abs(fall.y - (0.14 + physics.INITIAL_FALL_VELOCITY * 2 - 0.5 * 9.81 * 4)) < 1e-6);
});

test("the fall timer never runs past two seconds", () => {
  let fall = physics.startFall({ x: 0, z: 0, yaw: 0, speed: 12 });
  for (let i = 0; i < 150; i++) fall = physics.advanceFall(fall, 1 / 60);
  assert.equal(fall.remaining, 0);
  assert.equal(fall.elapsed, physics.FALL_SECONDS);
});

test("fall countdown uses elapsed seconds even when frames are slow", () => {
  let fall = physics.startFall({ x: 0, z: 0, yaw: 0, speed: 20 });
  fall = physics.advanceFall(fall, 1.2);
  assert.ok(Math.abs(fall.remaining - 0.8) < 1e-10);
  assert.ok(fall.z < -20);
  fall = physics.advanceFall(fall, 1.1);
  assert.equal(fall.remaining, 0);
  assert.equal(fall.elapsed, 2);
});

test("the stronger brake reduces speed much faster than the old 31 m/s²", () => {
  const before = { x: 0, z: 0, yaw: 0, speed: 30 };
  const after = physics.advance(before, { brake: true }, 0.05);
  assert.ok(before.speed - after.speed > 4, "brake should decelerate by over 4 m/s in 50 ms");
  assert.ok(physics.BRAKE_DECELERATION > 2 * 31);
});

test("holding the brake while stationary engages a slow reverse after a delay", () => {
  let car = standing();
  for (let i = 0; i < 40; i++) {
    car = physics.advance(car, { brake: true }, 1 / 60);
  }
  assert.equal(car.speed, 0, "must not reverse during initial hold");
  for (let i = 0; i < 20; i++) {
    car = physics.advance(car, { brake: true }, 1 / 60);
  }
  assert.ok(car.speed < 0, "reverse engages after 0.8 s at rest");
  assert.ok(car.z > 0, "negative speed moves backward");
});

test("reverse is speed-limited and releasing brake stops reverse acceleration", () => {
  let car = standing();
  for (let i = 0; i < 210; i++) {
    car = physics.advance(car, { brake: true }, 1 / 60);
  }
  assert.equal(car.speed, -physics.REVERSE_MAX_SPEED);
  const moving = physics.advance(car, {}, 1 / 60);
  assert.ok(moving.speed > car.speed, "releasing brake should coast towards rest");
  assert.equal(moving.reverseHold, 0);
});

test("accelerator recovers from reverse and eventually drives forwards", () => {
  let car = { ...standing(), speed: -physics.REVERSE_MAX_SPEED };
  for (let i = 0; i < 40; i++) {
    car = physics.advance(car, { accelerate: true }, 1 / 60);
  }
  assert.ok(car.speed > 0);
});

test("steering direction is reversed while driving backwards", () => {
  const car = { ...standing(), speed: -3 };
  const turned = physics.advance(car, { steer: 1, brake: true }, 1 / 60);
  assert.ok(turned.yaw > car.yaw);
});

test("falling backward keeps the correct signed horizontal momentum", () => {
  const falling = physics.startFall({ ...standing(), speed: -3 });
  assert.ok(falling.vz > 0);
});

test("top speed is 250 km/h and achievable with held acceleration", () => {
  assert.ok(Math.abs(physics.MAX_SPEED * 3.6 - 250) < 1e-8);
  let car = standing();
  for (let i = 0; i < 1200; i++) {
    car = physics.advance(car, { accelerate: true }, 1 / 60);
  }
  assert.ok(Math.abs(car.speed - physics.MAX_SPEED) < 0.001,
    "full throttle should actually reach the configured top speed");
});

test("a 250 km/h car can still brake to a full stop", () => {
  let car = { ...standing(), speed: physics.MAX_SPEED };
  for (let i = 0; i < 100; i++) {
    car = physics.advance(car, { brake: true }, 1 / 60);
    if (car.speed === 0) break;
  }
  assert.equal(car.speed, 0);
  assert.equal(car.reverseHold, 0);
});

test("normal turns, straight driving and braking produce no visual skid", () => {
  assert.equal(physics.skidIntensity(22, 1), 0);
  assert.equal(physics.skidIntensity(physics.MAX_SPEED, 0.5), 0);
  assert.equal(physics.skidIntensity(physics.MAX_SPEED, 0), 0);
  assert.equal(physics.skidIntensity(35, 0.8), 0);
});

test("mud only sprays during extreme fast cornering", () => {
  assert.ok(physics.skidIntensity(48, 1) > 0);
  assert.ok(physics.skidIntensity(physics.MAX_SPEED, 0.9) > 0);
  assert.ok(physics.skidIntensity(-physics.REVERSE_MAX_SPEED, 1) === 0);
});

test("fall begins descending immediately, without any initial floating arc", () => {
  let fall = physics.startFall({ ...standing(), speed: 30 });
  assert.ok(fall.vy < 0, "downward velocity begins at the edge");
  let previousY = fall.y;
  for (let i = 0; i < 12; i++) {
    fall = physics.advanceFall(fall, 1 / 60);
    assert.ok(fall.y < previousY, "altitude must decrease every frame");
    previousY = fall.y;
  }
  assert.ok(fall.y < -1.2, "descent is visible within 0.2 seconds");
  assert.ok(fall.remaining < physics.FALL_SECONDS);
});

test("giant ramp jump stays airborne almost three seconds and lands once", () => {
  let jump = { height: 0.01, velocity: physics.JUMP_TAKEOFF_SPEED };
  let peak = 0, landed = 0, firstLanding = null;
  for (let frame = 0; frame < 300; frame++) {
    jump = physics.advanceJump(jump.height, jump.velocity, 1 / 60);
    peak = Math.max(peak, jump.height);
    if (jump.landed) { landed++; firstLanding = frame / 60; }
  }
  assert.ok(peak > 13 && peak < 15, "substantial aerial height");
  assert.ok(firstLanding > 2.7 && firstLanding < 3);
  assert.equal(landed, 1);
  assert.equal(jump.height, 0);
  assert.equal(jump.velocity, 0);
  assert.equal(physics.GRAVITY, 9.81, "off-road falls remain unchanged");
});

test("airborne steering and braking are gentle and cannot reverse", () => {
  const moving = { x: 0, z: 0, yaw: 0, speed: 40 };
  const ground = physics.advance(moving, { steer: 1, brake: true }, 0.05);
  const air = physics.advance(moving, { steer: 1, brake: true, airborne: true }, 0.05);
  assert.ok(Math.abs(air.yaw) < Math.abs(ground.yaw) / 5);
  assert.ok(air.speed > ground.speed && air.speed < moving.speed);
  assert.equal(physics.advance({ ...moving, speed: 0 },
    { brake: true, airborne: true }, 0.05).speed, 0);
  assert.equal(physics.AIR_STEER_FACTOR, 0.12);
});

test("jump altitude stays ballistic when the road rises or descends", () => {
  const initial = { height: 2, velocity: 5 };
  const rising = physics.advanceJump(initial.height, initial.velocity, 0.05, 1.4);
  const dropping = physics.advanceJump(initial.height, initial.velocity, 0.05, -1.4);
  assert.ok(Math.abs((dropping.height - rising.height) - 2.8) < 1e-9);
  assert.equal(dropping.velocity, rising.velocity);
  const impact = physics.advanceJump(0.2, -3, 0.05, 1);
  assert.equal(impact.height, 0);
  assert.equal(impact.landed, true);
  assert.equal(physics.advanceJump(0, 0, 0.05).landed, false);
});

test("a hump launches the vehicle just before its crest, not after the descent", () => {
  const humps = [0.23, 0.39, 0.81];
  const takeoff = (progress, speed = 30, dt = 1 / 60) =>
    physics.shouldLaunchAtCrest(progress, speed, dt, 1000, humps);
  assert.equal(takeoff(0.227), false, "too far from the first crest");
  assert.equal(takeoff(0.228), true, "takeoff begins two metres before the top");
  assert.equal(takeoff(0.389), true, "every crest is considered");
  assert.equal(takeoff(0.811), false, "must not take off down the slope");
  assert.equal(takeoff(0.228, 20), false, "slow vehicles remain on the ground");
  assert.equal(takeoff(0.228, -30), false, "reverse never triggers a jump");
  assert.equal(takeoff(0.225, 65, 0.05), false);
  assert.equal(takeoff(0.227, 65, 0.05), true,
    "high speed anticipates more than a single frame of travel");
});

test("jump touchdown is detected once even at low frame rates", () => {
  let jump = { height: 0.01, velocity: physics.JUMP_TAKEOFF_SPEED };
  let landingCount = 0;
  for (let i = 0; i < 100; i++) {
    jump = physics.advanceJump(jump.height, jump.velocity, 0.05);
    if (jump.landed) landingCount++;
  }
  assert.equal(landingCount, 1);
});
