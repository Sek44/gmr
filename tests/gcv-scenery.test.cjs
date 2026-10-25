"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const scenery = require("../games/gcv/scenery.js");

test("rocks clear all track sections, not just their closest initial segment", () => {
  const trackPoints = [
    { x: 0, z: 0 }, { x: 20, z: 0 }, { x: 65, z: 0 },
    { x: 65, z: 20 }, { x: 65, z: 40 },
  ];
  const rock = scenery.placeRock({
    center: trackPoints[0], normal: { x: 1, z: 0 }, side: 1,
    startOffset: 65, radius: 11, roadLimit: 15, trackPoints,
  });
  assert.ok(rock);
  for (const point of trackPoints) {
    const distance = Math.hypot(rock.x - point.x, rock.z - point.z);
    assert.ok(distance >= 15 + 11 + 9, "no rock should overlap the road");
  }
});

test("a rock too close to an existing rock is moved farther away", () => {
  const params = {
    center: { x: 0, z: 0 }, normal: { x: 1, z: 0 }, side: 1,
    startOffset: 55, radius: 11, roadLimit: 15,
    trackPoints: [{ x: 0, z: 0 }],
  };
  const first = scenery.placeRock(params);
  const second = scenery.placeRock({ ...params, existing: [first] });
  assert.ok(second);
  assert.ok(Math.hypot(second.x - first.x, second.z - first.z) >= 34);
});

test("a blocked candidate is skipped instead of placing a rock on the track", () => {
  const placed = scenery.placeRock({
    center: { x: 0, z: 0 }, normal: { x: 1, z: 0 }, side: 1,
    startOffset: 20, radius: 11, roadLimit: 15,
    trackPoints: [{ x: 20, z: 0 }], maxSteps: 0,
  });
  assert.equal(placed, null);
});

test("rock placement can follow the opposite side of the course", () => {
  const rock = scenery.placeRock({
    center: { x: 0, z: 0 }, normal: { x: 1, z: 0 }, side: -1,
    startOffset: 55, radius: 8, roadLimit: 15,
    trackPoints: [{ x: 0, z: 0 }],
  });
  assert.ok(rock.x < 0);
});
