"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const physics = require("../games/gcv/physics.js");

const standing = () => ({ x: 0, z: 0, yaw: 0, speed: 0 });

test("accelerating drives a stationary car forward", () => {
  let car = standing();
  for (let i = 0; i < 90; i++) {
    car = physics.advance(car, { accelerate: true, brake: false, steer: 0 }, 1 / 60);
  }
  assert.ok(car.speed > 0 && car.speed <= physics.MAX_SPEED);
  assert.ok(car.z < 0);
  assert.equal(car.x, 0);
  assert.equal(car.yaw, 0);
});

test("hard braking stops the car before the delayed reverse engages", () => {
  let car = { x: 0, z: 0, yaw: 0, speed: 30 };
  for (let i = 0; i < 25; i++) {
    car = physics.advance(car, { brake: true, steer: 0 }, 1 / 60);
  }
  assert.equal(car.speed, 0);
  assert.ok(car.reverseHold >= 0 && car.reverseHold < physics.REVERSE_DELAY);
});

test("left and right steering turn the car in opposite directions", () => {
  const rolling = { x: 0, z: 0, yaw: 0, speed: 22 };
  const left = physics.advance(rolling, { steer: -1 }, 1 / 60);
  const right = physics.advance(rolling, { steer: 1 }, 1 / 60);
  assert.ok(left.x < 0 && left.yaw > 0);
  assert.ok(right.x > 0 && right.yaw < 0);
  assert.equal(rolling.yaw, 0, "advance must not mutate the original car");
});

test("a stationary car does not spin when the direction is touched", () => {
  const car = physics.advance(standing(), { steer: 1 }, 1 / 60);
  assert.equal(car.yaw, 0);
});

test("speed and time steps are bounded", () => {
  let car = { x: 0, z: 0, yaw: 0, speed: physics.MAX_SPEED };
  car = physics.advance(car, { accelerate: true, steer: 0 }, 5);
  assert.equal(car.speed, physics.MAX_SPEED);
  assert.ok(Math.abs(car.z) <= physics.MAX_SPEED * 0.05 + 0.0001);
});

test("no input allows the car to coast to a stop", () => {
  let car = { x: 0, z: 0, yaw: 0, speed: 12 };
  for (let i = 0; i < 4000; i++) {
    car = physics.advance(car, {}, 1 / 60);
  }
  assert.equal(car.speed, 0);
});

test("steering returns to its original 1.45 rad/s sensitivity", () => {
  const rolling = { x: 0, z: 0, yaw: 0, speed: 18 };
  const turned = physics.advance(rolling, { steer: 1 }, 1 / 60);
  assert.ok(Math.abs(turned.yaw + 1.45 / 60) < 1e-9);
  assert.equal(physics.MAX_STEER_RATE, 1.45);
});

test("earth shoulder and track have identical paved-road handling", () => {
  const rolling = { x: 0, z: 0, yaw: 0, speed: 20 };
  const road = physics.advance(rolling, { accelerate: true, steer: 1 }, 1 / 60);
  const shoulder = physics.advance(rolling,
    { accelerate: true, steer: 1, gravel: true }, 1 / 60);
  assert.deepEqual(shoulder, road);
});

test("a falling car keeps forward momentum while gravity lowers it", () => {
  const initial = { x: 4, z: 15, yaw: 0, speed: 18 };
  let fall = physics.startFall(initial);
  assert.equal(fall.remaining, 2);
  for (let i = 0; i < 60; i++) fall = physics.advanceFall(fall, 1 / 60);
  assert.ok(fall.z < initial.z - 10, "car should travel into the air");
  assert.ok(fall.y < -4.5, "car should have fallen under gravity");
  assert.ok(fall.vy < 0, "downward velocity increases");
  assert.ok(Math.abs(fall.remaining - 1) < 1e-8, "countdown starts with the fall");
  for (let i = 0; i < 60; i++) fall = physics.advanceFall(fall, 1 / 60);
  assert.ok(Math.abs(fall.remaining) < 1e-8);
  assert.ok(Math.abs(fall.y - (0.14 + physics.INITIAL_FALL_VELOCITY * 2 - 0.5 * 9.81 * 4)) < 1e-6);
});

