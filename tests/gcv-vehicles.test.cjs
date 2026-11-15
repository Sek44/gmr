"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Vehicles = require("../games/gcv/vehicles.js");
const OpponentVehicles = require("../games/gcv/opponent-vehicles.js");
const Race = require("../games/gcv/race.js");

const gameDirectory = path.join(__dirname, "../games/gcv");

test("GCV loads its vehicle module before the game entry point", () => {
  const html = fs.readFileSync(path.join(gameDirectory, "index.html"), "utf8")
    .replace(/\?v=[\w-]+/g, "");
  const race = html.indexOf("./race.js");
  const opponentVehicles = html.indexOf("./opponent-vehicles.js");
  const vehicles = html.indexOf("./vehicles.js");
  const game = html.indexOf("./game.js");
  assert.ok(race >= 0 && opponentVehicles > race &&
    vehicles > opponentVehicles && game > vehicles);

  for (const name of ["race.js", "opponent-vehicles.js",
    "vehicles.js", "game.js"]) {
    assert.doesNotThrow(() =>
      new vm.Script(fs.readFileSync(path.join(gameDirectory, name), "utf8")),
    "the browser entry point and its dependencies must parse");
  }
});

test("vehicle factory is available from a classic browser script", () => {
  const sandbox = { window: {} };
  for (const name of ["opponent-vehicles.js", "vehicles.js"]) {
    vm.runInNewContext(fs.readFileSync(path.join(gameDirectory, name), "utf8"),
      sandbox, { filename: name });
  }
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

class Matrix4 {
  constructor() {
    this.position = { x: 0, y: 0, z: 0 };
    this.scale = { x: 1, y: 1, z: 1 };
  }
  clone() {
    const result = new Matrix4();
    result.position = { ...this.position };
    result.scale = { ...this.scale };
    return result;
  }
  multiplyMatrices(a, b) {
    const position = {
      x: a.position.x + b.position.x * a.scale.x,
      y: a.position.y + b.position.y * a.scale.y,
      z: a.position.z + b.position.z * a.scale.z,
    };
    this.scale = { x: a.scale.x * b.scale.x,
      y: a.scale.y * b.scale.y, z: a.scale.z * b.scale.z };
    this.position = position;
    return this;
  }
  multiply(other) { return this.multiplyMatrices(this.clone(), other); }
  makeScale(x, y, z) {
    this.scale = { x, y, z };
    return this;
  }
}
class Color {
  constructor(hex) { this.hex = hex; }
  lerp(other, ratio) {
    const channel = (shift) => Math.round(
      ((this.hex >> shift) & 255) * (1 - ratio) +
      ((other.hex >> shift) & 255) * ratio);
    this.hex = (channel(16) << 16) | (channel(8) << 8) | channel(0);
    return this;
  }
}
class SceneNode {
  constructor() {
    this.children = [];
    this.userData = {};
    this.position = new Vector();
    this.scale = new Vector(1, 1, 1);
    this.rotation = { x: 0, y: 0, z: 0,
      set(x, y, z) { Object.assign(this, { x, y, z }); } };
    this.quaternion = { setFromUnitVectors() {}, setFromEuler() {} };
    this.matrix = {};
    this.visible = true;
  }
  add(...nodes) {
    for (const node of nodes) {
      if (node.parent) {
        const prior = node.parent.children.indexOf(node);
        if (prior >= 0) node.parent.children.splice(prior, 1);
      }
      node.parent = this;
      this.children.push(node);
    }
  }
  updateMatrix() {
    this.matrix = new Matrix4();
    this.matrix.position = { x: this.position.x, y: this.position.y,
      z: this.position.z };
    this.matrix.scale = { x: this.scale.x, y: this.scale.y, z: this.scale.z };
  }
}
class Mesh extends SceneNode {
  constructor(geometry, material) {
    super();
    this.geometry = geometry;
    this.material = material;
  }
}
class InstancedMesh extends Mesh {
  constructor(geometry, material, count) {
    super(geometry, material);
    this.count = count;
    this.instances = [];
    this.instanceMatrix = { needsUpdate: false };
    this.instanceColor = { needsUpdate: false };
    this.instanceColors = [];
  }
  setColorAt(index, color) { this.instanceColors[index] = color.hex; }
  setMatrixAt(index, matrix) {
    this.instances[index] = JSON.parse(JSON.stringify(matrix));
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
  Group: SceneNode, Object3D: SceneNode, Mesh, InstancedMesh,
  PointLight: Light, Vector3: Vector, Matrix4, Color,
  BoxGeometry: Geometry, SphereGeometry: Geometry,
  CylinderGeometry: Geometry, BufferGeometry: Geometry,
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
  assert.ok(scene.children.length > 10, "instanced batches accompany the pose handles");
  assert.ok(scene.children.includes(objects.car));
  assert.deepEqual(objects.car.children, [objects.visualBody],
    "only the graphics pivot is beneath the physical vehicle transform");
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
  const playerDecals = objects.visualBody.children.filter((child) =>
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

  const expected = Race.create(1500, () => 0.5).opponents;
  assert.equal(new Set(expected.map((ai) => ai.color)).size, 9,
    "all nine opponents must have different permanent paint colors");
  assert.deepEqual([...objects.opponentMeshes.keys()],
    expected.map((ai) => ai.id));
  assert.deepEqual(new Set([...objects.opponentMeshes.values()].map((group) =>
    group.userData.opponentModel)), new Set(OpponentVehicles.MODELS));
  for (const ai of expected) {
    const group = objects.opponentMeshes.get(ai.id);
    assert.equal(group.userData.opponentModel, OpponentVehicles.ASSIGNMENTS[ai.id]);
    assert.equal(group.userData.color, ai.color);
    assert.equal(group.userData.numberCount, 5, "five racing number locations");
    assert.equal(group.userData.aiWheels.length,
      group.userData.opponentModel === "bike" ? 2 : 4);
    assert.equal(group.children.length, 0,
      "all visible rival parts live in common GPU batches");
  }
  const batches = scene.children.filter((child) => child instanceof InstancedMesh);
  assert.ok(batches.length >= 10 && batches.length <= 16,
    "the number of rival draw calls stays small and fixed");
  assert.ok(batches.every((batch) => batch.count === 0 &&
    batch.frustumCulled === false), "free mode has no visible rival batches");
  assert.ok(batches.some((batch) => batch.instanceColors.length >= 9 &&
    new Set(batch.instanceColors).size > 1),
  "per-instance body paints share one draw call");
  assert.equal(canvasLabels.filter((label) => /^[0-9]+$/.test(label)).length, 1,
    "the AI use instanced numeral geometry, not nine canvas textures");

  objects.syncOpponentModels();
  assert.ok(batches.every((batch) => batch.count === 0));
  const first = objects.opponentMeshes.get(expected[0].id);
  const second = objects.opponentMeshes.get(expected[1].id);
  first.visible = true;
  second.visible = true;
  first.position.set(123, 1.5, 200);
  second.position.set(142, 1.5, 200);
  first.userData.aiWheels[0].rotation.y = 1.4;
  objects.syncOpponentModels();
  assert.ok(batches.every((batch) =>
    batch.count > 0 && batch.instanceMatrix.needsUpdate));
  assert.ok(batches.some((batch) =>
    batch.instances.some((matrix) => matrix.position.x >= 123)),
  "rival instance transforms follow their independently positioned handles");
  assert.ok(batches.some((batch) =>
    batch.instances.some((matrix) => matrix.scale.x === 0)),
  "absent opponents have hidden transforms without changing fixed indices");
  first.visible = false;
  second.visible = false;
  objects.syncOpponentModels();
  assert.ok(batches.every((batch) => batch.count === 0));

  // Regression: cockpit scene groups were moved to vehicles.js, but
  // refreshCameraButton() was still accessing them as game.js locals.
  const cabin = objects.visualBody.children.find((group) =>
    group.children.some((mesh) => mesh.geometry));
  const dashboard = objects.visualBody.children.find((group) =>
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
  assert.ok(scene.children.length > 10,
    "AI pose handles and pooled instanced geometry belong to the same scene");
  assert.equal(models.extraWheelPivots.length, 14);
  for (const id of Vehicles.CHOICES.map((choice) => choice.id)) {
    assert.equal(models.setVehicle(id), id);
    const activeModels = models.visualBody.children.filter((child) =>
      child.visible && child.children && child.children.some((part) => part.geometry));
    assert.ok(activeModels.length >= 1, `a visible vehicle exists for ${id}`);
    models.setCameraMode(false);
    models.setCameraMode(true);
  }
  assert.equal(models.setVehicle("unknown"), "classic");
});

test("motorcycle wheel spokes and rims are instanced under their spinning pivots", () => {
  const document = { createElement: () => ({ getContext: () => ({
    fillRect() {}, fillText() {}, beginPath() {}, arc() {},
    stroke() {}, moveTo() {}, lineTo() {},
  }) }) };
  const scene = new SceneNode();
  const objects = Vehicles.create({ THREE, scene, Race,
    trackLength: 1500, document });
  const [front, rear] = objects.extraWheelPivots.slice(0, 2);
  assert.ok(front && rear);
  assert.equal(front.position.z, -1.48);
  assert.equal(rear.position.z, 1.35);
  for (const pivot of [front, rear]) {
    assert.equal(pivot.children.length, 5,
      "tyre + two instanced alloys + hub + brake");
    const instanced = pivot.children.filter((mesh) =>
      mesh instanceof InstancedMesh);
    assert.deepEqual(instanced.map((mesh) => mesh.count), [2, 10],
      "each wheel retains both rim sides and all ten visible spokes");
    assert.ok(instanced.every((mesh) =>
      mesh.instanceMatrix.needsUpdate && mesh.instances.length === mesh.count));
    const [rims, spokes] = instanced;
    assert.deepEqual(rims.instances.map((m) => m.position.x), [-0.095, 0.095]);
    assert.equal(spokes.instances.filter((m) => m.position.x < 0).length, 5);
    assert.equal(spokes.instances.filter((m) => m.position.x > 0).length, 5);
    assert.equal(pivot.children[0].rotation.y, Math.PI / 2, "tyre still faces sideways");
    assert.equal(pivot.children[4].position.x, -0.145,
      "brake ring remains on its original side");
  }
  for (let i = 0; i < 5; i++) {
    assert.equal(front.children[i].geometry, rear.children[i].geometry,
      "front/rear share identical rigid geometry and render materials");
    assert.equal(front.children[i].material, rear.children[i].material);
  }
  assert.equal(front.visible, true);
  objects.setVehicle("moto");
  assert.equal(objects.extraWheelPivots.length, 14,
    "all other wheel pivots remain independent and animated");
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
  const bike = models.visualBody.children.find((node) => node.visible &&
    node.children && node.children.length > 30);
  assert.ok(bike, "the active low-poly motorcycle has a detailed silhouette");
  assert.ok(bike.children.some((node) => node.material?.color === 0xd9112f),
    "red supersport fairing");
  const windscreen = bike.children.find((node) =>
    node.material?.transparent && node.material.opacity === 0.68);
  assert.ok(windscreen, "motorcycle retains the translucent screen");
  assert.equal(windscreen.material.side, THREE.DoubleSide,
    "windscreen must stay visible from both camera positions");
  assert.equal(windscreen.material.forceSinglePass, true,
    "single thin window does not need two transparent draw passes");
  const { body, helmet, baseY } = models.motoRider;
  assert.ok(bike.children.includes(body), "the motorcycle rider has a separate hip joint");
  assert.equal(baseY, 1.32);
  assert.ok(body.children.length > 0, "torso, legs and head move with the hip");
  assert.ok(helmet.children.some((part) => part.material?.color === 0xd9112f),
    "the red full-face helmet remains independently articulated");
  assert.ok(body.children.some((child) => child.children.includes(helmet)),
    "the helmet is attached to the moving pilot, not the frame");
  assert.equal(models.motoRider.arms.length, 2,
    "both handlebars have separately articulated shoulder pivots");
  assert.ok(models.motoRider.arms.every((arm) =>
    arm.children.length === 1 && arm.children[0].children.length >= 3),
  "the arms follow the new pivots without adding new mesh geometry");
  models.setCameraMode(false);
  assert.equal(body.visible, false, "cockpit hides the entire motorcycle pilot");
  assert.equal(helmet.visible, false, "inside camera must not see the helmet");
  assert.equal(bike.visible, true, "motorcycle stays visible in cockpit");
  assert.equal(windscreen.visible, true, "the fairing and screen remain visible");
  models.setCameraMode(true);
  assert.equal(body.visible, true, "chase camera restores the rider");
  assert.equal(helmet.visible, true);

  // Camera selection survives changing vehicle types while in cockpit view.
  models.setVehicle("kart");
  models.setCameraMode(false);
  models.setVehicle("moto");
  assert.equal(body.visible, false, "selecting motorcycle in cockpit still hides the rider");
  models.setCameraMode(true);
  assert.equal(body.visible, true);
});
