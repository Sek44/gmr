"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Vehicles = require("../games/gcv/vehicles.js");
const Race = require("../games/gcv/race.js");

const gameDirectory = path.join(__dirname, "../games/gcv");

test("GCV loads its vehicle module before the game entry point", () => {
  const html = fs.readFileSync(path.join(gameDirectory, "index.html"), "utf8")
    .replace(/\?v=20261111f/g, "");
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
class CanvasTexture {
  constructor(image) { this.image = image; }
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
  PlaneGeometry: Geometry, CanvasTexture,
  MeshBasicMaterial: Material, MeshStandardMaterial: Material,
  DoubleSide: 2, SRGBColorSpace: "srgb",
};

test("vehicle factory builds the player and nine hidden opponent models", () => {
  const scene = new SceneNode();
  const canvasLabels = [];
  const document = {
    createElement(tag) {
      assert.equal(tag, "canvas");
      const canvas = { labels: [] };
      const context = {
        fillRect() {}, beginPath() {}, arc() {}, stroke() {},
        moveTo() {}, lineTo() {},
        fillText(value) {
          canvas.labels.push(value);
          canvasLabels.push(value);
        },
      };
      canvas.getContext = () => context;
      return canvas;
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

  // Player #9 has the same five high-contrast number locations as the AI,
  // fitted to its taller roof and longer, different body geometry.
  const playerDecals = objects.car.children.filter((child) =>
    child.material?.map?.image?.labels.includes("9"));
  assert.equal(playerDecals.length, 5, "player #9 needs five visible decals");
  assert.equal(new Set(playerDecals.map((mesh) => mesh.material)).size, 1,
    "the player's five faces must share one racing-number texture");
  const roof = playerDecals.find((mesh) => mesh.position.y > 2);
  const bonnet = playerDecals.find((mesh) => mesh.position.z < -1);
  const rear = playerDecals.find((mesh) => mesh.position.z > 2);
  const left = playerDecals.find((mesh) => mesh.position.x < -1);
  const right = playerDecals.find((mesh) => mesh.position.x > 1);
  assert.ok(roof && roof.position.y > 2.025 && roof.rotation.x === -Math.PI / 2);
  assert.ok(bonnet && bonnet.position.y > 1.075 && bonnet.rotation.x === -Math.PI / 2);
  assert.ok(rear && rear.position.z > 2.06 && Math.abs(rear.position.x) < 0.01);
  assert.ok(left && left.position.x < -1.03 && left.rotation.y === -Math.PI / 2);
  assert.ok(right && right.position.x > 1.03 && right.rotation.y === Math.PI / 2);

  const aiNumbers = new Set();
  for (const [slot, group] of objects.opponentMeshes) {
    const number = String(Race.opponentNumber(slot));
    aiNumbers.add(Number(number));
    const decals = group.children.filter((child) =>
      child.material?.map?.image?.labels.includes(number));
    assert.equal(decals.length, 5, `AI #${number} needs five visible decals`);
    assert.equal(new Set(decals.map((mesh) => mesh.material)).size, 1,
      "the same texture material must be shared across all faces");
    assert.ok(decals.some((mesh) => mesh.position.y > 1.39), "roof decal");
    assert.ok(decals.some((mesh) => mesh.position.z < -1), "bonnet decal");
    assert.ok(decals.some((mesh) => mesh.position.z > 1.8), "rear decal");
    assert.ok(decals.some((mesh) => mesh.position.x < -0.98), "left-side decal");
    assert.ok(decals.some((mesh) => mesh.position.x > 0.98), "right-side decal");
  }
  assert.deepEqual([...aiNumbers].sort((a, b) => a - b),
    [1, 2, 3, 4, 5, 6, 7, 8, 10]);
  assert.equal(canvasLabels.filter((label) => /^[0-9]+$/.test(label)).length, 10,
    "one painted number per car, including the player's number 9");

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

test("all five vehicle/pilot pairs can be selected without creating a new scene", () => {
  assert.deepEqual(Vehicles.CHOICES.map((choice) => choice.id),
    ["classic", "moto", "kart", "buggy", "comet"]);
  assert.equal(Vehicles.normalize("unknown"), "classic");
  const draw = {
    fillRect() {}, fillText() {}, beginPath() {}, arc() {},
    stroke() {}, moveTo() {}, lineTo() {},
  };
  const document = {
    createElement: () => ({ getContext: () => draw }),
  };
  const scene = new SceneNode();
  const models = Vehicles.create({ THREE, scene, Race, trackLength: 1500, document });
  assert.equal(scene.children.length, 10);
  assert.equal(models.extraWheelPivots.length, 14);
  for (const id of Vehicles.CHOICES.map((choice) => choice.id)) {
    assert.equal(models.setVehicle(id), id);
    const activeModels = models.car.children.filter((child) =>
      child.visible && child.children && child.children.some((part) => part.geometry));
    assert.ok(activeModels.length >= 1, `a visible vehicle exists for ${id}`);
    models.setCameraMode(false);
    models.setCameraMode(true);
  }
  assert.equal(models.setVehicle("unknown"), "classic");
});

test("sport motorcycle has a crouched rider, full-face helmet and visible fairing", () => {
  const drawing = {
    fillRect() {}, fillText() {}, beginPath() {}, arc() {},
    stroke() {}, moveTo() {}, lineTo() {},
  };
  const document = { createElement: () => ({ getContext: () => drawing }) };
  const scene = new SceneNode();
  const models = Vehicles.create({ THREE, scene, Race, trackLength: 1500, document });
  models.setVehicle("moto");
  const bike = models.car.children.find((node) => node.visible &&
    node.children && node.children.length > 30);
  assert.ok(bike, "the active low-poly motorcycle has a detailed silhouette");
  assert.ok(bike.children.some((node) => node.material?.color === 0x17b5e5),
    "bright sport fairing");
  const { body, helmet, baseY } = models.motoRider;
  assert.ok(bike.children.includes(body), "the motorcycle rider has a separate hip joint");
  assert.equal(baseY, 1.32);
  assert.ok(body.children.length > 0, "torso, legs and head move with the hip");
  assert.ok(helmet.children.some((part) => part.material?.color === 0xffd239),
    "the full-face helmet remains independently articulated");
  assert.ok(body.children.some((child) => child.children.includes(helmet)),
    "the helmet is attached to the moving pilot, not the frame");
  assert.equal(models.motoRider.arms.length, 2,
    "both handlebars have separately articulated shoulder pivots");
  assert.ok(models.motoRider.arms.every((arm) =>
    arm.children.length === 1 && arm.children[0].children.length >= 3),
  "the arms follow the new pivots without adding new mesh geometry");
  models.setCameraMode(false);
  assert.equal(helmet.visible, false, "inside camera must not see the helmet");
  models.setCameraMode(true);
  assert.equal(helmet.visible, true);
});