test("the fall timer never runs past two seconds", () => {
  let fall = physics.startFall({ x: 0, z: 0, yaw: 0, speed: 12 });
  for (let i = 0; i < 150; i++) fall = physics.advanceFall(fall, 1 / 60);
  assert.equal(fall.remaining, 0);
  assert.equal(fall.elapsed, physics.FALL_SECONDS);
});

test("fall countdown uses elapsed seconds even when frames are slow", () => {
  let fall = physics.startFall({ x: 0, z: 0, yaw: 0, speed: 20 });
  fall = physics.advanceFall(fall, 1.2);
  assert.ok(Math.abs(fall.remaining - 0.8) < 1e-10);
  assert.ok(fall.z < -20);
  fall = physics.advanceFall(fall, 1.1);
  assert.equal(fall.remaining, 0);
  assert.equal(fall.elapsed, 2);
});

test("the stronger brake reduces speed much faster than the old 31 m/s²", () => {
  const before = { x: 0, z: 0, yaw: 0, speed: 30 };
  const after = physics.advance(before, { brake: true }, 0.05);
  assert.ok(before.speed - after.speed > 4, "brake should decelerate by over 4 m/s in 50 ms");
  assert.ok(physics.BRAKE_DECELERATION > 2 * 31);
});

test("holding the brake while stationary engages a slow reverse after a delay", () => {
  let car = standing();
  for (let i = 0; i < 40; i++) {
    car = physics.advance(car, { brake: true }, 1 / 60);
  }
  assert.equal(car.speed, 0, "must not reverse during initial hold");
  for (let i = 0; i < 20; i++) {
    car = physics.advance(car, { brake: true }, 1 / 60);
  }
  assert.ok(car.speed < 0, "reverse engages after 0.8 s at rest");
  assert.ok(car.z > 0, "negative speed moves backward");
});

test("reverse is speed-limited and releasing brake stops reverse acceleration", () => {
  let car = standing();
  for (let i = 0; i < 210; i++) {
    car = physics.advance(car, { brake: true }, 1 / 60);
  }
  assert.equal(car.speed, -physics.REVERSE_MAX_SPEED);
  const moving = physics.advance(car, {}, 1 / 60);
  assert.ok(moving.speed > car.speed, "releasing brake should coast towards rest");
  assert.equal(moving.reverseHold, 0);
});

test("accelerator recovers from reverse and eventually drives forwards", () => {
  let car = { ...standing(), speed: -physics.REVERSE_MAX_SPEED };
  for (let i = 0; i < 40; i++) {
    car = physics.advance(car, { accelerate: true }, 1 / 60);
  }
  assert.ok(car.speed > 0);
});

test("steering direction is reversed while driving backwards", () => {
  const car = { ...standing(), speed: -3 };
  const turned = physics.advance(car, { steer: 1, brake: true }, 1 / 60);
  assert.ok(turned.yaw > car.yaw);
});

test("falling backward keeps the correct signed horizontal momentum", () => {
  const falling = physics.startFall({ ...standing(), speed: -3 });
  assert.ok(falling.vz > 0);
});

test("top speed is 250 km/h and achievable with held acceleration", () => {
  assert.ok(Math.abs(physics.MAX_SPEED * 3.6 - 250) < 1e-8);
  let car = standing();
  for (let i = 0; i < 1200; i++) {
    car = physics.advance(car, { accelerate: true }, 1 / 60);
  }
  assert.ok(Math.abs(car.speed - physics.MAX_SPEED) < 0.001,
    "full throttle should actually reach the configured top speed");
});

test("a 250 km/h car can still brake to a full stop", () => {
  let car = { ...standing(), speed: physics.MAX_SPEED };
  for (let i = 0; i < 100; i++) {
    car = physics.advance(car, { brake: true }, 1 / 60);
    if (car.speed === 0) break;
  }
  assert.equal(car.speed, 0);
  assert.equal(car.reverseHold, 0);
});

test("normal turns, straight driving and braking produce no visual skid", () => {
  assert.equal(physics.skidIntensity(22, 1), 0);
  assert.equal(physics.skidIntensity(physics.MAX_SPEED, 0.5), 0);
  assert.equal(physics.skidIntensity(physics.MAX_SPEED, 0), 0);
  assert.equal(physics.skidIntensity(35, 0.8), 0);
});

