"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const VisualEffects = require("../games/gcv/visual-effects.js");

const gameDirectory = path.join(__dirname, "../games/gcv");

test("visual effects are loaded before the game entry point", () => {
  const html = fs.readFileSync(path.join(gameDirectory, "index.html"), "utf8");
  const world = html.indexOf('<script defer src="./world-3d.js"></script>');
  const effects = html.indexOf('<script defer src="./visual-effects.js"></script>');
  const game = html.indexOf('<script type="module" src="./game.js"></script>');
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
  constructor(x, y, z) { Object.assign(this, { x, y, z }); }
}
const THREE = {
  BufferAttribute, BufferGeometry, PointsMaterial, Points, Vector3,
  DynamicDrawUsage: "dynamic",
};
function harness() {
  const scene = { children: [], add(object) { this.children.push(object); } };
  const car = { localToWorld(point) { return point; } };
  const effects = VisualEffects.create({ THREE, scene, car });
  const [mud, sparks] = scene.children;
  const visible = (object) => {
    const positions = object.geometry.attributes.position.array;
    let count = 0;
    for (let i = 1; i < positions.length; i += 3) {
      if (positions[i] > -1000) count++;
    }
    return count;
  };
  return { effects, scene, mud, sparks, visible };
}

test("both particle systems have their original capacity, rendering and hidden initial state", () => {
  const { scene, mud, sparks, visible } = harness();
  assert.equal(scene.children.length, 2);
  assert.equal(mud.geometry.attributes.position.array.length, 240 * 3);
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
