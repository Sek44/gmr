"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const barriers = require("../games/gcv/barriers.js");
const layout = require("../games/gcv/track-layout.js");
const physics = require("../games/gcv/physics.js");

function straightRails() {
  const points = (x) => [{ x, z: 10 }, { x, z: 0 }, { x, z: -10 }];
  return {
    protectedSamples: new Uint8Array(3).fill(1),
    rails: {
      left: { limits: [14, 14, 14], points: points(15) },
      right: { limits: [14, 14, 14], points: points(-15) },
    },
  };
}

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

test("either barrier preserves tangential travel and forward-facing heading", () => {
  const road = circularTrack(), i = 85;
  const rail = barriers.create(road.positions, road.lapLength, 19);
  const center = road.positions[i], side = barriers.normalAt(road.positions, i);
  const forward = { x: side.z, z: -side.x };
  for (const sign of [-1, 1]) {
    const limit = sign > 0 ? rail.rails.left.limits[i] :
      rail.rails.right.limits[i];
    const before = { x: center.x + side.x * sign * (limit - 1),
      z: center.z + side.z * sign * (limit - 1), speed: 38, yaw: .4 };
    const proposed = {
      x: center.x + side.x * sign * (limit + 4) + forward.x * 3,
      z: center.z + side.z * sign * (limit + 4) + forward.z * 3,
      speed: 38, yaw: .4,
    };
    const result = barriers.resolve(before, proposed, i, center, side, rail);
    assert.equal(result.collided, true);
    const dx = result.x - center.x, dz = result.z - center.z;
    assert.ok(Math.abs(dx * side.x + dz * side.z - sign * limit) < 1e-8);
    assert.ok(Math.abs(dx * forward.x + dz * forward.z - 3) < 1e-8);
    assert.equal(result.speed, proposed.speed);
    const points = sign > 0 ? rail.rails.left.points : rail.rails.right.points;
    const next = points[(i + 1) % points.length];
    const previous = points[(i + points.length - 1) % points.length];
    assert.ok(-Math.sin(result.yaw) * (next.x - previous.x) -
      Math.cos(result.yaw) * (next.z - previous.z) > 0);
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

test("wall contact gradually aligns the car on both sides", () => {
  const rails = straightRails(), center = { x: 0, z: 0 };
  const side = { x: 1, z: 0 };
  for (const sign of [-1, 1]) {
    const yaw = -sign * 0.7;
    const before = { x: sign * 13.5, z: 0, speed: 36, yaw };
    const proposed = { x: sign * 17, z: -1, speed: 36, yaw };
    const hit = barriers.resolve(before, proposed, 1, center, side, rails, 1 / 60);
    assert.equal(hit.collided, true);
    assert.ok(Math.abs(hit.yaw) < Math.abs(yaw));
    assert.ok(Math.abs(hit.yaw) > .1, "no immediate snap to tangent");
    assert.equal(hit.speed, 36);
    assert.equal(hit.z, -1);
  }
});
test("steering away from the rail works normally after leaving contact", () => {
  const rails = straightRails(), center = { x: 0, z: 0 };
  const side = { x: 1, z: 0 };
  const before = { x: 13.9, z: -3, speed: 32, yaw: .35 };
  const proposed = { ...before, x: 13.2, z: -4 };
  const result = barriers.resolve(before, proposed, 1, center, side, rails);
  assert.equal(result.collided, false);
  assert.equal(result.yaw, proposed.yaw);
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
    layout.SHOULDER_WIDTH, null, layout.ROAD_HALF_WIDTH);
  assert.deepEqual(barriers.railIntersections(rail.rails.left.points), [],
    "inside rail should not fold across itself through hairpin");
  assert.deepEqual(barriers.railIntersections(rail.rails.right.points), [],
    "outside rail must stay continuous without crossings");
  assert.equal(rail.protectedSamples.length, samples.length);
  assert.ok(rail.protectedSamples.every((value) => value === 1));
  const outerRailOffset = layout.ROAD_HALF_WIDTH +
    layout.SHOULDER_WIDTH - barriers.RAIL_OFFSET_INWARD;
  // Check both rail posts and segments; a crossing-free rail may still
  // cut across the asphalt if its offset is contracted too aggressively.
  for (const path of [rail.rails.left, rail.rails.right]) {
    assert.ok(path.offsets.every((offset) => offset >= outerRailOffset - 1e-8),
      "rails must stay by the outside edge of the 7 m shoulder");
    assert.ok(path.skippedSamples.some((v) => v === 1),
      "small hairpin loops must be clipped, not pulled onto the road");
    for (let i = 0; i < samples.length; i += 3) {
      const a = path.points[i], b = path.points[(i + 1) % samples.length];
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      let nearestSquared = Infinity;
      for (let j = 0; j < samples.length; j++) {
        const p = samples[j], q = samples[(j + 1) % samples.length];
        const dx = q.x - p.x, dz = q.z - p.z;
        const d2 = dx * dx + dz * dz;
        const u = d2 === 0 ? 0 : Math.max(0, Math.min(1,
          ((mid.x - p.x) * dx + (mid.z - p.z) * dz) / d2));
        nearestSquared = Math.min(nearestSquared,
          (mid.x - p.x - u * dx) ** 2 + (mid.z - p.z - u * dz) ** 2);
      }
      assert.ok(nearestSquared >= (outerRailOffset - 1) ** 2,
        "visible guardrails must remain by the outer edge of the shoulders");
    }
  }
});

test("a collision never points the car against the circuit's forward direction", () => {
  const road = circularTrack(), rail =
    barriers.create(road.positions, road.lapLength, 16);
  for (const sign of [-1, 1]) {
    const i = 85, center = road.positions[i];
    const side = barriers.normalAt(road.positions, i);
    const points = sign > 0 ? rail.rails.left.points : rail.rails.right.points;
    const prev = points[(i + points.length - 1) % points.length];
    const next = points[(i + 1) % points.length];
    const fx = next.x - prev.x, fz = next.z - prev.z;
    const backwardYaw = Math.atan2(-fx, -fz) + Math.PI;
    const proposed = {
      x: center.x + sign * side.x * 30,
      z: center.z + sign * side.z * 30,
      yaw: backwardYaw, speed: 33,
    };
    const hit = barriers.resolve(center, proposed, i, center, side, rail);
    assert.equal(hit.collided, true);
    assert.ok(-Math.sin(hit.yaw) * fx - Math.cos(hit.yaw) * fz > 0);
    assert.equal(hit.speed, 33);
  }
});

test("holding maximum steering into either barrier never causes a U-turn", () => {
  const rails = straightRails();
  for (const sign of [-1, 1]) {
    let car = { x: sign * 13.9, z: 0, speed: 32, yaw: -sign * .25 };
    let contacts = 0;
    for (let frame = 0; frame < 180; frame++) {
      const proposed = physics.advance(car,
        { accelerate: true, steer: sign }, 1 / 60);
      const hit = barriers.resolve(car, proposed, 1,
        { x: 0, z: 0 }, { x: 1, z: 0 }, rails, 1 / 60);
      if (hit.collided) {
        contacts++;
        assert.ok(Math.cos(hit.yaw) > 0, "never faces backwards");
        assert.ok(Math.abs(hit.x) <= 14 + 1e-8);
      }
      car = hit;
    }
    assert.ok(contacts > 150, "must stay sliding along the wall");
    assert.ok(car.z < -65, "forward motion must continue");
    assert.ok(Math.abs(car.yaw) < .65, "held steering cannot rotate the car backwards");
  }
});

test("guardrail alignment is progressive at frame rate", () => {
  const rails = straightRails();
  let car = { x: 14, z: 0, speed: 30, yaw: -.75 };
  for (let i = 0; i < 75; i++) {
    const previous = car;
    car = barriers.resolve(previous, { ...previous, x: 17, z: previous.z - 1 },
      1, { x: 0, z: 0 }, { x: 1, z: 0 }, rails, 1 / 60);
    assert.ok(car.yaw > previous.yaw);
    if (i === 0) assert.ok(car.yaw < -.6, "first frame must not snap");
  }
  assert.ok(Math.abs(car.yaw) < .02, "sustained contact aligns along the rail");
});

test("the car follows the actual angled guardrail, not just road centerline", () => {
  const rails = straightRails();
  rails.rails.left.points[2].x = 22;
  const tangentYaw = Math.atan2(-7, 20);
  let car = { x: 14, z: 0, speed: 30, yaw: 0 };
  for (let i = 0; i < 80; i++) {
    car = barriers.resolve(car, { ...car, x: 17, z: car.z - 1 }, 1,
      { x: 0, z: 0 }, { x: 1, z: 0 }, rails, 1 / 60);
  }
  assert.ok(Math.abs(car.yaw - tangentYaw) < .01);
});

test("an extreme bend cannot flip the car against the circuit centerline", () => {
  const rail = straightRails();
  // The rail tangent nearly turns sideways even though the road goes north.
  rail.rails.left.points[0] = { x: 15, z: 1 };
  rail.rails.left.points[2] = { x: 50, z: -1 };
  for (const yaw of [-Math.PI, -2.1, 0, 2.1, Math.PI]) {
    const car = { x: 14, z: 0, speed: 34, yaw };
    const hit = barriers.resolve(car, { ...car, x: 17, z: -2 },
      1, { x: 0, z: 0 }, { x: 1, z: 0 }, rail, 1 / 60);
    assert.equal(hit.collided, true);
    assert.ok(Math.cos(hit.yaw) > 0,
      "heading must always preserve forward progress along the circuit");
  }
});
