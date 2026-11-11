"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Rendering = require("../games/gcv/rendering.js");

class Vector {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
  copy(v) { return this.set(v.x, v.y, v.z); }
  lerp(v, t) { return this.set(this.x + (v.x - this.x) * t,
    this.y + (v.y - this.y) * t, this.z + (v.z - this.z) * t); }
  normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1;
    return this.set(this.x / l, this.y / l, this.z / l); }
}
let latestRenderer, latestCamera;
class WebGLRenderer {
  constructor(options) { this.options = options; this.domElement = {}; latestRenderer = this; }
  setPixelRatio(ratio) { this.pixelRatio = ratio; }
  setSize(...size) { this.size = size; }
  render(scene, camera) { this.lastRender = { scene, camera }; }
}
class Mesh {
  constructor(geometry, material) {
    this.geometry = geometry;
    this.material = material;
    this.position = new Vector();
    this.rotation = { set(x, y, z, order) {
      Object.assign(this, { x, y, z, order });
    } };
    this.scale = new Vector(1, 1, 1);
    this.visible = true;
  }
}
class MeshBasicMaterial {
  constructor(properties) { Object.assign(this, properties); }
  clone() { return new MeshBasicMaterial({ ...this }); }
}
class PerspectiveCamera {
  constructor(fov, aspect, near, far) { Object.assign(this, { fov, aspect, near, far });
    this.position = new Vector(); latestCamera = this; }
  updateProjectionMatrix() { this.updated = true; }
  lookAt(v) { this.target = new Vector().copy(v); }
}

function fixture(closed = true, withMotoRider = false) {
  const window = { devicePixelRatio: 3, listeners: {},
    document: { createElement() {
      return { getContext() {
        return { createRadialGradient() { return { addColorStop() {} }; },
          fillRect() {} };
      } };
    } },
    addEventListener(name, cb) { this.listeners[name] = cb; } };
  const stage = { clientWidth: 800, clientHeight: 400 };
  const sceneHost = { append(canvas) { this.canvas = canvas; } };
  const scene = { objects: [], add(mesh) { this.objects.push(mesh); } };
  const car = {
    position: new Vector(), rotation: { x: 0, y: 0,
      set(x, y, z, order) { Object.assign(this, { x, y, z, order }); } },
    updateMatrixWorld(force) { this.matrixUpdated = force; },
    localToWorld(v) { return v.set(v.x + this.position.x, v.y + this.position.y,
      v.z + this.position.z); },
  };
  const wheelPivots = Array.from({ length: 4 }, () => ({ rotation: { x: 0 } }));
  const brakeLights = { emissiveIntensity: 0.15 };
  const rearBrakeGlows = [{ intensity: 0 }, { intensity: 0 }];
  const ai = { position: new Vector(), rotation: {}, visible: false };
  const opponentMeshes = new Map([[1, ai]]);
  const curve = { getPointAt(t) { return new Vector(t * 100, 0, 20); },
    getTangentAt() { return new Vector(1, 0, 0); } };
  const THREE = { WebGLRenderer, PerspectiveCamera, Vector3: Vector,
    Mesh, MeshBasicMaterial, PlaneGeometry: class {},
    CanvasTexture: class { constructor(canvas) { this.canvas = canvas; } },
    LinearFilter: "linear", DoubleSide: "double", SRGBColorSpace: "srgb" };
  const motoRider = withMotoRider ? {
    body: { position: new Vector(0, 1.32, 0.22), rotation: { x: 0, y: 0, z: 0 } },
    helmet: { rotation: { x: 0, y: 0, z: 0 } },
    arms: Array.from({ length: 2 }, () =>
      ({ rotation: { x: 0, y: 0, z: 0 } })),
    baseY: 1.32,
  } : null;
  const visibility = [];
  const view = Rendering.create({ THREE, window, stage, sceneHost, scene, car,
    wheelPivots, brakeLights, rearBrakeGlows, opponentMeshes, curve,
    startIndex: 0, SAMPLE_COUNT: 100, trackLength: 1000, closed, motoRider,
    onCameraVisibility: (outside) => visibility.push(outside) });
  return { view, window, stage, sceneHost, scene, car, motoRider, wheelPivots,
    brakeLights, rearBrakeGlows, ai, visibility,
    renderer: latestRenderer, camera: latestCamera };
}