test("mud only sprays during extreme fast cornering", () => {
  assert.ok(physics.skidIntensity(48, 1) > 0);
  assert.ok(physics.skidIntensity(physics.MAX_SPEED, 0.9) > 0);
  assert.ok(physics.skidIntensity(-physics.REVERSE_MAX_SPEED, 1) === 0);
});

test("fall begins descending immediately, without any initial floating arc", () => {
  let fall = physics.startFall({ ...standing(), speed: 30 });
  assert.ok(fall.vy < 0, "downward velocity begins at the edge");
  let previousY = fall.y;
  for (let i = 0; i < 12; i++) {
    fall = physics.advanceFall(fall, 1 / 60);
    assert.ok(fall.y < previousY, "altitude must decrease every frame");
    previousY = fall.y;
  }
  assert.ok(fall.y < -1.2, "descent is visible within 0.2 seconds");
  assert.ok(fall.remaining < physics.FALL_SECONDS);
});

test("normal-gravity jumps have no artificial upward boost", () => {
  let jump = { height: 0.001, velocity: 4 };
  let peak = 0, landed = 0, duration = 0;
  for (let frame = 0; frame < 100; frame++) {
    jump = physics.advanceJump(jump.height, jump.velocity, 1 / 60);
    peak = Math.max(peak, jump.height);
    if (jump.landed) { landed++; duration = frame / 60; }
  }
  assert.ok(peak > 0.7 && peak < 0.9);
  assert.ok(duration > 0.75 && duration < 0.9);
  assert.equal(landed, 1);
  assert.equal(jump.height, 0);
  assert.equal(jump.velocity, 0);
  assert.equal(physics.JUMP_GRAVITY, physics.GRAVITY);
});
test("airborne steering and braking are gentle and cannot reverse", () => {
  const moving = { x: 0, z: 0, yaw: 0, speed: 40 };
  const ground = physics.advance(moving, { steer: 1, brake: true }, 0.05);
  const air = physics.advance(moving, { steer: 1, brake: true, airborne: true }, 0.05);
  assert.ok(Math.abs(air.yaw) < Math.abs(ground.yaw) / 5);
  assert.ok(air.speed > ground.speed && air.speed < moving.speed);
  assert.equal(physics.advance({ ...moving, speed: 0 },
    { brake: true, airborne: true }, 0.05).speed, 0);
  assert.equal(physics.AIR_STEER_FACTOR, 0.12);
});

test("jump altitude stays ballistic when the road rises or descends", () => {
  const initial = { height: 2, velocity: 5 };
  const rising = physics.advanceJump(initial.height, initial.velocity, 0.05, 1.4);
  const dropping = physics.advanceJump(initial.height, initial.velocity, 0.05, -1.4);
  assert.ok(Math.abs((dropping.height - rising.height) - 2.8) < 1e-9);
  assert.equal(dropping.velocity, rising.velocity);
  const impact = physics.advanceJump(0.2, -3, 0.05, 1);
  assert.equal(impact.height, 0);
  assert.equal(impact.landed, true);
  assert.equal(physics.advanceJump(0, 0, 0.05).landed, false);
});

