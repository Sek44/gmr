"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const VisualEffects = require("../games/gcv/visual-effects.js");

const gameDirectory = path.join(__dirname, "../games/gcv");

test("visual effects are loaded before the game entry point", () => {
  const html = fs.readFileSync(path.join(gameDirectory, "index.html"), "utf8")
    .replace(/\?v=\d{8}[a-z]/g, "");
  const scripts = [...html.matchAll(/\["(?:script|module)", "\.\/([^"?]+\.js)(?:\?[^"]*)?"\]/g)]
    .map((match) => match[1]);
  const world = scripts.indexOf("world-3d.js");
  const effects = scripts.indexOf("visual-effects.js");
  const game = scripts.indexOf("game.js");
  assert.ok(world >= 0 && effects > world && game > effects);
  for (const file of ["visual-effects.js", "game.js"]) {
    assert.doesNotThrow(() =>
      new vm.Script(fs.readFileSync(path.join(gameDirectory, file), "utf8")));
  }
});

test("the browser exposes the visual effects factory", () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(gameDirectory, "visual-effects.js"), "utf8"),
    sandbox, { filename: "visual-effects.js" });
  assert.equal(typeof sandbox.window.GcvVisualEffects.create, "function");
});

class BufferAttribute {
  constructor(array, itemSize) {
    this.array = array;
    this.itemSize = itemSize;
    this._needsUpdate = false;
    this.uploads = 0;
  }
  setUsage(usage) { this.usage = usage; return this; }
  set needsUpdate(value) { this._needsUpdate = value; if (value) this.uploads++; }
  get needsUpdate() { return this._needsUpdate; }
}
class BufferGeometry {
  constructor() { this.attributes = {}; this.drawRange = { start: 0, count: Infinity }; }
  setAttribute(name, attribute) { this.attributes[name] = attribute; }
  setDrawRange(start, count) { this.drawRange = { start, count }; }
}
class PointsMaterial {
  constructor(config) { Object.assign(this, config); }
}
class ShaderMaterial {
  constructor(config) { Object.assign(this, config); }
}
class Points {
  constructor(geometry, material) {
    this.geometry = geometry;
    this.material = material;
    this.frustumCulled = true;
  }
}
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
}
const THREE = {
  BufferAttribute, BufferGeometry, PointsMaterial, ShaderMaterial, Points, Vector3,
  DynamicDrawUsage: "dynamic",
};
function harness() {
  const scene = { children: [], add(object) { this.children.push(object); } };
  const car = { localToWorld(point) { return point; } };
  const rival = {
    visible: true,
    position: { x: 6, y: 0.14, z: 12 },
    rotation: { y: 0.3 },
    userData: { opponentModel: "aero" },
    localToWorld(p) {
      return p.set(p.x + this.position.x, p.y + this.position.y,
        p.z + this.position.z);
    },
  };
  const opponentMeshes = new Map([[1, rival]]);
  const viewportCanvas = { height: 360 };
  const effects = VisualEffects.create({
    THREE, scene, car, opponentMeshes, viewportCanvas,
  });
  const [mud, sparks] = scene.children;
  const visible = (object) => {
    const positions = object.geometry.attributes.position.array;
    let count = 0;
    for (let i = 1; i < positions.length; i += 3) {
      if (positions[i] > -1000) count++;
    }
    return count;
  };
  return { effects, scene, mud, sparks, visible, rival, viewportCanvas };
}

test("both particle systems remain batched, rendering and hidden initial state", () => {
  const { scene, mud, sparks, visible } = harness();
  assert.equal(scene.children.length, 2);
  assert.equal(mud.geometry.attributes.position.array.length, 512 * 3);
  assert.equal(sparks.geometry.attributes.position.array.length, 48 * 3);
  assert.equal(mud.geometry.attributes.color.itemSize, 4);
  assert.equal(mud.geometry.attributes.particleSize.itemSize, 1);
  assert.equal(mud.geometry.attributes.particleSize.array.length, 512);
  assert.match(mud.material.vertexShader, /gl_PointSize/);
  assert.match(mud.material.fragmentShader, /gl_PointCoord/);
  assert.match(mud.material.fragmentShader, /smoothstep/);
  assert.equal(mud.material.transparent, true);
  assert.equal(mud.material.depthWrite, false);
  assert.equal(mud.material.uniforms.viewportHeight.value, 360);
  assert.equal(mud.geometry.drawRange.count, 0);
  assert.equal(sparks.material.size, 0.18);
  assert.equal(mud.frustumCulled, false);
  assert.equal(sparks.frustumCulled, false);
  assert.equal(visible(mud), 0);
  assert.equal(visible(sparks), 0);
});

test("mud appears only when skid intensity is nonzero and persists while animating", () => {
  const { effects, mud, sparks, visible } = harness();
  const driver = { yaw: 0.2, speed: 50 };
  effects.update(0.05, driver, 0, null);
  assert.equal(visible(mud), 0);
  effects.update(0.05, driver, 1.5, null); // Spawns after the position update.
  effects.update(0.05, driver, 0, null);
  assert.ok(visible(mud) > 0);
  assert.equal(visible(sparks), 0);
  assert.equal(mud.geometry.attributes.position.needsUpdate, true);
  assert.equal(mud.geometry.attributes.color.needsUpdate, true);
  assert.equal(mud.geometry.attributes.particleSize.needsUpdate, true);
  assert.ok(mud.geometry.drawRange.count > 0);
  assert.ok(mud.geometry.attributes.color.array.some((value) => value > 0));
  effects.update(1, driver, 0, null);
  assert.equal(visible(mud), 0);
  assert.equal(mud.geometry.drawRange.count, 0);
});

