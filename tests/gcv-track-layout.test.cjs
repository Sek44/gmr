"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const layout = require("../games/gcv/track-layout.js");

const oldRoute = [
  [35, 68], [35, 30], [37, -22], [21, -54], [-15, -62],
  [-43, -44], [-50, -9], [-40, 19], [-46, 51], [-21, 76], [9, 81],
];

test("new closed circuit is approximately twice the former perimeter", () => {
  const ratio = layout.perimeter(layout.WAYPOINTS) / layout.perimeter(oldRoute);
  assert.ok(ratio >= 1.9 && ratio <= 2.2, "length ratio: " + ratio);
  assert.ok(layout.SAMPLE_COUNT >= 800, "keep geometry detail along the longer course");
});

test("finish line lies two thirds of the way along the long straight", () => {
  const straight = layout.WAYPOINTS.slice(0, 6);
  assert.ok(straight.every(([x]) => x === layout.FINISH.x));
  const startZ = straight[0][1], endZ = straight.at(-1)[1];
  const totalLength = startZ - endZ;
  const beforeFinish = startZ - layout.FINISH.z;
  assert.ok(totalLength >= 200, "straight must be substantial");
  assert.ok(Math.abs(beforeFinish / totalLength - 2 / 3) < 1e-8);
});

test("starting point is after the line on the same straight", () => {
  assert.equal(layout.FINISH.x, layout.SPAWN.x);
  assert.ok(layout.SPAWN.z < layout.FINISH.z);
  assert.ok(layout.SPAWN.z > layout.WAYPOINTS[5][1]);
});

test("nearest sample index finds the line and spawn independently", () => {
  const samples = [
    { x: 78, z: 100 }, { x: 78, z: -11 },
    { x: 78, z: -43 }, { x: 78, z: -90 },
    { x: 78, z: 100 }, // duplicate closing sample
  ];
  assert.equal(layout.nearestIndex(samples, layout.FINISH), 1);
  assert.equal(layout.nearestIndex(samples, layout.SPAWN), 2);
});

test("track layout version is distinct from earlier saved sessions", () => {
  assert.equal(layout.VERSION, 2);
});

test("roadside shoulders are seven metres per side", () => {
  assert.equal(layout.ROAD_HALF_WIDTH, 9);
  assert.equal(layout.SHOULDER_WIDTH, 7);
  assert.equal(layout.ROAD_HALF_WIDTH + layout.SHOULDER_WIDTH, 16);
});

test("extended rainbow sprint has four oversized launch hills", () => {
  const points = layout.SPRINT.WAYPOINTS;
  const length = points.slice(1).reduce((distance, [x, z], index) =>
    distance + Math.hypot(x - points[index][0], z - points[index][1]), 0);
  assert.ok(length > 2500, "route must be substantially longer than 1.6 km");
  assert.equal(layout.SPRINT.VERSION, 3);
  assert.equal(layout.SPRINT.HUMPS.length, 4);
  assert.deepEqual(layout.SPRINT.HUMPS,
    layout.SPRINT.HUMP_PROFILES.map((hump) => hump.at));
  assert.ok(layout.SPRINT.HUMP_PROFILES.every((hump) =>
    hump.height >= 14 && hump.width >= 0.017));
  assert.ok(layout.SPRINT.FINISH.z < layout.SPRINT.START.z);
});
