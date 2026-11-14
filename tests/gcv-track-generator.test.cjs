"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Generator = require("../games/gcv/track-generator.js");
const Layout = require("../games/gcv/track-layout.js");

test("the route is reproducible for the same seed and differs across seeds", () => {
  const a = Layout.generateSprint(42);
  const repeat = Layout.generateSprint(42);
  const other = Layout.generateSprint(43);
  assert.deepEqual(a.WAYPOINTS, repeat.WAYPOINTS);
  assert.deepEqual(a.HUMP_PROFILES, repeat.HUMP_PROFILES);
  assert.deepEqual(a.RAINBOW, repeat.RAINBOW);
  assert.notDeepEqual(a.WAYPOINTS, other.WAYPOINTS);
  assert.equal(a.GENERATOR_VERSION, Generator.VERSION);
  assert.ok(Object.isFrozen(a.WAYPOINTS));
});

test("only straights can contain jumps or rainbow and both remain clear of turns", () => {
  for (const seed of [1, 2, 3, 42, 20261114, 4294967295]) {
    const route = Layout.generateSprint(seed);
    assert.equal(route.SECTIONS.filter(s => s.hump).length, 4);
    assert.ok(route.SECTIONS.filter(s => s.hump).every(s => s.type === "straight"));
    const rainbow = route.SECTIONS.filter(s => s.rainbow);
    assert.equal(rainbow.length, 1);
    assert.equal(rainbow[0].type, "straight");
    for (const hill of route.HUMP_PROFILES) {
      const start = hill.sectionStart, end = hill.sectionEnd;
      const halfClearance = 1.8 * hill.width * route.LENGTH_METRES;
      assert.ok(hill.centerMetres - halfClearance > start,
        "uphill ramp must stay in its straight");
      assert.ok(hill.centerMetres + halfClearance < end,
        "downhill ramp must stay in its straight");
    }
    const r = route.RAINBOW.map(fraction => fraction * route.LENGTH_METRES);
    assert.ok(r[0] > rainbow[0].startMetres);
    assert.ok(r[1] < rainbow[0].endMetres);
    assert.ok(r[1] - r[0] < 190, "rainbow section should be compact");
    assert.ok((r[1] - r[0]) / route.LENGTH_METRES < 0.085);
  }
});

test("rebuilt sprint is an open, mostly forward, 2.3-2.7 km route", () => {
  const route = Layout.SPRINT;
  assert.equal(route.CLOSED, false);
  assert.equal(route.VERSION, 5);
  assert.ok(route.WAYPOINTS.length > 70 && route.WAYPOINTS.length < 180,
    "lightweight centreline source for mobile rendering");
  assert.ok(route.LENGTH_METRES > 2500 && route.LENGTH_METRES < 2900);
  for (let i = 1; i < route.WAYPOINTS.length; i++) {
    const a = route.WAYPOINTS[i - 1], b = route.WAYPOINTS[i];
    const distance = Math.hypot(a[0] - b[0], a[1] - b[1]);
    assert.ok(distance > 2 && distance < 30);
    assert.ok(b[1] < a[1], "forward corridor must never fold back on itself");
  }
  assert.ok(route.SPAWN.z > route.START.z);
  assert.ok(route.FINISH.z < route.START.z);
  assert.ok(route.HUMP_PROFILES.every(h => {
    const crest = route.heightAt(h.at);
    return crest >= h.height - 0.05 && crest <= h.height + 0.1;
  }));
});

test("generator validates misplaced features, undersized straights and gates", () => {
  assert.throws(() => Generator.build({ sections: [
    { type: "straight", length: 100 },
    { type: "turn", angle: 45, radius: 60, hump: { height: 10 } },
  ] }), /straights/);
  assert.throws(() => Generator.build({ sections: [
    { type: "straight", length: 120, hump: { height: 15 } },
    { type: "straight", length: 200 },
  ] }), /clearance/);
  assert.throws(() => Generator.build({ sections: [
    { type: "straight", length: 150, rainbow: true },
    { type: "turn", angle: 140, radius: 55 },
    { type: "straight", length: 200 },
  ] }), /Turn angle/);
  assert.throws(() => Generator.build({ sections: [
    { type: "straight", length: 300 },
    { type: "turn", angle: 50, radius: 80 },
    { type: "straight", length: 240 },
  ], finishMargin: 270, startMetres: 70, spawnMetres: 20 }), /straights/);
});

test("generator can produce another layout from simple new sections", () => {
  const template = { origin: [0, 50], startMetres: 60, spawnMetres: 20,
    finishMargin: 40, sections: [
      { type: "straight", length: 410,
        hump: { height: 12, widthMetres: 85, crownWidthMetres: 30 } },
      { type: "turn", angle: 30, radius: 80 },
      { type: "straight", length: 180, rainbow: true },
      { type: "turn", angle: -40, radius: 75 },
      { type: "straight", length: 200 },
    ] };
  const route = Generator.build(template, 12);
  assert.equal(route.HUMP_PROFILES.length, 1);
  assert.ok(route.RAINBOW && route.RAINBOW[1] > route.RAINBOW[0]);
  assert.ok(route.FINISH.z < route.START.z);
  assert.ok(route.WAYPOINTS.length > 30);
});

