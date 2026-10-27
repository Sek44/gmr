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
class PerspectiveCamera {
  constructor(fov, aspect, near, far) { Object.assign(this, { fov, aspect, near, far });
    this.position = new Vector(); latestCamera = this; }
  updateProjectionMatrix() { this.updated = true; }
  lookAt(v) { this.target = new Vector().copy(v); }
}

function fixture() {
  const window = { devicePixelRatio: 3, listeners: {},
    addEventListener(name, cb) { this.listeners[name] = cb; } };
  const stage = { clientWidth: 800, clientHeight: 400 };
  const sceneHost = { append(canvas) { this.canvas = canvas; } };
  const scene = {};
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
  const THREE = { WebGLRenderer, PerspectiveCamera, Vector3: Vector, SRGBColorSpace: "srgb" };
  const view = Rendering.create({ THREE, window, stage, sceneHost, scene, car,
    wheelPivots, brakeLights, rearBrakeGlows, opponentMeshes, curve,
    startIndex: 0, SAMPLE_COUNT: 100, trackLength: 1000 });
  return { view, window, stage, sceneHost, scene, car, wheelPivots,
    brakeLights, rearBrakeGlows, ai, renderer: latestRenderer, camera: latestCamera };
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
  const html = fs.readFileSync(path.join(folder, "index.html"), "utf8");
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
