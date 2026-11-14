"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const World3D = require("../games/gcv/world-3d.js");
const TrackLayout = require("../games/gcv/track-layout.js");
const Scenery = require("../games/gcv/scenery.js");

const directory = path.join(__dirname, "../games/gcv");

test("world is loaded before the GCV entry point", () => {
  const html = fs.readFileSync(path.join(directory, "index.html"), "utf8")
    .replace(/\?v=\d{8}[a-z]/g, "");
  const scenery = html.indexOf('<script defer src="./scenery.js"></script>');
  const layout = html.indexOf('<script defer src="./track-layout.js"></script>');
  const barriers = html.indexOf('<script defer src="./barriers.js"></script>');
  const world = html.indexOf('<script defer src="./world-3d.js"></script>');
  const game = html.indexOf('<script type="module" src="./game.js"></script>');
  assert.ok(scenery >= 0 && layout > scenery && barriers > layout);
  assert.ok(world > barriers && game > world);
  for (const file of ["world-3d.js", "game.js"]) {
    assert.doesNotThrow(() =>
      new vm.Script(fs.readFileSync(path.join(directory, file), "utf8")));
  }
});

test("world factory is exposed by the browser script", () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(directory, "world-3d.js"), "utf8"),
    sandbox, { filename: "world-3d.js" });
  assert.equal(typeof sandbox.window.GcvWorld3D.create, "function");
});

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  copy(v) { return this.set(v.x, v.y, v.z); }
  add(v) { return this.set(this.x + v.x, this.y + v.y, this.z + v.z); }
  multiplyScalar(n) { return this.set(this.x * n, this.y * n, this.z * n); }
  normalize() { return this.multiplyScalar(1 / (Math.hypot(this.x, this.y, this.z) || 1)); }
}
class Curve {
  constructor(points, closed = true) { this.points = points; this.closed = closed; }
  segment(t) {
    const n = this.points.length;
    const scaled = Math.max(0, Math.min(1, t)) * (this.closed ? n : n - 1);
    const index = this.closed ? Math.floor(scaled) % n :
      Math.min(n - 2, Math.floor(scaled));
    return { index, fraction: scaled - (this.closed ? Math.floor(scaled) : index) };
  }
  getPointAt(t) {
    const { index, fraction } = this.segment(t);
    const a = this.points[index], b = this.points[(index + 1) % this.points.length];
    return new Vector3(a.x + (b.x - a.x) * fraction, 0,
      a.z + (b.z - a.z) * fraction);
  }
  getTangentAt(t) {
    const { index } = this.segment(t);
    const a = this.points[index], b = this.points[(index + 1) % this.points.length];
    return new Vector3(b.x - a.x, 0, b.z - a.z).normalize();
  }
  getLength() {
    let length = 0;
    for (let i = 0; i < this.points.length - (this.closed ? 0 : 1); i++) {
      const a = this.points[i], b = this.points[(i + 1) % this.points.length];
      length += Math.hypot(b.x - a.x, b.z - a.z);
    }
    return length;
  }
}
class Node {
  constructor() {
    this.children = [];
    this.position = new Vector3();
    this.scale = new Vector3(1, 1, 1);
    this.rotation = { x: 0, y: 0, z: 0,
      set(x, y, z) { Object.assign(this, { x, y, z }); } };
    this.matrix = {};
  }
  add(...nodes) { this.children.push(...nodes); }
  updateMatrix() {
    this.matrix = {
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
      rotation: { x: this.rotation.x, y: this.rotation.y, z: this.rotation.z },
      scale: { x: this.scale.x, y: this.scale.y, z: this.scale.z },
    };
  }
}
class Mesh extends Node {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
}
class InstancedMesh extends Mesh {
  constructor(geometry, material, count) {
    super(geometry, material);
    this.count = count;
    this.instanceMatrix = { needsUpdate: false };
    this.instances = [];
  }
  setMatrixAt(i, matrix) { this.instances[i] = matrix; }
}
class Geometry {
  setAttribute(name, attr) { (this.attributes ||= {})[name] = attr; }
  setIndex(indices) { this.indices = indices; }
  computeVertexNormals() {}
}
class Material { constructor(options = {}) { Object.assign(this, options); } }
const THREE = {
  Vector3, CatmullRomCurve3: Curve, Scene: Node, Object3D: Node,
  HemisphereLight: Node, DirectionalLight: Node, Mesh, InstancedMesh,
  BoxGeometry: Geometry, PlaneGeometry: Geometry, CircleGeometry: Geometry,
  DodecahedronGeometry: Geometry, BufferGeometry: Geometry,
  Float32BufferAttribute: class { constructor(array) { this.array = array; } },
  MeshStandardMaterial: Material, MeshBasicMaterial: Material,
  Color: Material, Fog: Material, DoubleSide: 2, FrontSide: 0,
};