test("generator rejects rainbow rails on the same straight as a jump", () => {
  assert.throws(() => Generator.build({
    sections: [
      { type: "straight", length: 420, rainbow: true,
        hump: { height: 14, widthMetres: 95 } },
      { type: "straight", length: 250 },
    ],
  }), /separate straights/);
});

test("generated start and finish can be crossed in race progression", () => {
  const Progress = require("../games/gcv/track-progress.js");
  const route = Layout.SPRINT;
  const control = route.WAYPOINTS;
  const sums = [0];
  for (let i = 1; i < control.length; i++) {
    sums.push(sums[i - 1] + Math.hypot(
      control[i][0] - control[i - 1][0],
      control[i][1] - control[i - 1][1]));
  }
  const distance = sums[sums.length - 1];
  const count = route.SAMPLE_COUNT;
  function locate(fraction) {
    const target = fraction * distance;
    let i = 0;
    while (i < control.length - 2 && sums[i + 1] < target) i++;
    const t = (target - sums[i]) / (sums[i + 1] - sums[i]);
    return { x: control[i][0] + (control[i + 1][0] - control[i][0]) * t,
      z: control[i][1] + (control[i + 1][1] - control[i][1]) * t };
  }
  const positions = Array.from({ length: count + 1 }, (_, i) =>
    locate(i / count));
  const directions = positions.map((point, i) => {
    const before = positions[Math.max(0, i - 1)];
    const after = positions[Math.min(count, i + 1)];
    const dx = after.x - before.x, dz = after.z - before.z;
    const len = Math.hypot(dx, dz);
    return { x: dx / len, z: dz / len };
  });
  const start = route.nearestIndex(positions, route.START);
  const finish = route.nearestIndex(positions, route.FINISH);
  const spawn = route.nearestIndex(positions, route.SPAWN);
  assert.ok(spawn < start && start < finish && finish < count);
  const routeLength = (finish - start) * distance / count;
  let motion = Progress.createMotion(routeLength, (spawn - start) * distance / count, spawn);
  const allEvents = [];
  for (let i = spawn; i < count; i++) {
    const before = positions[i], after = positions[i + 1];
    const signedTravel = Progress.alongTrackTravel(before, after, directions[i + 1]);
    const startFraction = Progress.finishCrossing(before, after,
      positions[start], directions[start], route.ROAD_HALF_WIDTH);
    const finishFraction = Progress.finishCrossing(before, after,
      positions[finish], directions[finish], route.ROAD_HALF_WIDTH);
    const next = Progress.moveOpen(motion, routeLength, signedTravel,
      startFraction, finishFraction, i + 1, count);
    motion = next.state;
    allEvents.push(...next.events.map(e => e.type));
  }
  assert.deepEqual(allEvents, ["start", "lap"],
    "start and finish must work on the actual generated route");
  assert.equal(motion.laps, 1);
});

test("closed templates close their seam, share a finish gate and can repeat sections", () => {
  const route = Layout.generateClassic(20261114);
  assert.equal(route.CLOSED, true);
  assert.equal(route.START.x, route.FINISH.x);
  assert.equal(route.START.z, route.FINISH.z);
  assert.equal(route.SECTIONS.length, 20);
  assert.ok(route.LENGTH_METRES > 820 && route.LENGTH_METRES < 920);
  assert.equal(route.RAINBOW, null);
  assert.equal(route.HUMPS.length, 0);
  assert.deepEqual(Generator.build(Layout.CLASSIC_TEMPLATE, 1234).WAYPOINTS,
    Layout.generateClassic(1234).WAYPOINTS);
});

test("closed-loop generator rejects open seams, intersecting roads and unsafe grids", () => {
  const sections = Layout.CLASSIC_TEMPLATE.sections;
  assert.throws(() => Generator.build({
    ...Layout.CLASSIC_TEMPLATE,
    repeat: 1,
  }), /return to its origin|same heading/);
  assert.throws(() => Generator.build({
    ...Layout.CLASSIC_TEMPLATE,
    sections: sections.map((section, index) =>
      index === 1 ? { ...section, angle: 22 } : section),
  }), /return to its origin|same heading/);
  assert.throws(() => Generator.build({
    ...Layout.CLASSIC_TEMPLATE,
    minClearanceMetres: 150,
  }), /overlapping road/);
  assert.throws(() => Generator.build({
    ...Layout.CLASSIC_TEMPLATE,
    finishMetres: 25,
  }), /grid or finish/);
  assert.throws(() => Generator.build({
    ...Layout.CLASSIC_TEMPLATE,
    spawnMetres: 500,
  }), /straights/);
  assert.throws(() => Generator.build({
    ...Layout.CLASSIC_TEMPLATE,
    repeat: 5,
  }), /repetition/);
  assert.throws(() => Generator.build({
    ...Layout.SPRINT_TEMPLATE,
    repeat: 2,
  }), /repetition/);
});