test("takeoff depends on speed, upward road slope and crest curvature", () => {
  const layout = require("../games/gcv/track-layout.js").SPRINT;
  const hill = layout.HUMP_PROFILES[0];
  const length = layout.WAYPOINTS.slice(1).reduce((total, point, i) =>
    total + Math.hypot(point[0] - layout.WAYPOINTS[i][0],
      point[1] - layout.WAYPOINTS[i][1]), 0);
  const heightAt = layout.heightAt;
  const approaching = hill.at - 22 / length;
  const fast = physics.takeoffVelocity(approaching, 69, length, heightAt);
  assert.ok(fast > 0 && fast < 10, "velocity comes from the road slope");
  assert.equal(physics.takeoffVelocity(approaching, 35, length, heightAt), null,
    "a slow car stays on the road");
  assert.equal(physics.takeoffVelocity(hill.at + 20 / length, 69, length, heightAt), null,
    "already descending the hill must not trigger a jump");
  assert.equal(physics.takeoffVelocity(approaching, -69, length, heightAt), null);
  assert.equal(physics.takeoffVelocity(approaching, 69, length, () => 0), null);
  assert.equal(physics.takeoffVelocity(approaching, 69, length, heightAt,
    9, 7.2), null, "takeoff from a gravel shoulder must not snap laterally");
  assert.ok(physics.takeoffVelocity(approaching, 69, length, heightAt,
    3, 7.2) > 0);
});
test("jump touchdown is detected once at a low frame rate", () => {
  let jump = { height: 0.001, velocity: 4 };
  let landingCount = 0;
  for (let i = 0; i < 50; i++) {
    jump = physics.advanceJump(jump.height, jump.velocity, 0.05);
    if (jump.landed) landingCount++;
  }
  assert.equal(landingCount, 1);
});
test("hills give shallow speed-dependent airtime instead of huge leaps", () => {
  const layout = require("../games/gcv/track-layout.js").SPRINT;
  const profiles = layout.HUMP_PROFILES;
  const distance = layout.WAYPOINTS.slice(1).reduce((length, point, i) =>
    length + Math.hypot(point[0] - layout.WAYPOINTS[i][0],
      point[1] - layout.WAYPOINTS[i][1]), 0);
  const ground = layout.heightAt;

  function crossHill(hill, speed) {
    const step = 1 / 60;
    let t = hill.at - 2 * hill.width;
    let height = 0, velocity = 0, cooldown = 0;
    let takeoffs = 0, landings = 0, peak = 0, framesInAir = 0;
    while (t < hill.at + 2 * hill.width) {
      const previousRoad = ground(t);
      t += speed * step / distance;
      cooldown = Math.max(0, cooldown - step);
      if (height === 0 && velocity === 0 && cooldown === 0) {
        const launch = physics.takeoffVelocity(t, speed, distance, ground);
        if (launch !== null) {
          height = 0.001; velocity = launch; cooldown = 1;
          takeoffs++;
          // Takeoff begins on the current surface; the ballistic integration
          // starts on the next frame, just as in game.js.
          continue;
        }
      }
      if (height > 0 || velocity > 0) {
        const next = physics.advanceJump(height, velocity, step,
          ground(t) - previousRoad);
        height = next.height;
        velocity = next.velocity;
        peak = Math.max(peak, height);
        framesInAir++;
        if (next.landed) landings++;
      }
    }
    return { takeoffs, landings, peak, seconds: framesInAir * step };
  }

  for (const hill of profiles) {
    const slow = crossHill(hill, 40);
    const fast = crossHill(hill, 69);
    assert.equal(slow.takeoffs, 0, "slow car hugs the surface");
    assert.equal(fast.takeoffs, 1);
    assert.equal(fast.landings, 1);
    assert.ok(fast.peak > 1 && fast.peak < 5,
      "fast car lifts only slightly above hill " + hill.at + ": " + fast.peak);
    assert.ok(fast.seconds > 1.2 && fast.seconds < 3,
      "flight must be short, not a fixed multi-second jump");
  }
});

