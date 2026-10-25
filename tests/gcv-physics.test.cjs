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

test("steering has a stronger response than the prototype's original rate", () => {
  const rolling = { x: 0, z: 0, yaw: 0, speed: 18 };
  const turned = physics.advance(rolling, { steer: 1 }, 1 / 60);
  assert.ok(turned.yaw < -1.45 / 60);
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
