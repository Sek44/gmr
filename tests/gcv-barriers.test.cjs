"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const barriers = require("../games/gcv/barriers.js");
const layout = require("../games/gcv/track-layout.js");

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
    // If the car was aiming into the rail, contact must turn the nose
    // along the rail, not further into the wall.
    const outwardX = -Math.sin(result.yaw) * side.x * sign;
    const outwardZ = -Math.cos(result.yaw) * side.z * sign;
    assert.ok(outwardX + outwardZ <= 1e-7);
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

test("right-side and left-side contact neutralize steering into the rail", () => {
  const road = circularTrack();
  const rails = barriers.create(road.positions, road.lapLength, 16);
  const i = 100, center = { x: 0, z: 0 }, side = { x: 1, z: 0 };
  for (const [wall, yaw] of [[1, -0.35], [-1, 0.35]]) {
    const before = { x: wall * 13, z: 0, speed: 36, yaw };
    const proposed = { x: wall * 17, z: -1, speed: 36, yaw };
    const resolved = barriers.resolve(before, proposed, i, center, side, rails);
    assert.equal(resolved.collided, true);
    assert.ok(Math.abs(resolved.yaw) < 1e-6,
      "outward steering must not survive contact with either guardrail");
    assert.equal(resolved.speed, 36);
    assert.equal(resolved.z, -1,
      "forward movement remains untouched along the guardrail");
  }
});

test("steering away from a guardrail is not automatically corrected", () => {
  const road = circularTrack();
  const rails = barriers.create(road.positions, road.lapLength, 16);
  const center = { x: 0, z: 0 }, side = { x: 1, z: 0 };
  const drivingAway = { x: 20, z: -3, speed: 32, yaw: .35 };
  const hit = barriers.resolve(drivingAway, drivingAway, 100, center, side, rails);
  assert.equal(hit.collided, true);
  assert.equal(hit.yaw, drivingAway.yaw);
});

test("inside hairpin rails narrow locally instead of folding through themselves", () => {
  const radius = 9, count = 240;
  const road = Array.from({ length: count }, (_, i) => ({
    x: radius * Math.cos(2 * Math.PI * i / count),
    z: radius * Math.sin(2 * Math.PI * i / count),
  }));
  const guard = barriers.create(road, 2 * Math.PI * radius, 16);
  const left = guard.rails.left, right = guard.rails.right;
  assert.ok(left.offsets.every((v) => v <= radius * .9),
    "inside rails should stay within the bend radius");
  assert.ok(right.offsets.every((v) => Math.abs(v - 15.55) < 1e-6),
    "outside guardrail should still follow normal outer edge");
  for (const path of [left, right]) {
    assert.equal(path.points.length, count);
    // Offset loops must not jump across the center of this tight circle.
    for (let i = 1; i < count; i++) {
      assert.ok(Math.hypot(path.points[i].x - path.points[i - 1].x,
        path.points[i].z - path.points[i - 1].z) < 2);
    }
  }
});

test("straight stretches remain at full width despite curvature-aware rails", () => {
  const radius = 100;
  const track = circularTrack();
  const guard = barriers.create(track.positions, track.lapLength, 16);
  assert.ok(guard.rails.left.offsets.every((v) => Math.abs(v - 15.55) < 1e-6));
  assert.ok(guard.rails.right.offsets.every((v) => Math.abs(v - 15.55) < 1e-6));
  assert.ok(guard.protectedSamples.every((n) => n === 1));
});

test("the actual circuit's tight bends produce no crossing guardrails", () => {
  // Three.js uses this Catmull-Rom interpolation (tension .55) for GCV.
  // Sample it here independently of WebGL to catch folded offset geometry.
  const p = layout.WAYPOINTS, count = p.length, samples = [];
  for (let i = 0; i < count; i++) {
    const a = p[(i + count - 1) % count];
    const b = p[i], d = p[(i + 1) % count];
    const e = p[(i + 2) % count];
    for (let s = 0; s < 48; s++) {
      const t = s / 48, t2 = t * t, t3 = t2 * t;
      const interpolate = (axis) =>
        (2 * t3 - 3 * t2 + 1) * b[axis] +
        (t3 - 2 * t2 + t) * .55 * (d[axis] - a[axis]) +
        (-2 * t3 + 3 * t2) * d[axis] +
        (t3 - t2) * .55 * (e[axis] - b[axis]);
      samples.push({ x: interpolate(0), z: interpolate(1) });
    }
  }
  const rail = barriers.create(samples, 822, layout.ROAD_HALF_WIDTH +
    layout.SHOULDER_WIDTH);
  assert.deepEqual(barriers.railIntersections(rail.rails.left.points), [],
    "inside rail should not fold across itself through hairpin");
  assert.deepEqual(barriers.railIntersections(rail.rails.right.points), [],
    "outside rail must stay continuous without crossings");
  assert.equal(rail.protectedSamples.length, samples.length);
  assert.ok(rail.protectedSamples.every((value) => value === 1));
});

test("guardrail contact never changes yaw, including a heading into the right wall", () => {
  const road = circularTrack();
  const rail = barriers.create(road.positions, road.lapLength, 16);
  for (const sign of [-1, 1]) {
    const i = 85;
    const center = road.positions[i];
    const normal = { x: -center.z / 100, z: center.x / 100 };
    const proposed = { x: center.x + sign * normal.x * 30,
      z: center.z + sign * normal.z * 30, yaw: 1.35, speed: 33 };
    const hit = barriers.resolve(center, proposed, i, center, normal, rail);
    assert.equal(hit.collided, true);
    assert.equal(hit.yaw, proposed.yaw);
    assert.equal(hit.speed, proposed.speed);
  }
});
