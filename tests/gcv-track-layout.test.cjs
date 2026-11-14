"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const layout = require("../games/gcv/track-layout.js");
const Progress = require("../games/gcv/track-progress.js");

test("classic is a generated, closed lap with one seamless centreline", () => {
  const classic = layout.select("classic");
  assert.equal(classic.ID, "classic");
  assert.equal(classic.VERSION, 3);
  assert.equal(classic.CLOSED, true);
  assert.equal(classic.GENERATOR_VERSION, 2);
  assert.equal(classic.SECTIONS.length, layout.CLASSIC_TEMPLATE.sections.length * 2);
  assert.equal(classic.HUMP_PROFILES.length, 0);
  assert.equal(classic.RAINBOW, null);
  assert.ok(classic.LENGTH_METRES > 820 && classic.LENGTH_METRES < 920);
  assert.ok(classic.WAYPOINTS.length >= 48 && classic.WAYPOINTS.length < 100);
  assert.ok(Math.abs(layout.perimeter(classic.WAYPOINTS) -
    classic.LENGTH_METRES) < 0.02);
  assert.notDeepEqual(classic.WAYPOINTS.at(-1), classic.WAYPOINTS[0],
    "three.js closes the circuit: no duplicate end waypoint");
  assert.equal(layout.SAMPLE_COUNT, 840, "keep the established render budget");
  assert.equal(layout.ROAD_HALF_WIDTH, 9);
  assert.equal(layout.SHOULDER_WIDTH, 7);
});

test("two chicanes and broad reversing corners make a safe closed course", () => {
  const route = layout.CLASSIC;
  const angles = route.SECTIONS.filter(s => s.type === "turn")
    .map(s => s.endHeading - s.startHeading);
  assert.deepEqual(angles.map(a => Math.round(a)), [
    32, -64, 32, 90, 90, 32, -64, 32, 90, 90,
  ]);
  assert.ok(route.SECTIONS.filter(s => s.type === "straight").length >= 8);
  assert.ok(route.WAYPOINTS.every(([x, z]) =>
    Number.isFinite(x) && Number.isFinite(z)));
});

test("the classic start grid, finish and spawn belong to the first straight", () => {
  const route = layout.CLASSIC;
  const first = route.SECTIONS[0];
  assert.equal(first.type, "straight");
  assert.ok(first.length > 115);
  assert.deepEqual(route.START, route.FINISH, "one line on a closed lap");
  assert.equal(route.FINISH.x, 0);
  assert.equal(route.SPAWN.x, 0);
  assert.ok(route.FINISH.z > route.SPAWN.z);
  assert.ok(route.WAYPOINTS[0][1] - route.FINISH.z >= 65,
    "enough space before the line for all ten starting slots");
  assert.ok(route.SPAWN.z > route.WAYPOINTS[5][1],
    "spawn is on the long initial straight");
  const before = { x: route.FINISH.x, z: route.FINISH.z + 3 };
  const after = { x: route.FINISH.x, z: route.FINISH.z - 3 };
  const forward = { x: 0, z: -1 };
  assert.equal(Progress.finishCrossing(before, after,
    route.FINISH, forward, route.ROAD_HALF_WIDTH), 0.5);
  assert.equal(Progress.finishCrossing(after, before,
    route.FINISH, forward, route.ROAD_HALF_WIDTH), null);
});

test("new closed variants are reproducible and remain valid for many seeds", () => {
  for (let seed = 1; seed <= 250; seed++) {
    const route = layout.generateClassic(seed);
    assert.equal(route.CLOSED, true);
    assert.ok(route.LENGTH_METRES > 820 && route.LENGTH_METRES < 920);
    assert.ok(route.FINISH.z > route.SPAWN.z);
    assert.ok(Math.abs(layout.perimeter(route.WAYPOINTS) -
      route.LENGTH_METRES) < 0.02);
    assert.equal(route.SECTIONS.length, 20);
  }
  assert.deepEqual(layout.generateClassic(17).WAYPOINTS,
    layout.generateClassic(17).WAYPOINTS);
  assert.notDeepEqual(layout.generateClassic(17).WAYPOINTS,
    layout.generateClassic(18).WAYPOINTS);
});

test("nearest sample index ignores the duplicated closing position", () => {
  const samples = [
    { x: 0, z: 40 }, { x: 0, z: 17 },
    { x: 0, z: -8 }, { x: 0, z: -30 },
    { x: 0, z: 40 },
  ];
  assert.equal(layout.nearestIndex(samples, layout.FINISH), 1);
  assert.equal(layout.nearestIndex(samples, layout.SPAWN), 2);
});

test("generated rainbow course retains its separate open-route contract", () => {
  const route = layout.select("rainbow");
  assert.equal(route.VERSION, 5);
  assert.equal(route.CLOSED, false);
  assert.ok(route.LENGTH_METRES > 2500 && route.LENGTH_METRES < 2900);
  assert.equal(route.HUMPS.length, 4);
  assert.deepEqual(route.HUMPS, route.HUMP_PROFILES.map(hump => hump.at));
  assert.ok(route.HUMP_PROFILES.every(hump =>
    route.SECTIONS.some(section => section.type === "straight" &&
      section.startMetres === hump.sectionStart &&
      section.endMetres === hump.sectionEnd)));
  assert.ok(route.RAINBOW && route.RAINBOW[1] > route.RAINBOW[0]);
  assert.ok(route.FINISH.z < route.START.z);
});