test("static world shares its track samples with barriers and gameplay", () => {
  let barrierArgs;
  const barriers = { rails: null };
  const Barriers = {
    create(positions, length, outer, normals, road) {
      barrierArgs = { positions, length, outer, normals, road };
      const rail = (sign) => ({
        points: positions.map((p, i) => ({
          x: p.x + normals[i].x * sign * (outer - 0.45),
          z: p.z + normals[i].z * sign * (outer - 0.45),
        })),
        skippedSamples: new Uint8Array(positions.length),
      });
      barriers.rails = { left: rail(1), right: rail(-1) };
      return barriers;
    },
  };
  const world = World3D.create({ THREE, TrackLayout, Barriers, Scenery });
  assert.equal(world.positions.length, TrackLayout.SAMPLE_COUNT + 1);
  assert.equal(world.directions.length, world.positions.length);
  assert.equal(world.sides.length, world.positions.length);
  assert.equal(world.ROAD_HALF_WIDTH, TrackLayout.ROAD_HALF_WIDTH);
  assert.equal(world.OUTER_HALF_WIDTH,
    TrackLayout.ROAD_HALF_WIDTH + TrackLayout.SHOULDER_WIDTH);
  assert.ok(world.trackLength > 0);
  assert.equal(barrierArgs.positions.length, TrackLayout.SAMPLE_COUNT);
  assert.equal(barrierArgs.length, world.trackLength);
  assert.equal(barrierArgs.outer, world.OUTER_HALF_WIDTH);
  assert.equal(barrierArgs.road, world.ROAD_HALF_WIDTH);
  assert.equal(world.barriers, barriers);
  assert.equal(world.startCenter, world.positions[world.startIndex]);
  assert.equal(world.startSide, world.sides[world.startIndex]);
  assert.ok(world.scene.children.length >= 35, "road, rails, water and decor created");
  assert.ok(world.scene.children.some((node) => node instanceof InstancedMesh),
    "decor uses instancing");
  assert.ok(Array.isArray(world.islands));
});

test("classic checkered line is batched into two instanced draws without altering tile positions", () => {
  const Barriers = require("../games/gcv/barriers.js");
  const world = World3D.create({ THREE, TrackLayout, Barriers, Scenery });
  const colors = [0x322b35, 0xf5ede6];
  const tiles = world.scene.children.filter((node) =>
    node instanceof InstancedMesh && colors.includes(node.material?.color));
  assert.equal(tiles.length, 2, "one instanced draw per checker color");
  assert.equal(tiles[0].geometry, tiles[1].geometry,
    "both checker colors share their small box geometry");
  const actualPositions = [];
  for (const tileGroup of tiles) {
    assert.equal(tileGroup.count, 12);
    assert.equal(tileGroup.instances.length, 12);
    assert.equal(tileGroup.instanceMatrix.needsUpdate, true);
    for (const matrix of tileGroup.instances) {
      assert.equal(matrix.position.y, world.startCenter.y + 0.14);
      assert.ok(Math.abs(matrix.rotation.y - world.startYaw) < 1e-9);
      actualPositions.push(matrix.position.x.toFixed(4) + "," +
        matrix.position.z.toFixed(4));
    }
  }
  assert.equal(new Set(actualPositions).size, 24,
    "all 24 tile locations remain distinct");
  const expected = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 12; col++) {
      const center = world.positions[world.startIndex];
      const direction = world.directions[world.startIndex];
      const side = world.sides[world.startIndex];
      const longitudinal = (row - 0.5) * 1.35;
      const lateral = (col - 5.5) * 1.47;
      expected.push((center.x + direction.x * longitudinal +
        side.x * lateral).toFixed(4) + "," +
        (center.z + direction.z * longitudinal +
        side.z * lateral).toFixed(4));
    }
  }
  assert.deepEqual(actualPositions.sort(), expected.sort());
});

