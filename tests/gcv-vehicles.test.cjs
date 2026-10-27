"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Vehicles = require("../games/gcv/vehicles.js");

const gameDirectory = path.join(__dirname, "../games/gcv");

test("GCV loads its vehicle module before the game entry point", () => {
  const html = fs.readFileSync(path.join(gameDirectory, "index.html"), "utf8");
  const race = html.indexOf('<script defer src="./race.js"></script>');
  const vehicles = html.indexOf('<script defer src="./vehicles.js"></script>');
  const game = html.indexOf('<script type="module" src="./game.js"></script>');
  assert.ok(race >= 0 && vehicles > race && game > vehicles);

  for (const name of ["race.js", "vehicles.js", "game.js"]) {
    assert.doesNotThrow(() =>
      new vm.Script(fs.readFileSync(path.join(gameDirectory, name), "utf8")),
    "the browser entry point and its dependencies must parse");
  }
});

test("vehicle factory is available from a classic browser script", () => {
  const sandbox = { window: {} };
  const source = fs.readFileSync(path.join(gameDirectory, "vehicles.js"), "utf8");
  vm.runInNewContext(source, sandbox, { filename: "vehicles.js" });
  assert.equal(typeof sandbox.window.GcvVehicles.create, "function");
});

class Vector {
  constructor(x = 0, y = 0, z = 0) {
    this.set(x, y, z);
  }
  set(x, y, z) {
    Object.assign(this, { x, y, z });
    return this;
  }
  copy(other) {
    return this.set(other.x, other.y, other.z);
  }
  clone() {
    return new Vector(this.x, this.y, this.z);
  }
  sub(other) {
    return this.set(this.x - other.x, this.y - other.y, this.z - other.z);
  }
  add(other) {
    return this.set(this.x + other.x, this.y + other.y, this.z + other.z);
  }
  multiplyScalar(value) {
    return this.set(this.x * value, this.y * value, this.z * value);
  }
  length() {
    return Math.hypot(this.x, this.y, this.z);
  }
  normalize() {
    return this.multiplyScalar(1 / (this.length() || 1));
  }
}

class SceneNode {
  constructor() {
    this.children = [];
    this.position = new Vector();
    this.scale = new Vector(1, 1, 1);
    this.rotation = { set() {} };
    this.quaternion = { setFromUnitVectors() {} };
    this.visible = true;
  }
  add(...nodes) {
    this.children.push(...nodes);
  }
}
class Mesh extends SceneNode {
  constructor(geometry, material) {
    super();
    this.geometry = geometry;
    this.material = material;
  }
}
class Geometry {
  setAttribute() {}
  computeVertexNormals() {}
}
class Material {
  constructor(properties = {}) {
    Object.assign(this, properties);
  }
}
class Light extends SceneNode {
  constructor(color, intensity) {
    super();
    this.intensity = intensity;
  }
}

const THREE = {
  Group: SceneNode, Mesh, PointLight: Light, Vector3: Vector,
  BoxGeometry: Geometry, CylinderGeometry: Geometry, BufferGeometry: Geometry,
  Float32BufferAttribute: Geometry, TorusGeometry: Geometry,
  PlaneGeometry: Geometry, CanvasTexture: Geometry,
  MeshBasicMaterial: Material, MeshStandardMaterial: Material,
  DoubleSide: 2, SRGBColorSpace: "srgb",
};

test("vehicle factory builds the player and nine hidden opponent models", () => {
  const scene = new SceneNode();
  const canvasLabels = [];
  const canvasContext = {
    fillRect() {}, beginPath() {}, arc() {}, stroke() {},
    moveTo() {}, lineTo() {}, fillText(text) { canvasLabels.push(text); },
  };
  const document = {
    createElement(tag) {
      assert.equal(tag, "canvas");
      return { getContext: () => canvasContext };
    },
  };
  const Race = {
    GRID_COUNT: 10,
    PLAYER_SLOT: 4,
    create(trackLength) {
      assert.equal(trackLength, 1500);
      return {
        opponents: Array.from({ length: 10 }, (_, id) => ({
          id, color: id * 111,
        })).filter((ai) => ai.id !== this.PLAYER_SLOT),
      };
    },
  };

  const objects = Vehicles.create({ THREE, scene, Race, trackLength: 1500, document });
  assert.equal(scene.children.length, 10);
  assert.ok(scene.children.includes(objects.car));
  assert.equal(objects.wheelPivots.length, 4);
  assert.equal(objects.rearBrakeGlows.length, 2);
  assert.equal(objects.brakeLights.emissiveIntensity, 0.15);
  assert.equal(objects.opponentMeshes.size, 9);
  assert.equal(objects.opponentMeshes.has(Race.PLAYER_SLOT), false);
  assert.ok([...objects.opponentMeshes.values()].every((mesh) =>
    mesh.visible === false && scene.children.includes(mesh)));
  assert.ok(canvasLabels.includes("9"));
  assert.ok(canvasLabels.includes("GCV  09"));

  // Regression: cockpit scene groups were moved to vehicles.js, but
  // refreshCameraButton() was still accessing them as game.js locals.
  const cabin = objects.car.children.find((group) =>
    group.children.some((mesh) => mesh.geometry));
  const dashboard = objects.car.children.find((group) =>
    group.position.y === -0.16);
  assert.ok(cabin);
  assert.ok(dashboard);
  assert.equal(typeof objects.setCameraMode, "function");
  objects.setCameraMode(true);
  assert.equal(cabin.visible, true);
  assert.equal(dashboard.visible, false);
  objects.setCameraMode(false);
  assert.equal(cabin.visible, true);
  assert.equal(dashboard.visible, true);
});

test("camera button uses the exported vehicle API, not undefined scene groups", () => {
  const game = fs.readFileSync(path.join(gameDirectory, "game.js"), "utf8");
  assert.match(game, /setCameraMode\(outside\)/);
  assert.doesNotMatch(game, /\b(?:cabin|dashboard)\.visible\b/);
});