test("first crowned crest stays airborne in the actual sampled-road loop", () => {
  const layout = require("../games/gcv/track-layout.js").SPRINT;
  const progress = require("../games/gcv/track-progress.js");
  const length = layout.WAYPOINTS.slice(1).reduce((sum, point, i) =>
    sum + Math.hypot(point[0] - layout.WAYPOINTS[i][0],
      point[1] - layout.WAYPOINTS[i][1]), 0);
  const count = layout.SAMPLE_COUNT;
  const positions = Array.from({ length: count + 1 }, (_, i) =>
    ({ x: 0, z: -length * i / count }));
  const first = layout.HUMP_PROFILES[0];

  for (const dt of [1 / 60, 0.05]) {
    const from = first.at - 0.035;
    let car = { x: 0, z: -from * length, yaw: 0, speed: 69,
      roadY: layout.heightAt(from), jumpY: 0 };
    let velocity = 0, cooldown = 0;
    let index = Math.floor(from * count);
    let takeoffs = 0, landings = 0, peak = 0;
    for (let i = 0; i < 250; i++) {
      const before = { x: car.x, z: car.z };
      const roadBefore = car.roadY;
      const airborne = car.jumpY > 0 || velocity > 0;
      car = { ...physics.advance(car, { accelerate: true, airborne }, dt),
        roadY: roadBefore, jumpY: car.jumpY };
      let nearest = progress.nearestOpenSample(
        positions, count, car.x, car.z, index, 12, 16);
      if (airborne) {
        const guided = progress.guideAirborne(positions, count,
          before, car, index, 9, 0, dt);
        assert.ok(guided);
        car.x = guided.x;
        car.z = guided.z;
        nearest = { index: guided.index };
      }
      const projection = progress.projectOpenRoad(
        positions, count, car.x, car.z, nearest.index);
      index = nearest.index;
      car.roadY = layout.heightAt(projection.fraction);
      cooldown = Math.max(0, cooldown - dt);
      let launched = false;
      if (!airborne && cooldown === 0) {
        const lift = physics.takeoffVelocity(projection.fraction,
          car.speed, length, layout.heightAt, projection.lateral, 7.2);
        if (lift !== null) {
          velocity = lift;
          car.jumpY = physics.JUMP_CLEARANCE;
          cooldown = 1;
          launched = true;
          takeoffs++;
        }
      }
      if (!launched && (car.jumpY > 0 || velocity > 0)) {
        const flight = physics.advanceJump(
          car.jumpY, velocity, dt, car.roadY - roadBefore);
        car.jumpY = flight.height;
        velocity = flight.velocity;
        if (flight.landed) landings++;
      }
      peak = Math.max(peak, car.jumpY);
      if (projection.fraction > first.at + 0.065) break;
    }
    assert.equal(takeoffs, 1, "max-speed car must jump at " + dt + " s/frame");
    assert.equal(landings, 1, "flight must finish normally at " + dt + " s/frame");
    assert.ok(peak > 1 && peak < 5,
      "lift must be visible but modest; got " + peak + " m");
  }
});


test("shared drift yaw starts at the exact same threshold as mud particles", () => {
  for (const steer of [-1, -0.8, 0, 0.8, 1]) {
    for (const speed of [0, 15, 29.9, 30, 38, 47, 62, physics.MAX_SPEED]) {
      const particles = physics.skidIntensity(speed, steer);
      const visualYaw = physics.driftBodyYaw(speed, steer);
      assert.equal(visualYaw === 0, particles === 0);
      assert.ok(Math.abs(visualYaw) <= 0.285);
      if (particles > 0) assert.equal(Math.sign(visualYaw), -Math.sign(steer));
    }
  }
  // With the same speed, a larger steering angle must create a larger
  // visual slide. Full steering now gives exactly half the old angle.
  const speed = 65;
  const moderate = Math.abs(physics.driftBodyYaw(speed, 0.85));
  const hard = Math.abs(physics.driftBodyYaw(speed, 1));
  assert.ok(moderate > 0 && moderate < hard);
  const oldHard = Math.min(0.38,
    0.31 * Math.sqrt(physics.skidIntensity(speed, 1)));
  assert.ok(Math.abs(hard - oldHard * 0.5) < 1e-10);
  for (const steer of [-1, -0.95, -0.85, 0.85, 0.95, 1]) {
    const oldAngle = Math.min(0.38,
      0.31 * Math.sqrt(physics.skidIntensity(speed, steer)));
    assert.ok(Math.abs(physics.driftBodyYaw(speed, steer)) <=
      oldAngle * 0.5 + 1e-12);
  }
  const turnRate = 1.45;
  assert.equal(physics.steeringForYawRate(50, turnRate), 1);
  assert.equal(physics.steeringForYawRate(50, -turnRate), -1);
  assert.equal(physics.steeringForYawRate(0, turnRate), 0);
  assert.equal(physics.steeringForYawRate(50, 0), 0);
  assert.equal(physics.skidIntensity(58, physics.steeringForYawRate(58, turnRate)),
    physics.skidIntensity(58, 1),
    "AI steering is evaluated with the player's original particle threshold");
});
