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

test("regenerated rainbow sprint has four crests on straight sections", () => {
  const route = layout.SPRINT;
  assert.equal(route.VERSION, 5);
  assert.ok(route.LENGTH_METRES > 2300 && route.LENGTH_METRES < 2700);
  assert.equal(route.HUMPS.length, 4);
  assert.deepEqual(route.HUMPS, route.HUMP_PROFILES.map(hump => hump.at));
  const straights = route.SECTIONS.filter(section =>
    section.type === "straight" && section.hump);
  assert.equal(straights.length, 4, "a hump belongs only to a long straight");
  for (const hump of route.HUMP_PROFILES) {
    const metres = hump.at * route.LENGTH_METRES;
    assert.ok(metres >= hump.sectionStart + 150,
      "crest must be at least 150 metres from the preceding turn");
    assert.ok(metres <= hump.sectionEnd - 150,
      "crest must be at least 150 metres before the next turn");
    assert.ok(hump.height >= 14 && hump.crown >= 0.9);
    assert.ok(Math.abs(route.heightAt(hump.at) - hump.height) < 0.1);
    const approach = route.heightAt(hump.at - hump.width / 2);
    assert.ok(approach < hump.height && approach > hump.height * 0.65,
      "bumps retain their gradual approach");
  }
  const colouredMetres = (route.RAINBOW[1] - route.RAINBOW[0]) *
    route.LENGTH_METRES;
  assert.ok(colouredMetres > 100 && colouredMetres < 190);
  assert.ok(route.FINISH.z < route.START.z);
});
