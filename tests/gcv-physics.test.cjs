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

test("braking reduces speed without driving backwards", () => {
  let car = { x: 0, z: 0, yaw: 0, speed: 30 };
  for (let i = 0; i < 200; i++) {
    car = physics.advance(car, { brake: true, steer: 0 }, 1 / 60);
  }
  assert.equal(car.speed, 0);
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
