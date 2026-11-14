"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Layout = require("../games/gcv/track-layout.js");
const Navigation = require("../games/gcv/ai-navigation.js");
const Physics = require("../games/gcv/physics.js");
const Race = require("../games/gcv/race.js");

// Approximate World3D's arc-length sampling without requiring Three.js or a
// browser in the Node suite. The production AI receives World3D's actual
// Catmull-Rom positions and tangents, not this test-only polyline.
function sampledLayout(route) {
  const waypoints = route.CLOSED ?
    [...route.WAYPOINTS, route.WAYPOINTS[0]] : route.WAYPOINTS;
  const sums = [0];
  for (let i = 1; i < waypoints.length; i++) {
    sums.push(sums[i - 1] + Math.hypot(
      waypoints[i][0] - waypoints[i - 1][0],
      waypoints[i][1] - waypoints[i - 1][1]));
  }
  const length = sums[sums.length - 1];
  const sampleCount = route.SAMPLE_COUNT;
  let segment = 0;
  const positions = Array.from({ length: sampleCount + 1 }, (_, i) => {
    const metres = i * length / sampleCount;
    while (segment < sums.length - 2 && sums[segment + 1] < metres)
      segment++;
    const fraction = (metres - sums[segment]) /
      (sums[segment + 1] - sums[segment]);
    return {
      x: waypoints[segment][0] * (1 - fraction) +
        waypoints[segment + 1][0] * fraction,
      z: waypoints[segment][1] * (1 - fraction) +
        waypoints[segment + 1][1] * fraction,
    };
  });
  const directions = positions.map((point, i) => {
    const before = positions[Math.max(0, i - 1)];
    const after = positions[Math.min(sampleCount, i + 1)];
    const magnitude = Math.hypot(after.x - before.x, after.z - before.z);
    return { x: (after.x - before.x) / magnitude,
      z: (after.z - before.z) / magnitude };
  });
  const startIndex = route.nearestIndex(positions, route.START);
  const finishIndex = route.CLOSED ? startIndex :
    route.nearestIndex(positions, route.FINISH);
  const routeLength = route.CLOSED ? length :
    (finishIndex - startIndex) * length / sampleCount;
  const laps = route.CLOSED ? Race.LAPS : 1;
  return {
    length, routeLength, laps,
    navigation: Navigation.create({
      positions, directions, sampleCount, startIndex, trackLength: length,
      routeLength, closed: route.CLOSED, laps, maxSpeed: Physics.MAX_SPEED,
    }),
  };
}

test("each generated route and seed gives all nine competitors a valid track plan", () => {
  for (const route of [
    Layout.generateClassic(1), Layout.generateClassic(20261114),
    Layout.generateSprint(1), Layout.generateSprint(42),
    Layout.generateSprint(20261114),
  ]) {
    const { navigation, routeLength, laps } = sampledLayout(route);
    const state = Race.create(routeLength, () => 0.5, null, laps, navigation);
    assert.equal(state.distanceModel, "geometry-pace-v2");
    assert.equal(state.opponents.length, 9);
    const times = state.opponents.map((opponent) =>
      navigation.plan(opponent).totalTime);
    assert.ok(times.every(Number.isFinite));
    assert.ok(times.every((time) => time > 0));
    for (let i = 1; i < times.length; i++) {
      assert.ok(times[i] > times[i - 1],
        "driver difficulty/order must be stable on every seed");
    }
    for (const opponent of state.opponents) {
      const plan = navigation.plan(opponent);
      const after = navigation.sample(opponent, plan.totalTime);
      assert.equal(after.progress, routeLength * laps);
      assert.equal(after.finishTime, plan.totalTime);
      assert.ok(Array.from(plan.speeds).every(speed =>
        Number.isFinite(speed) && speed >= 0 &&
        speed <= Physics.MAX_SPEED + 1e-9));
    }
  }
});