test("WebGL renderer initializes, handles portrait resize and draws", () => {
  const { view, window, stage, sceneHost, scene, renderer, camera } = fixture();
  assert.equal(sceneHost.canvas, renderer.domElement);
  assert.equal(renderer.pixelRatio, 1.7);
  assert.equal(renderer.outputColorSpace, "srgb");
  assert.deepEqual(renderer.size, [800, 400, false]);
  assert.equal(camera.fov, 72);
  view.updatePlayer({ driver: { x: 0, z: 0, yaw: 0, speed: 0 }, fall: null,
    dt: 0, brakePressed: false });
  view.updateCamera(0);
  view.render();
  stage.clientWidth = 240;
  stage.clientHeight = 480;
  window.listeners.resize();
  view.render();
  assert.deepEqual(renderer.size, [240, 480, false]);
  assert.equal(camera.aspect, 0.5);
  assert.equal(camera.fov, 77);
  assert.equal(renderer.lastRender.scene, scene);
  assert.equal(renderer.lastRender.camera, camera);
});

test("player movement, falling, wheel spin and brake lights are visual only", () => {
  const { view, car, wheelPivots, brakeLights, rearBrakeGlows } = fixture();
  const driver = { x: 4, z: 7, yaw: 0.9, speed: 23 };
  view.updatePlayer({ driver, fall: null, dt: 0.1, brakePressed: true });
  assert.deepEqual([car.position.x, car.position.y, car.position.z], [4, 0.14, 7]);
  assert.equal(car.rotation.y, 0.9);
  assert.equal(car.matrixUpdated, true);
  assert.ok(wheelPivots.every(w => w.rotation.x < 0));
  assert.equal(brakeLights.emissiveIntensity, 3.8);
  assert.ok(rearBrakeGlows.every(g => g.intensity === 3.5));
  view.updatePlayer({ driver, fall: { x: 5, y: -2, z: 8, elapsed: 1 },
    dt: 0, brakePressed: false });
  assert.equal(car.position.y, -2);
  assert.equal(car.rotation.x, 0.42);
  assert.equal(brakeLights.emissiveIntensity, 0.15);
});

test("soft shadows follow the road, not jump height, and fit the vehicle", () => {
  const { view, scene, car } = fixture();
  const [playerShadow, opponentShadow] = scene.objects;
  const driver = { x: 4, z: 7, yaw: 0.8, speed: 22, roadY: 2, jumpY: 0 };
  view.setVehicle("moto");
  view.updatePlayer({ driver, fall: null, dt: 0, brakePressed: false });
  assert.equal(playerShadow.visible, true);
  assert.deepEqual([playerShadow.position.x, playerShadow.position.y,
    playerShadow.position.z], [4, 2 + Rendering.SHADOW_GROUND_OFFSET, 7]);
  assert.equal(playerShadow.rotation.order, "YXZ");
  assert.equal(playerShadow.rotation.y, driver.yaw);
  assert.equal(playerShadow.scale.x, Rendering.SHADOW_FOOTPRINTS.moto[0]);
  assert.equal(playerShadow.scale.y, Rendering.SHADOW_FOOTPRINTS.moto[1]);
  const restingOpacity = playerShadow.material.opacity;
  driver.jumpY = 1.1;
  view.updatePlayer({ driver, fall: null, dt: 0, brakePressed: false,
    jumpVelocity: 4 });
  assert.equal(car.position.y, 3.24);
  assert.equal(playerShadow.position.y, 2 + Rendering.SHADOW_GROUND_OFFSET,
    "the shadow stays on the elevated road during takeoff");
  assert.ok(playerShadow.material.opacity < restingOpacity);
  assert.ok(playerShadow.scale.x < Rendering.SHADOW_FOOTPRINTS.moto[0]);
  view.setVehicle("kart");
  driver.jumpY = 0;
  view.updatePlayer({ driver, fall: null, dt: 0, brakePressed: false });
  assert.equal(playerShadow.scale.x, Rendering.SHADOW_FOOTPRINTS.kart[0]);
  assert.equal(playerShadow.material.opacity, restingOpacity);
  view.updatePlayer({ driver, fall: { x: 4, y: -1, z: 7, elapsed: 0.3 },
    dt: 0, brakePressed: false });
  assert.equal(playerShadow.visible, false, "no shadow hangs over a hole");
  view.syncOpponents([{ id: 1, progress: 250, lateral: 3 }]);
  assert.equal(opponentShadow.visible, true);
  assert.deepEqual([opponentShadow.position.x, opponentShadow.position.y,
    opponentShadow.position.z], [25, Rendering.SHADOW_GROUND_OFFSET, 23]);
  view.syncOpponents(null);
  assert.equal(opponentShadow.visible, false, "hidden AI have no shadow");
});

