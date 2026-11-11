"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Layout = require("../games/gcv/track-layout.js");
const Barriers = require("../games/gcv/barriers.js");

test("rainbow slalom is short, fast, bounded and smooth at both ends", () => {
  const zigzag = Layout.SPRINT.zigzagAt;
  assert.equal(zigzag(0).offset, 0);
  assert.ok(Math.abs(zigzag(1).offset) < 1e-12);
  assert.ok(Math.abs(zigzag(0).slope) < 1e-12);
  assert.ok(Math.abs(zigzag(1).slope) < 1e-10);
  const points = Array.from({ length: 1001 }, (_, i) => zigzag(i / 1000));
  assert.ok(points.every(({ offset, slope }) => Number.isFinite(offset) &&
    Number.isFinite(slope) && Math.abs(offset) <= 1.65 + 1e-9));
  assert.ok(points.some(({ offset }) => offset > 1.45));
  assert.ok(points.some(({ offset }) => offset < -1.45));
  const signs = points.map(({ offset }) => Math.abs(offset) < 0.02
    ? 0 : Math.sign(offset)).filter(Boolean);
  const changes = signs.slice(1).filter((sign, i) => sign !== signs[i]).length;
  assert.ok(changes >= 12, "seven short slaloms should change side repeatedly");
});

test("physical terminal walls keep the racer on the open course", () => {
  const positions = [
    { x: 0, z: 0 }, { x: 0, z: -10 }, { x: 0, z: -20 },
  ];
  const directions = positions.map(() => ({ x: 0, z: -1 }));
  const sides = positions.map(() => ({ x: 1, z: 0 }));
  const barriers = Barriers.createOpen(positions, 20, 16, sides);

  const beforeStart = Barriers.resolveEndCaps(
    { x: 1, z: 2, yaw: 0, speed: -15 }, 0,
    positions, directions, sides, barriers);
  assert.equal(beforeStart.collided, true);
  assert.ok(beforeStart.z < 0);
  assert.equal(beforeStart.speed, 0);

  const afterFinish = Barriers.resolveEndCaps(
    { x: -2, z: -22, yaw: 0, speed: 20 }, 2,
    positions, directions, sides, barriers);
  assert.equal(afterFinish.collided, true);
  assert.ok(afterFinish.z > -20);
  assert.equal(afterFinish.speed, 0);

  const away = Barriers.resolveEndCaps(
    { x: 0, z: -10, speed: 25 }, 1,
    positions, directions, sides, barriers);
  assert.equal(away.collided, false);

  const classic = Barriers.resolveEndCaps(
    { x: 0, z: -22, speed: 25 }, 2,
    positions, directions, sides, { ...barriers, closed: true });
  assert.equal(classic.collided, false);
});
