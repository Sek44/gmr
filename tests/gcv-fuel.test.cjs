"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Fuel = require("../games/gcv/fuel.js");
const Physics = require("../games/gcv/physics.js");

function fixture(closed = true, random = () => 0.42) {
  const sampleCount = 200;
  const positions = Array.from({ length: sampleCount + 1 },
    (_, i) => ({ x: 0, y: i * 0.02, z: i * 10 }));
  const sides = positions.map(() => ({ x: 1, z: 0 }));
  return Fuel.create({ positions, sides, sampleCount, trackLength: 2000,
    roadHalfWidth: 9, startIndex: 10, finishIndex: 190, closed, random });
}

test("cans spawn in the road and along both circuit types", () => {
  for (const closed of [true, false]) {
    const fuel = fixture(closed);
    assert.ok(fuel.pickups.length >= 3);
    for (const p of fuel.pickups) {
      assert.ok(Math.abs(p.x) < 9);
      assert.ok(p.z > 100 && p.z < 2000);
    }
  }
});

test("consumption follows travelled distance; a can refills only once", () => {
  const fuel = fixture();
  const p = fuel.pickups[0];
  assert.equal(Fuel.RANGE_METRES, 1650);
  fuel.tick({ x: 30, z: 0 }, { x: 30, z: 0 }, Fuel.RANGE_METRES / 2);
  assert.equal(fuel.level, 0.5);
  fuel.tick({ x: 30, z: 0 }, { x: 30, z: 0 }, 0);
  assert.equal(fuel.level, 0.5);
  assert.equal(fuel.tick({ x: p.x, z: p.z - 5 },
    { x: p.x, z: p.z + 5 }, 10), true);
  assert.ok(fuel.level > 0.8 && fuel.level < 0.9);
  assert.ok(p.collectedAt !== null);
  assert.equal(fuel.tick({ x: p.x, z: p.z }, { x: p.x, z: p.z }, 0), false);
});

test("swept collision works at high speed but not high above the road", () => {
  const fuel = fixture(false), p = fuel.pickups[0];
  const before = { x: p.x, z: p.z - 20 }, after = { x: p.x, z: p.z + 20 };
  assert.equal(fuel.tick(before, after, 40, 3), false);
  assert.equal(fuel.tick(before, after, 40, 0), true);
});

test("empty fuel caps forward speed at 100 km/h; refill allows 250 again", () => {
  const fuel = fixture();
  fuel.tick({ x: 30, z: 0 }, { x: 30, z: 0 }, Fuel.RANGE_METRES);
  assert.equal(fuel.level, 0);
  assert.equal(Fuel.EMPTY_MAX_SPEED * 3.6, 100);
  const slow = Physics.advance({ x: 0, z: 0, yaw: 0, speed: 60 },
    { accelerate: true, speedLimit: Fuel.EMPTY_MAX_SPEED }, 0.05);
  assert.ok(slow.speed <= Fuel.EMPTY_MAX_SPEED);
  const fast = Physics.advance(slow, { accelerate: true }, 0.05);
  assert.ok(fast.speed > slow.speed);
});

test("pickups regenerate on a closed loop, not on an open route", () => {
  for (const closed of [true, false]) {
    const fuel = fixture(closed), p = fuel.pickups[0];
    fuel.tick({ x: p.x, z: p.z }, { x: p.x, z: p.z }, 10);
    assert.ok(p.collectedAt !== null);
    fuel.tick({ x: 30, z: 0 }, { x: 30, z: 0 }, 1800);
    assert.equal(p.collectedAt === null, closed);
  }
});

test("snapshots preserve gauge, positions and pickups; old saves get full tank", () => {
  const fuel = fixture(false), p = fuel.pickups[0];
  fuel.tick({ x: p.x, z: p.z }, { x: p.x, z: p.z }, 100);
  const saved = fuel.snapshot();
  const restored = fixture(false, () => 0.8);
  assert.equal(restored.restore(saved), true);
  assert.equal(restored.level, fuel.level);
  assert.deepEqual(restored.pickups, fuel.pickups);
  restored.reset();
  assert.equal(restored.level, 1);
  assert.ok(restored.pickups.every((item) => item.collectedAt === null));
  assert.equal(restored.restore(null), false);
  assert.equal(restored.level, 1);
});
