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

test("gravel lowers traction and slows a car more than asphalt", () => {
  const rolling = { x: 0, z: 0, yaw: 0, speed: 20 };
  const road = physics.advance(rolling, { accelerate: true, steer: 1 }, 1 / 60);
  const gravel = physics.advance(rolling, { accelerate: true, steer: 1, gravel: true }, 1 / 60);
  assert.ok(gravel.speed < road.speed);
  assert.ok(Math.abs(gravel.yaw) < Math.abs(road.yaw));
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
  assert.ok(Math.abs(fall.y - (0.14 - 0.5 * 9.81 * 4)) < 1e-6);
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
