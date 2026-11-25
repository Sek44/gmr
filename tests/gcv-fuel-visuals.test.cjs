"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Visuals = require("../games/gcv/fuel-visuals.js");

function fixture() {
  const THREE = {
    Color: class {
      constructor(hex) {
        this.r = ((hex >> 16) & 255) / 255;
        this.g = ((hex >> 8) & 255) / 255;
        this.b = (hex & 255) / 255;
      }
      multiplyScalar(s) {
        this.r *= s;
        this.g *= s;
        this.b *= s;
        return this;
      }
    },
    BufferGeometry: class {
      attributes = {};
      setAttribute(name, value) { this.attributes[name] = value; }
      dispose() { this.disposed = true; }
    },
    Float32BufferAttribute: class {
      constructor(array, itemSize) {
        this.array = new Float32Array(array);
        this.count = array.length / itemSize;
      }
    },
    MeshBasicMaterial: class {
      constructor(options) { Object.assign(this, options); }
      dispose() { this.disposed = true; }
    },
    InstancedMesh: class {
      constructor(geometry, material, count) {
        Object.assign(this, { geometry, material, count });
        this.instanceMatrix = {};
        this.matrices = [];
        this.writes = 0;
      }
      setMatrixAt(i, matrix) { this.matrices[i] = matrix; this.writes++; }
    },
    Object3D: class {
      position = { set: (...v) => { this.xyz = v; } };
      scale = { setScalar: (v) => { this.size = v; } };
      updateMatrix() { this.matrix = { xyz: this.xyz, scale: this.size }; }
    },
  };
  const scene = {
    children: [],
    add(mesh) { this.children.push(mesh); },
    remove(mesh) { this.children = this.children.filter((v) => v !== mesh); },
  };
  const fuel = {
    version: 0,
    pickups: [
      { x: 2, y: 3, z: 4, collectedAt: null },
      { x: 5, y: 6, z: 7, collectedAt: 10 },
    ],
  };
  const visuals = Visuals.create({ THREE, scene, fuel });
  return { scene, fuel, visuals, mesh: scene.children[0] };
}

test("jerricans share one small opaque vertex-colored geometry", () => {
  const { scene, mesh } = fixture();
  assert.equal(scene.children.length, 1);
  assert.equal(mesh.count, 2);
  assert.equal(mesh.material.vertexColors, true);
  assert.equal(mesh.frustumCulled, false);
  const { position, color } = mesh.geometry.attributes;
  assert.equal(position.count, color.count);
  assert.equal(position.count % 3, 0);
  assert.ok(position.count / 3 <= 250);
  assert.ok(position.array.every(Number.isFinite));
  assert.ok(color.array.every((v) => v >= 0 && v <= 1));
  const ys = position.array.filter((_, i) => i % 3 === 1);
  assert.ok(Math.min(...ys) >= 0.14 && Math.max(...ys) <= 2.64);
});

test("jerrican instance matrices update only on fuel changes; disposal frees the batch", () => {
  const { scene, fuel, visuals, mesh } = fixture();
  assert.deepEqual(mesh.matrices[0], { xyz: [2, 3, 4], scale: 1 });
  assert.equal(mesh.matrices[1].scale, 0);
  assert.equal(mesh.writes, 2);
  visuals.sync();
  assert.equal(mesh.writes, 2);
  fuel.pickups[0].collectedAt = 20;
  fuel.pickups[1].collectedAt = null;
  fuel.version++;
  visuals.sync();
  assert.deepEqual(mesh.matrices.map((m) => m.scale), [0, 1]);
  assert.equal(mesh.writes, 4);
  assert.equal(mesh.instanceMatrix.needsUpdate, true);
  visuals.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(mesh.geometry.disposed, true);
  assert.equal(mesh.material.disposed, true);
});