test("camera has rigid cockpit view and outside view follows smoothly", () => {
  const { view, car, camera } = fixture();
  view.updatePlayer({ driver: { x: 10, z: 20, yaw: 0, speed: 0 },
    fall: null, dt: 0, brakePressed: false });
  view.setView(false);
  view.updateCamera(0.016);
  assert.deepEqual([camera.position.x, camera.position.y, camera.position.z],
    [9.58, 1.65, 20.34]);
  view.setView(true);
  view.updateCamera(0.016);
  assert.deepEqual([camera.position.x, camera.position.y, camera.position.z],
    [10, 4.64, 29.7]);
  view.updatePlayer({ driver: { x: 20, z: 30, yaw: 0, speed: 0 },
    fall: null, dt: 0, brakePressed: false });
  assert.equal(car.position.x, 20);
  view.updateCamera(0.016);
  assert.ok(camera.position.x > 10 && camera.position.x < 20);
  view.setView(false);
  view.updateCamera(0.016);
  assert.equal(camera.position.x, 19.58);
});

test("race intro travels smoothly from the side to the exact chase camera", () => {
  const { view, camera, visibility } = fixture();
  view.updatePlayer({ driver: { x: 0, z: 0, yaw: 0, speed: 0 },
    fall: null, dt: 0, brakePressed: false });
  view.setView(true);
  view.startGridIntro();
  view.updateCamera(0);
  assert.equal(view.gridIntroActive, true);
  assert.equal(camera.position.x, -7.5);
  assert.equal(camera.position.z, 4.1);
  const midway = Rendering.GRID_INTRO_DURATION / 2;
  view.updateCamera(midway);
  assert.ok(camera.position.x > -7.5 && camera.position.x < 0);
  view.updateCamera(midway);
  assert.equal(view.gridIntroActive, false);
  assert.deepEqual([camera.position.x, camera.position.y, camera.position.z],
    [0, 4.64, 9.7]);
  assert.deepEqual([camera.target.x, camera.target.y, camera.target.z],
    [0, 1.27, -8]);
  assert.deepEqual(visibility, [true, true]);
  view.updateCamera(0.016);
  assert.equal(camera.position.z, 9.7, "handoff must not change the chase pose");
});

test("cockpit intro enters only in the final third and hides the helmet late", () => {
  const { view, camera, visibility } = fixture();
  view.setVehicle("moto");
  view.updatePlayer({ driver: { x: 0, z: 0, yaw: 0, speed: 0 },
    fall: null, dt: 0, brakePressed: false });
  view.setView(false);
  view.startGridIntro();
  view.updateCamera(Rendering.GRID_INTRO_DURATION * 2 / 3);
  assert.equal(camera.position.x, 0);
  assert.equal(camera.position.z, 7.3);
  assert.deepEqual(visibility, [true]);
  view.updateCamera(Rendering.GRID_INTRO_DURATION / 6);
  assert.ok(camera.position.z < 7.3 && camera.position.z > 0.29);
  assert.deepEqual(visibility, [true]);
  view.updateCamera(Rendering.GRID_INTRO_DURATION / 6);
  assert.equal(view.gridIntroActive, false);
  assert.equal(camera.position.x, 0);
  assert.ok(Math.abs(camera.position.y - 2.36) < 1e-9);
  assert.ok(Math.abs(camera.position.z - 0.29) < 1e-9);
  assert.deepEqual(visibility, [true, false, false]);
  view.updateCamera(0.016);
  assert.ok(Math.abs(camera.position.z - 0.29) < 1e-9,
    "handoff must not jump into the cockpit");
});

test("race intro freezes when paused and cancels on a manual camera change", () => {
  const { view, camera, visibility } = fixture();
  view.setView(false);
  view.startGridIntro();
  view.updateCamera(0.8);
  const pausedPosition = [camera.position.x, camera.position.y, camera.position.z];
  view.updateCamera(0);
  assert.deepEqual([camera.position.x, camera.position.y, camera.position.z],
    pausedPosition);
  view.setView(true);
  assert.equal(view.gridIntroActive, false);
  assert.deepEqual(visibility, [true, true]);
  view.updateCamera(0);
  assert.equal(camera.position.z, 9.7);
});

test("race opponents follow track and disappear in free mode", () => {
  const { view, ai } = fixture();
  view.syncOpponents([{ id: 1, progress: 250, lateral: 3 }]);
  assert.equal(ai.visible, true);
  assert.equal(ai.position.x, 25);
  assert.equal(ai.position.z, 23);
  assert.equal(ai.rotation.y, -Math.PI / 2);
  view.syncOpponents(null);
  assert.equal(ai.visible, false);
});