test("generated hairpins impose lower speeds than straights, with braking before turn", () => {
  const { navigation } = sampledLayout(Layout.CLASSIC);
  const limits = [];
  for (let progress = 0; progress < Layout.CLASSIC.LENGTH_METRES; progress += 4)
    limits.push(navigation.curveLimit(progress));
  assert.ok(Math.min(...limits) < Physics.MAX_SPEED * 0.8);
  assert.ok(Math.max(...limits) >= Physics.MAX_SPEED * 0.99);
  const opponent = Race.create(sampledLayout(Layout.CLASSIC).routeLength,
    () => 0.5, null, 3, navigation).opponents[0];
  const plan = navigation.plan(opponent);
  assert.ok(Array.from(plan.speeds).some((speed, i) =>
    i > 10 && i < plan.count - 10 &&
    speed < plan.speeds[i - 6] && speed < plan.speeds[i + 12]),
  "turns should have a slower apex with a braking approach");
});

test("race progress and exact AI finish times are frame-rate independent", () => {
  for (const route of [Layout.CLASSIC, Layout.SPRINT]) {
    const { navigation, routeLength, laps } = sampledLayout(route);
    let state = Race.create(routeLength, () => 0.5, null, laps, navigation);
    const prestart = state.opponents.map(o => o.progress);
    state = Race.advance(state, 4.8, 0, null, navigation);
    assert.ok(state.opponents.every((o, i) => o.progress === prestart[i]));
    const largeFrame = Race.advance(state, 100, 0, null, navigation);
    let smallFrames = state;
    for (let i = 0; i < 500; i++)
      smallFrames = Race.advance(smallFrames, 0.2, 0, null, navigation);
    for (let i = 0; i < 9; i++) {
      const a = largeFrame.opponents[i], b = smallFrames.opponents[i];
      assert.ok(Math.abs(a.progress - b.progress) < 1e-6);
      assert.ok(Math.abs(a.finishTime - b.finishTime) < 1e-6);
      assert.ok(a.finishTime > 0);
      assert.equal(a.progress, routeLength * laps);
    }
  }
});

test("saved race restores each driver's skill and reconstructs the same pace", () => {
  const { navigation, routeLength, laps } = sampledLayout(Layout.SPRINT);
  let state = Race.create(routeLength, () => 0.35, null, laps, navigation);
  state = Race.advance(state, 5, 0, null, navigation);
  state = Race.advance(state, 16, 0, null, navigation);
  const save = JSON.parse(JSON.stringify(state));
  const restored = Race.restore(save, routeLength, laps, navigation);
  assert.deepEqual(restored, state);
  const next = Race.advance(restored, 21, 0, null, navigation);
  for (let i = 0; i < 9; i++) {
    assert.ok(next.opponents[i].progress > restored.opponents[i].progress);
    assert.ok(next.opponents[i].progress <= routeLength);
  }
  assert.equal(Race.restore({ ...save, paceVersion: 3 },
    routeLength, laps, navigation), null);
  assert.equal(Race.restore({ ...save, distanceModel: "unified-motion-v1" },
    routeLength, laps, navigation), null);
});

test("difficulty spread stays comparable on open and closed circuits", () => {
  const classic = sampledLayout(Layout.CLASSIC);
  const rainbow = sampledLayout(Layout.SPRINT);
  const spread = ({ navigation, routeLength, laps }) => {
    const opponents = Race.create(routeLength, () => 0.5,
      null, laps, navigation).opponents;
    return navigation.plan(opponents[8]).totalTime /
      navigation.plan(opponents[0]).totalTime;
  };
  const classicSpread = spread(classic), rainbowSpread = spread(rainbow);
  assert.ok(classicSpread > 1.4 && rainbowSpread > 1.4);
  assert.ok(Math.abs(classicSpread - rainbowSpread) < 0.3,
    "circuit changes must not collapse or reverse opponent difficulty");
});
