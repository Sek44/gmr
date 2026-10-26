"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const barriers = require("../games/gcv/barriers.js");

function circularTrack() {
  const radius = 100;
  const sampleCount = 628;
  const positions = Array.from({ length: sampleCount }, (_, i) => {
    const t = 2 * Math.PI * i / sampleCount;
    return { x: radius * Math.cos(t), z: radius * Math.sin(t) };
  });
  const waypoints = Array.from({ length: 4 }, (_, i) => {
    const t = 2 * Math.PI * i / 4;
    return [radius * Math.cos(t), radius * Math.sin(t)];
  });
  return { positions, waypoints, lapLength: 2 * Math.PI * radius };
}

test("guardrails are placed after every significant bend, each at least 30m", () => {
  const road = circularTrack();
  const result = barriers.create(road.positions, road.waypoints,
    road.lapLength, 15);
  assert.equal(result.sections.length, 4);
  assert.ok(result.sections.every((section) =>
    section.lengthMeters >= 30 && section.lengthMeters >= barriers.MIN_LENGTH));
  assert.ok(result.sections.every((section) => {
    for (let j = 0; j <= 30; j++) {
      const sample = (section.startIndex + j) % road.positions.length;
      if (!result.protectedSamples[sample]) return false;
    }
    return true;
  }));
  assert.ok(result.protectedSamples.some((n) => n === 0),
    "long straight intervals should still permit falls");
});

test("straight centerline vertices do not create barriers", () => {
  const road = circularTrack();
  const waypoints = [[0, 0], [40, 0], [80, 0], [120, 0]];
  const result = barriers.create(road.positions, waypoints, road.lapLength, 15);
  assert.equal(result.sections.length, 0);
  assert.ok(result.protectedSamples.every((n) => n === 0));
});

test("guardrail collision blocks outward motion while keeping forward slide", () => {
  const road = circularTrack();
  const result = barriers.create(road.positions, road.waypoints, road.lapLength, 15);
  const index = result.sections[0].startIndex + 10;
  const center = road.positions[index];
  const radius = Math.hypot(center.x, center.z);
  const side = { x: center.x / radius, z: center.z / radius };
  const tangent = { x: -side.z, z: side.x };
  const preceding = {
    x: center.x + side.x * (result.carLimit - 1),
    z: center.z + side.z * (result.carLimit - 1),
    speed: 30, yaw: 0,
  };
  const proposed = {
    x: center.x + side.x * (result.carLimit + 4) + tangent.x * 2,
    z: center.z + side.z * (result.carLimit + 4) + tangent.z * 2,
    speed: 30, yaw: 0,
  };
  const collision = barriers.resolve(preceding, proposed,
    index, center, side, result);
  assert.equal(collision.collided, true);
  const dx = collision.x - center.x, dz = collision.z - center.z;
  assert.ok(Math.abs(dx * side.x + dz * side.z - result.carLimit) < 1e-8);
  assert.ok(Math.abs(dx * tangent.x + dz * tangent.z - 2) < 1e-8);
  assert.equal(collision.speed, 30);
  assert.equal(collision.yaw, 0);
  assert.ok(Math.hypot(dx, dz) < result.railOffset + 1);
});

test("barrier collision also protects the opposite side of the circuit", () => {
  const road = circularTrack();
  const result = barriers.create(road.positions, road.waypoints, road.lapLength, 15);
  const i = result.sections[0].startIndex;
  const center = road.positions[i];
  const side = { x: center.x / 100, z: center.z / 100 };
  const before = { ...center, speed: 28, yaw: 0 };
  const outside = {
    ...before, x: before.x - side.x * (result.carLimit + 8),
    z: before.z - side.z * (result.carLimit + 8),
  };
  const collision = barriers.resolve(before, outside, i, center, side, result);
  assert.equal(collision.collided, true);
  assert.ok(Math.abs((collision.x - center.x) * side.x +
    (collision.z - center.z) * side.z + result.carLimit) < 1e-8);
});

test("unprotected sections retain the original possibility of falling", () => {
  const road = circularTrack();
  const result = barriers.create(road.positions, road.waypoints, road.lapLength, 15);
  const i = result.protectedSamples.findIndex((x) => x === 0);
  const center = road.positions[i];
  const side = { x: center.x / 100, z: center.z / 100 };
  const proposed = { x: center.x + side.x * 19,
    z: center.z + side.z * 19, speed: 42, yaw: 1.3 };
  const hit = barriers.resolve(center, proposed, i, center, side, result);
  assert.equal(hit.collided, false);
  assert.equal(hit.x, proposed.x);
  assert.equal(hit.z, proposed.z);
});

test("track exits may wrap around the end of a closed sampled circuit", () => {
  const road = circularTrack();
  const result = barriers.create(road.positions, road.waypoints,
    road.lapLength, 15, 45);
  assert.equal(result.protectedSamples[0], 1);
  assert.ok(result.sections.every((section) => section.lengthMeters >= 45));
});