test("rendering module is loaded before game.js and exposes a browser factory", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const vm = require("node:vm");
  const folder = path.join(__dirname, "../games/gcv");
  const html = fs.readFileSync(path.join(folder, "index.html"), "utf8")
    .replace(/\?v=[\w-]+/g, "");
  const renderingOffset = html.indexOf('src="./rendering.js"');
  const gameOffset = html.indexOf('src="./game.js"');
  assert.ok(renderingOffset >= 0 && gameOffset > renderingOffset);
  const source = fs.readFileSync(path.join(folder, "rendering.js"), "utf8");
  const entry = fs.readFileSync(path.join(folder, "game.js"), "utf8");
  assert.doesNotThrow(() => new vm.Script(source));
  assert.doesNotThrow(() => new vm.Script(entry));
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  assert.equal(typeof sandbox.window.GcvRendering.create, "function");
  assert.match(entry, /Rendering\.create\(/);
  assert.match(entry, /rendering\.render\(\)/);
  assert.doesNotMatch(entry, /new THREE\.WebGLRenderer/);
});

test("the open route caps WebGL framebuffer memory on large Android screens", () => {
  const { renderer, window, stage } = fixture(false);
  assert.equal(renderer.options.antialias, false);
  assert.equal(renderer.pixelRatio, 1.15);
  stage.clientWidth = 1400;
  stage.clientHeight = 800;
  window.listeners.resize();
  assert.ok(renderer.pixelRatio < 1);
  assert.ok(renderer.pixelRatio ** 2 * stage.clientWidth * stage.clientHeight <= 750001);
  assert.deepEqual(renderer.size, [1400, 800, false]);
});

test("motorcycle banks into curves and jump nose pitches through flight", () => {
  const { view, car } = fixture();
  view.setVehicle("moto");
  const rider = (yaw, jumpY = 0) => ({ x: 0, z: 0, yaw, speed: 30, jumpY });
  view.updatePlayer({ driver: rider(0), dt: 1 / 60, fall: null,
    brakePressed: false });
  view.updatePlayer({ driver: rider(0.14, 0.5), dt: 1 / 60, fall: null,
    jumpVelocity: 7, brakePressed: false });
  assert.ok(car.rotation.z > 0, "motorcycle banks left in a left turn");
  assert.ok(car.rotation.x < -0.1, "nose lifts on takeoff");
  view.updatePlayer({ driver: rider(0.16, 0.1), dt: 1 / 60, fall: null,
    jumpVelocity: -7, brakePressed: false });
  assert.ok(car.rotation.x > 0.1, "nose drops shortly before landing");
});

test("motorcycle and rider lean right in right turns, then return upright", () => {
  const { view, car, motoRider } = fixture(true, true);
  view.setVehicle("moto");
  const draw = (yaw) => view.updatePlayer({
    driver: { x: 0, z: 0, yaw, speed: 20, jumpY: 0 },
    fall: null, dt: 1 / 60, brakePressed: false,
  });
  draw(0);
  draw(-0.08); // Negative yaw turns right with -Z as forward.
  assert.ok(car.rotation.z < 0, "motorcycle banks right");
  assert.ok(motoRider.body.rotation.z < 0, "rider leans right");
  assert.ok(motoRider.body.position.x > 0, "rider shifts inward");
  assert.ok(motoRider.helmet.rotation.z > 0, "head counterbalances");
  assert.ok(motoRider.helmet.rotation.y < 0, "head looks right");
  for (let i = 0; i < 45; i++) draw(-0.08);
  assert.ok(Math.abs(car.rotation.z) < 0.001, "bike straightens");
  assert.ok(Math.abs(motoRider.body.rotation.z) < 0.001, "rider straightens");
});