test("rainbow start and finish remain differently colored and need only four instanced draws", () => {
  const Barriers = require("../games/gcv/barriers.js");
  const world = World3D.create({
    THREE, TrackLayout: TrackLayout.select("rainbow"), Barriers, Scenery,
  });
  const startColors = [0xf9d966, 0xd9e0ed];
  const finishColors = [0xf5ede6, 0x322b35];
  const tileMeshes = world.scene.children.filter((node) =>
    node instanceof InstancedMesh &&
    [...startColors, ...finishColors].includes(node.material?.color));
  assert.equal(tileMeshes.length, 4);
  assert.deepEqual(tileMeshes.map((node) => node.material.color).sort((a, b) => a - b),
    [...startColors, ...finishColors].sort((a, b) => a - b));
  assert.equal(tileMeshes.reduce((sum, node) => sum + node.count, 0), 48);
  assert.equal(new Set(tileMeshes.map((node) => node.geometry)).size, 1);
  const startCenter = world.positions[world.startIndex];
  const finishCenter = world.positions[world.finishIndex];
  for (const mesh of tileMeshes) {
    const center = startColors.includes(mesh.material.color) ? startCenter : finishCenter;
    assert.equal(mesh.count, 12);
    assert.ok(mesh.instances.every((instance) =>
      instance.position.y === center.y + 0.14));
  }
});

test("horizontal transparent mud and water use front-facing single passes", () => {
  const Barriers = require("../games/gcv/barriers.js");
  const world = World3D.create({ THREE, TrackLayout, Barriers, Scenery });
  const expected = new Map([
    [0x614a37, 0.42],
    [0x527d89, 0.77],
    [0xadd6e0, 0.23],
  ]);
  for (const [color, opacity] of expected) {
    const mesh = world.scene.children.find((item) =>
      item.material?.color === color && item instanceof InstancedMesh);
    assert.ok(mesh, "missing instanced transparent surface " + color.toString(16));
    assert.equal(mesh.material.transparent, true);
    assert.equal(mesh.material.opacity, opacity);
    assert.equal(mesh.material.side, THREE.FrontSide,
      "upward decal should not render its back face");
    assert.equal(mesh.material.depthWrite, false);
  }
  assert.equal(expected.size, 3);
});

test("rainbow world initializes with distinct, valid start and finish gates", () => {
  const Barriers = require("../games/gcv/barriers.js");
  const layout = TrackLayout.select("rainbow");
  const world = World3D.create({ THREE, TrackLayout: layout, Barriers, Scenery });
  assert.equal(world.closed, false);
  assert.ok(world.startIndex > 0, "start must not collapse to sample zero");
  assert.ok(world.finishIndex > world.startIndex,
    "finish must follow start on the open route");
  assert.ok(world.finishIndex < layout.SAMPLE_COUNT);
  const routeLength = (world.finishIndex - world.startIndex) *
    world.trackLength / layout.SAMPLE_COUNT;
  assert.ok(routeLength > 500 && Number.isFinite(routeLength));
  assert.equal(world.positions.length, layout.SAMPLE_COUNT + 1);
  assert.equal(world.barriers.rails.left.points.length, layout.SAMPLE_COUNT + 1);
  assert.ok(world.positions.some((point) => point.y > 14),
    "giant raised humps must be visibly taller than 14 metres");
  assert.ok(world.heightAt(0.73) >= 18,
    "the highest jump hill must reach 18 metres");
  const rainbowColors = [0xf05c78, 0xfca33a, 0xf4df4e, 0x7fd56d,
    0x37b6d5, 0x5e74df, 0xc879da];
  assert.equal(world.scene.children.filter((node) =>
    rainbowColors.includes(node.material?.color)).length, 7);
});

test("all local GCV scripts share one cache-busting release version", () => {
  const html = fs.readFileSync(path.join(directory, "index.html"), "utf8");
  const versions = [...html.matchAll(/src="\.\/[^"]+\.js\?v=([^"]+)"/g)]
    .map((match) => match[1]);
  // Keep the cache version consistent as game-specific modules are added.
  assert.ok(versions.length >= 20);
  assert.ok(html.includes("./adaptive-resolution.js?v="));
  assert.equal(new Set(versions).size, 1);
  assert.match(html, /game\.css\?v=\d{8}[a-z]/);
});