test("sparks need a moving barrier contact and disappear when their lifetime ends", () => {
  const { effects, mud, sparks, visible } = harness();
  const driver = { yaw: 0, speed: 20 };
  const contact = { x: 10, z: 20, nx: 0, nz: 1 };
  effects.update(0.2, { yaw: 0, speed: 4 }, 0, contact);
  assert.equal(visible(sparks), 0);
  effects.update(0.15, driver, 0, contact);
  effects.update(0.01, driver, 0, null);
  assert.ok(visible(sparks) > 0);
  assert.equal(visible(mud), 0);
  assert.equal(sparks.geometry.attributes.position.needsUpdate, true);
  assert.equal(sparks.geometry.attributes.color.needsUpdate, true);
  assert.ok(sparks.geometry.attributes.color.array.some((value) => value > 0));
  effects.update(1, driver, 0, null);
  assert.equal(visible(sparks), 0);
});

test("landing produces a single pale dust burst without extra draw calls", () => {
  const { effects, scene, mud, sparks, visible } = harness();
  const driver = { x: 12, z: 8, roadY: 1.1, yaw: 0, speed: 32 };
  effects.land(driver);
  effects.update(0.016, driver, 0, null);
  assert.equal(scene.children.length, 2);
  assert.equal(visible(mud), 20);
  assert.equal(visible(sparks), 0);
  assert.ok(mud.geometry.attributes.color.array.some((value) => value > 0.7));
  effects.update(1, driver, 0, null);
  assert.equal(visible(mud), 0);
  effects.update(0.016, driver, 0, null);
  assert.equal(visible(mud), 0, "no delayed or repeated dust");
});


test("rival drift uses the existing mud system without extra draw calls", () => {
  const { effects, scene, mud, sparks, visible, rival } = harness();
  const driver = { yaw: 0, speed: 55 };
  effects.update(0.1, driver, 0, null,
    [{ id: 1, skidIntensity: 1.1, jumpY: 0 }]);
  effects.update(0.016, driver, 0, null, []);
  assert.ok(visible(mud) > 0, "rival tyres should emit the same brown mud");
  assert.equal(visible(sparks), 0);
  assert.equal(scene.children.length, 2, "no GPU mesh per rival");
  assert.ok(mud.geometry.attributes.position.array.some((v) =>
    v >= rival.position.x - 2 && v <= rival.position.x + 2));
});

test("airborne and non-skidding rivals never emit tyre particles", () => {
  const { effects, mud, visible, rival } = harness();
  const driver = { yaw: 0, speed: 55 };
  effects.update(0.1, driver, 0, null,
    [{ id: 1, skidIntensity: 1.1, jumpY: 1.2 }]);
  effects.update(0.016, driver, 0, null, null);
  assert.equal(visible(mud), 0);
  effects.update(0.1, driver, 0, null,
    [{ id: 1, skidIntensity: 0, jumpY: 0 }]);
  assert.equal(visible(mud), 0);
  rival.visible = false;
  effects.update(0.1, driver, 0, null,
    [{ id: 1, skidIntensity: 1.1, jumpY: 0 }]);
  assert.equal(visible(mud), 0);
});

test("drift has differently sized translucent soft dust and hard grit in one batch", () => {
  const { effects, mud, viewportCanvas } = harness();
  const driver = { yaw: 0, speed: 65 };
  for (let i = 0; i < 10; i++) effects.update(0.05, driver, 1.5, null);
  const positions = mud.geometry.attributes.position.array;
  const sizes = mud.geometry.attributes.particleSize.array;
  const colors = mud.geometry.attributes.color.array;
  const live = [];
  for (let i = 0; i < 512; i++) if (positions[3 * i + 1] > -1000) live.push(i);
  assert.ok(live.length > 25);
  assert.ok(live.some((i) => sizes[i] > 0), "soft dust puffs");
  assert.ok(live.some((i) => sizes[i] < 0), "sharper gravel flecks");
  assert.ok(live.some((i) => colors[4 * i + 3] > 0 && colors[4 * i + 3] < 1),
    "per-particle fading alpha");
  viewportCanvas.height = 220; // Adaptive resolution or viewport resize.
  effects.update(0.016, driver, 0, null);
  assert.equal(mud.material.uniforms.viewportHeight.value, 220);
});

test("idle dust uses zero draw calls and skips unnecessary GPU uploads", () => {
  const { effects, mud } = harness();
  const driver = { yaw: 0, speed: 0 };
  const position = mud.geometry.attributes.position;
  effects.update(0.016, driver, 0, null);
  assert.equal(position.uploads, 0);
  assert.equal(mud.geometry.drawRange.count, 0);
  effects.update(0.05, driver, 1.5, null);
  assert.ok(position.uploads > 0);
  effects.update(2, driver, 0, null);
  assert.equal(mud.geometry.drawRange.count, 0);
  const uploads = position.uploads;
  effects.update(0.016, driver, 0, null);
  assert.equal(position.uploads, uploads);
});