test("Milo reacts subtly to cornering, acceleration and braking", () => {
  const { view, car, motoRider } = fixture(true, true);
  view.setVehicle("moto");
  const sample = (speed, yaw, jumpY = 0) =>
    ({ x: 0, z: 0, yaw, speed, jumpY });
  const draw = (driver, jumpVelocity = 0) => view.updatePlayer({
    driver, fall: null, dt: 0.05, brakePressed: false, jumpVelocity,
  });

  draw(sample(10, 0));
  draw(sample(11, 0.08));
  const { body, helmet, arms } = motoRider;
  assert.ok(body.rotation.z > 0.04 && body.rotation.z < 0.29,
    "hips lean with the bike into the corner");
  assert.ok(car.rotation.z > 0, "motorcycle itself leans into the turn");
  assert.ok(helmet.rotation.z < 0 && helmet.rotation.z >= -0.10,
    "the helmet counterbalances the bike and body");
  assert.ok(helmet.rotation.y > 0.04, "the head visibly looks into the corner");
  assert.ok(Math.abs(body.position.x) > 0.04,
    "the torso shifts enough to be visible from the chase camera");
  assert.ok(arms[0].rotation.x * arms[1].rotation.x < 0,
    "the two arms react in opposite directions to steering");
  assert.ok(body.rotation.x > 0,
    "acceleration pulls the torso slightly back from the handlebars");

  draw(sample(4, 0.08));
  assert.ok(body.rotation.x < 0, "hard braking moves the torso forward");
  assert.ok(body.rotation.x >= -0.14, "braking recoil is restrained");
});

test("Milo absorbs touchdown once and settles, without affecting other cars", () => {
  const { view, motoRider } = fixture(true, true);
  const { body, helmet, baseY } = motoRider;
  const driver = (jumpY, speed = 27) =>
    ({ x: 0, z: 0, yaw: 0, speed, jumpY });
  const draw = (jumpY, velocity = 0, fall = null) => view.updatePlayer({
    driver: driver(jumpY), jumpVelocity: velocity,
    fall, dt: 0.05, brakePressed: false,
  });
  view.setVehicle("moto");
  draw(0.3, 7);
  assert.ok(body.position.y > baseY, "the rider extends slightly on takeoff");
  draw(0.1, -5);
  const aboveGround = body.position.y;
  draw(0);
  assert.ok(body.position.y < aboveGround,
    "the rider compresses briefly on touchdown");
  for (let i = 0; i < 40; i++) draw(0);
  assert.ok(Math.abs(body.position.y - baseY) < 0.05,
    "small road vibration remains possible at speed");
  assert.ok(body.rotation.x < 0 && body.rotation.x > -0.08,
    "the pilot returns to a slight high-speed crouch");

  draw(0, 0);
  view.updatePlayer({ driver: driver(0), fall: { x: 0, y: -1, z: 0, elapsed: 0.2 },
    dt: 0.05, brakePressed: false });
  assert.ok(Number.isFinite(body.rotation.z), "fall never destabilizes the pilot");
  view.setVehicle("kart");
  assert.equal(body.rotation.x, 0);
  assert.equal(body.rotation.z, 0);
  assert.equal(body.position.y, baseY);
  assert.equal(helmet.rotation.y, 0);
  assert.ok(motoRider.arms.every((arm) =>
    arm.rotation.x === 0 && arm.rotation.z === 0));
  draw(0);
  assert.equal(body.position.y, baseY, "the hidden moto pilot is not animated");
});

test("steering input makes Milo move immediately and visibly even at low speed", () => {
  const { view, motoRider } = fixture(true, true);
  view.setVehicle("moto");
  const driver = { x: 0, z: 0, yaw: 0, speed: 6 };
  const render = (steerInput) => view.updatePlayer({
    driver, fall: null, dt: 0.05, steerInput, brakePressed: false,
  });
  for (let i = 0; i < 8; i++) render(1);
  assert.ok(motoRider.body.position.x > 0.05);
  assert.ok(motoRider.body.rotation.z < -0.07);
  assert.ok(motoRider.helmet.rotation.y < -0.04);
  const firstArm = motoRider.arms[0].rotation.x;
  const secondArm = motoRider.arms[1].rotation.x;
  assert.ok(Math.abs(firstArm - secondArm) > 0.10);
  for (let i = 0; i < 16; i++) render(-1);
  assert.ok(motoRider.body.position.x < -0.05,
    "pilot visibly crosses to the other side");
  assert.ok(motoRider.helmet.rotation.y > 0.04);
  for (let i = 0; i < 25; i++) render(0);
  assert.ok(Math.abs(motoRider.body.position.x) < 0.003,
    "the pilot smoothly returns to center");
});

test("the moto chase camera frames the rider closer", () => {
  const { view, camera } = fixture();
  view.setVehicle("moto");
  view.updatePlayer({
    driver: { x: 0, z: 0, yaw: 0, speed: 0 },
    fall: null, dt: 0, brakePressed: false,
  });
  view.setView(true);
  view.updateCamera(0);
  assert.ok(camera.position.z < 8, "the rider is larger in the chase view");
  assert.ok(camera.position.y < 4, "camera stays above the motorcycle");
});
