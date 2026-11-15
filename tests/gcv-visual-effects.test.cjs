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
    this.needsUpdate = false;
  }
  setUsage(usage) { this.usage = usage; return this; }
}
class BufferGeometry {
  constructor() { this.attributes = {}; }
  setAttribute(name, attribute) { this.attributes[name] = attribute; }
}
class PointsMaterial {
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
  BufferAttribute, BufferGeometry, PointsMaterial, Points, Vector3,
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
  const effects = VisualEffects.create({ THREE, scene, car, opponentMeshes });
  const [mud, sparks] = scene.children;
  const visible = (object) => {
    const positions = object.geometry.attributes.position.array;
    let count = 0;
    for (let i = 1; i < positions.length; i += 3) {
      if (positions[i] > -1000) count++;
    }
    return count;
  };
  return { effects, scene, mud, sparks, visible, rival };
}

test("both particle systems remain batched, rendering and hidden initial state", () => {
  const { scene, mud, sparks, visible } = harness();
  assert.equal(scene.children.length, 2);
  assert.equal(mud.geometry.attributes.position.array.length, 512 * 3);
  assert.equal(sparks.geometry.attributes.position.array.length, 48 * 3);
  assert.equal(mud.material.size, 0.34);
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
  assert.ok(mud.geometry.attributes.color.array.some((value) => value > 0));
  effects.update(1, driver, 0, null);
  assert.equal(visible(mud), 0);
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
