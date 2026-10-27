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
  const html = fs.readFileSync(path.join(directory, "index.html"), "utf8");
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
  constructor(points) { this.points = points; }
  getPointAt(t) {
    const n = this.points.length, position = t * n;
    const i = Math.floor(position) % n, f = position - Math.floor(position);
    const a = this.points[i], b = this.points[(i + 1) % n];
    return new Vector3(a.x + (b.x - a.x) * f, 0, a.z + (b.z - a.z) * f);
  }
  getTangentAt(t) {
    const n = this.points.length, i = Math.floor(t * n) % n;
    const a = this.points[i], b = this.points[(i + 1) % n];
    return new Vector3(b.x - a.x, 0, b.z - a.z).normalize();
  }
  getLength() {
    return this.points.reduce((sum, p, i) => {
      const q = this.points[(i + 1) % this.points.length];
      return sum + Math.hypot(q.x - p.x, q.z - p.z);
    }, 0);
  }
}
class Node {
  constructor() {
    this.children = [];
    this.position = new Vector3();
    this.scale = new Vector3(1, 1, 1);
    this.rotation = { set() {}, y: 0, x: 0 };
    this.matrix = {};
  }
  add(...nodes) { this.children.push(...nodes); }
  updateMatrix() { this.matrix = {}; }
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
  Color: Material, Fog: Material, DoubleSide: 2,
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
