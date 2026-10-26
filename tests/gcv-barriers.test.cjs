"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const barriers = require("../games/gcv/barriers.js");

function circularTrack() {
  const radius = 100, count = 628;
  const positions = Array.from({ length: count }, (_, i) => {
    const t = 2 * Math.PI * i / count;
    return { x: radius * Math.cos(t), z: radius * Math.sin(t) };
  });
  return { positions, lapLength: 2 * Math.PI * radius };
}

function railAt(road, width, i, sign = 1) {
  const rail = barriers.create(road.positions, road.lapLength, width);
  const center = road.positions[i];
  const radius = Math.hypot(center.x, center.z);
  const side = { x: sign * center.x / radius,
    z: sign * center.z / radius };
  return { rail, center, side, index: i };
}

test("continuous roadside guardrails cover every sample, including the seam", () => {
  const road = circularTrack();
  const rail = barriers.create(road.positions, road.lapLength, 19);
  assert.equal(rail.protectedSamples.length, road.positions.length);
  assert.ok(rail.protectedSamples.every((value) => value === 1));
  assert.equal(rail.protectedSamples[0], 1);
  assert.equal(rail.protectedSamples.at(-1), 1);
  assert.equal(rail.lengthMeters, road.lapLength);
});

test("barriers are placed before cliff and leave safe room for the whole car", () => {
  const road = circularTrack();
  const rail = barriers.create(road.positions, road.lapLength, 19);
  assert.equal(rail.railOffset, 18.55);
  assert.equal(rail.carLimit, 17.5);
  assert.ok(rail.carLimit + barriers.CAR_RADIUS < 19);
});

test("contact against either barrier removes only lateral motion", () => {
  const road = circularTrack(), i = 85;
  for (const sign of [-1, 1]) {
    const { rail, center, side } = railAt(road, 19, i, sign);
    const tangent = { x: -side.z, z: side.x };
    const before = { x: center.x + side.x * (rail.carLimit - 1),
      z: center.z + side.z * (rail.carLimit - 1), speed: 38, yaw: .4 };
    const proposed = {
      x: center.x + side.x * (rail.carLimit + 4) + tangent.x * 3,
      z: center.z + side.z * (rail.carLimit + 4) + tangent.z * 3,
      speed: 38, yaw: .4,
    };
    const result = barriers.resolve(before, proposed, i, center, side, rail);
    assert.equal(result.collided, true);
    const dx = result.x - center.x, dz = result.z - center.z;
    assert.ok(Math.abs(dx * side.x + dz * side.z - rail.carLimit) < 1e-8);
    assert.ok(Math.abs(dx * tangent.x + dz * tangent.z - 3) < 1e-8);
    assert.equal(result.speed, proposed.speed);
    assert.equal(result.yaw, proposed.yaw);
  }
});

test("vehicle does not get stopped by repeated wall contact on straight segments", () => {
  const road = circularTrack(), i = 117;
  const { center, side, rail } = railAt(road, 19, i);
  const tangent = { x: -side.z, z: side.x };
  let state = {
    x: center.x + side.x * (rail.carLimit - 0.2),
    z: center.z + side.z * (rail.carLimit - 0.2),
    speed: 32, yaw: -.1,
  };
  for (let k = 0; k < 20; k++) {
    const before = state;
    const proposed = {
      ...before, x: before.x + side.x * 3 + tangent.x * 1.5,
      z: before.z + side.z * 3 + tangent.z * 1.5,
    };
    state = barriers.resolve(before, proposed, i, center, side, rail);
    assert.equal(state.collided, true);
    assert.equal(state.speed, 32);
  }
  assert.ok((state.x - center.x) * tangent.x +
    (state.z - center.z) * tangent.z > 29);
});

test("unobstructed car preserves the exact proposed position on any sample", () => {
  const road = circularTrack();
  const rail = barriers.create(road.positions, road.lapLength, 19);
  for (const i of [0, 7, 150, 315, 627]) {
    const center = road.positions[i], side = { x: 1, z: 0 };
    const driver = { ...center, yaw: 0, speed: 40 };
    assert.deepEqual(barriers.resolve(driver, driver, i, center, side, rail),
      { ...driver, collided: false });
  }
});

test("seam collision remains active at both ends of the closed loop", () => {
  const road = circularTrack(), rail = barriers.create(road.positions,
    road.lapLength, 19);
  for (const i of [road.positions.length - 1, 0]) {
    const center = road.positions[i];
    const side = { x: center.x / 100, z: center.z / 100 };
    const outside = { x: center.x + side.x * 30,
      z: center.z + side.z * 30, speed: 45, yaw: 0 };
    const hit = barriers.resolve(center, outside, i, center, side, rail);
    assert.equal(hit.collided, true);
    assert.ok(Math.hypot(hit.x - center.x, hit.z - center.z) < 19);
  }
});

test("guardrail module validates geometry and outside width", () => {
  const road = circularTrack();
  assert.throws(() => barriers.create([], road.lapLength, 19));
  assert.throws(() => barriers.create(road.positions, -20, 19));
  assert.throws(() => barriers.create(road.positions, road.lapLength, 1));
});
