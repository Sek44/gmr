"use strict";

// Procedural, low-poly AI vehicles. All visible parts of all nine rivals are
// combined into a small set of InstancedMesh batches (shape + surface), with
// per-instance paint. No imported assets, per-rival material or draw calls.
(function (root) {
  const MODELS = Object.freeze(["aero", "kart", "buggy", "bike"]);
  // Grid slots, not finishing rank or randomized speed: identities persist.
  const ASSIGNMENTS = Object.freeze([
    "aero", "buggy", "kart", "bike", null,
    "aero", "kart", "buggy", "bike", "aero",
  ]);
  const SEGMENTS = Object.freeze({
    "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd",
    "4": "fgbc", "5": "afgcd", "6": "afgecd", "7": "abc",
    "8": "abcdefg", "9": "abcdfg",
  });

  function create({ THREE, scene, Race, trackLength }) {
    const rivalColors = new Map(Race.create(trackLength, () => 0.5).opponents
      .map((ai) => [ai.id, ai.color]));
    const vehicles = new Map();
    const parts = new Map();
    const geometries = {
      box: new THREE.BoxGeometry(1, 1, 1),
      sphere: new THREE.SphereGeometry(1, 10, 7),
      cylinder: new THREE.CylinderGeometry(1, 1, 1, 10),
    };
    const finishes = {
      body: { color: 0xffffff, roughness: 0.48, metalness: 0.14 },
      accent: { color: 0xffffff, roughness: 0.45, metalness: 0.16 },
      frame: { color: 0x202b35, roughness: 0.76 },
      glass: { color: 0x203e55, roughness: 0.27, metalness: 0.18 },
      helmet: { color: 0xffffff, roughness: 0.45 },
      visor: { color: 0x152637, roughness: 0.29 },
      skin: { color: 0xe5ad86, roughness: 0.87 },
      tyre: { color: 0x121820, roughness: 0.98 },
      rim: { color: 0xaabdc8, metalness: 0.42, roughness: 0.48 },
      lamp: { color: 0xf2eac2, emissive: 0xa8b7a0, emissiveIntensity: 0.25 },
      number: { color: 0x162633, roughness: 0.8 },
      ink: { color: 0xffffff, roughness: 0.88 },
    };
    function transform(x, y, z, w, h, d, rx = 0, ry = 0, rz = 0) {
      const object = new THREE.Object3D();
      object.position.set(x, y, z);
      object.rotation.set(rx, ry, rz);
      object.scale.set(w, h, d);
      object.updateMatrix();
      return object.matrix.clone();
    }
    function add(slot, surface, shape, x, y, z, w, h, d, rx = 0, ry = 0,
      rz = 0, wheel = null, local = null) {
      const key = surface + ":" + shape;
      if (!parts.has(key)) parts.set(key, []);
      parts.get(key).push({
        slot, surface, shape, wheel,
        local: local || transform(x, y, z, w, h, d, rx, ry, rz),
      });
    }
    const box = (slot, surface, x, y, z, w, h, d, rx = 0, ry = 0, rz = 0) =>
      add(slot, surface, "box", x, y, z, w, h, d, rx, ry, rz);
    const ball = (slot, surface, x, y, z, w, h, d) =>
      add(slot, surface, "sphere", x, y, z, w, h, d);

    function wheel(slot, x, z, radius = 0.44, width = 0.30) {
      const pivot = new THREE.Object3D();
      pivot.position.set(x, radius, z);
      pivot.rotation.order = "ZYX";
      pivot.rotation.z = Math.PI / 2;
      vehicles.get(slot).userData.aiWheels.push(pivot);
      add(slot, "tyre", "cylinder", 0, 0, 0, radius, width, radius,
        0, 0, 0, pivot);
      add(slot, "rim", "cylinder", 0, 0, 0, radius * 0.56, width + 0.04,
        radius * 0.56, 0, 0, 0, pivot);
    }
    function fourWheels(slot, x, z, radius, width = 0.30) {
      for (const sign of [-1, 1])
        for (const axle of [-z, z]) wheel(slot, sign * x, axle, radius, width);
    }

    // High-contrast, five-position racing numbers share two instanced batches
    // rather than nine number textures and 45 independently drawn decals.
    // Seven-segment glyphs are cheap geometry and include the two-digit #10.
    function badge(slot, value, x, y, z, rx, ry, width = 0.80, height = 0.40) {
      const base = transform(x, y, z, 1, 1, 1, rx, ry);
      function element(surface, cx, cy, w, h, depth = 0.03) {
        const local = base.clone().multiply(transform(cx, cy, 0.017, w, h, depth));
        add(slot, surface, "box", 0, 0, 0, 1, 1, 1, 0, 0, 0, null, local);
      }
      element("number", 0, 0, width, height, 0.026);
      const digits = String(value).split("");
      const digitWidth = Math.min(0.30, (width - 0.11) / digits.length - 0.04);
      const digitHeight = height * 0.64;
      const stroke = Math.min(0.052, digitWidth * 0.18);
      const dx = digitWidth * 0.40, dy = digitHeight * 0.40;
      const horizontal = { a: [0, dy * 2, digitWidth * 0.76, stroke],
        g: [0, 0, digitWidth * 0.76, stroke],
        d: [0, -dy * 2, digitWidth * 0.76, stroke] };
      const vertical = { f: [-dx, dy, stroke, digitHeight * 0.43],
        b: [dx, dy, stroke, digitHeight * 0.43],
        e: [-dx, -dy, stroke, digitHeight * 0.43],
        c: [dx, -dy, stroke, digitHeight * 0.43] };
      const spacing = digitWidth + 0.07;
      digits.forEach((digit, i) => {
        const center = (i - (digits.length - 1) / 2) * spacing;
        for (const code of SEGMENTS[digit]) {
          const [a, b, w, h] = horizontal[code] || vertical[code];
          element("ink", center + a, b, w, h, 0.016);
        }
      });
      vehicles.get(slot).userData.numberCount++;
    }
    function numbers(slot, num, dims) {
      const { front, rear, left, right, top, width = 0.74 } = dims;
      badge(slot, num, 0, front[0], front[1], 0, Math.PI, width);
      badge(slot, num, 0, rear[0], rear[1], 0, 0, width);
      badge(slot, num, -left[0], left[1], left[2], 0, -Math.PI / 2, width);
      badge(slot, num, right[0], right[1], right[2], 0, Math.PI / 2, width);
      badge(slot, num, 0, top[0], top[1], -Math.PI / 2, 0, width);
    }

    function buildAero(slot) {
      box(slot, "frame", 0, 0.48, 0, 1.86, 0.20, 3.72);
      box(slot, "body", 0, 0.76, 0, 2.05, 0.44, 3.58);
      ball(slot, "body", 0, 0.99, -1.05, 0.91, 0.18, 0.79);
      box(slot, "glass", 0, 1.29, 0.28, 1.54, 0.54, 1.48);
      box(slot, "accent", 0, 1.60, 0.22, 1.42, 0.12, 1.19);
      box(slot, "accent", 0, 0.73, 1.70, 2.18, 0.16, 0.25);
      box(slot, "frame", 0, 0.91, 1.70, 0.11, 0.27, 0.13);
      for (const s of [-1, 1]) {
        box(slot, "accent", s * 0.82, 0.78, 0.2, 0.20, 0.22, 2.0);
        box(slot, "lamp", s * 0.74, 0.92, -1.80, 0.34, 0.13, 0.06);
      }
      fourWheels(slot, 1.05, 1.17, 0.45);
      numbers(slot, Race.opponentNumber(slot), {
        front: [0.77, -1.805], rear: [0.74, 1.805],
        left: [1.03, 0.80, 0.20], right: [1.03, 0.80, 0.20],
        top: [1.67, 0.25],
      });
    }

    function buildKart(slot) {
      box(slot, "frame", 0, 0.37, 0, 1.95, 0.23, 2.70);
      box(slot, "body", 0, 0.57, 0, 2.04, 0.24, 2.64);
      ball(slot, "body", 0, 0.79, -0.82, 0.88, 0.27, 0.66);
      box(slot, "accent", 0, 0.57, -1.37, 2.27, 0.16, 0.22);
      box(slot, "accent", 0, 0.54, 1.31, 2.22, 0.16, 0.22);
      box(slot, "frame", 0, 0.86, 0.43, 1.13, 0.26, 0.82);
      box(slot, "accent", 0, 1.26, 0.36, 0.61, 0.64, 0.44);
      ball(slot, "helmet", 0, 1.76, 0.28, 0.39, 0.39, 0.40);
      box(slot, "visor", 0, 1.73, -0.10, 0.53, 0.15, 0.07);
      for (const s of [-1, 1]) {
        box(slot, "accent", s * 1.02, 0.69, 0.10, 0.20, 0.17, 1.06);
        box(slot, "skin", s * 0.40, 1.18, 0.04, 0.17, 0.42, 0.21);
      }
      fourWheels(slot, 1.07, 0.95, 0.42);
      numbers(slot, Race.opponentNumber(slot), {
        front: [0.62, -1.40], rear: [0.55, 1.38],
        left: [1.13, 0.68, 0.10], right: [1.13, 0.68, 0.10],
        top: [1.08, -0.86],
      });
    }

    function buildBuggy(slot) {
      box(slot, "frame", 0, 0.65, 0, 1.95, 0.29, 3.03);
      box(slot, "body", 0, 0.90, 0, 2.12, 0.34, 3.05);
      box(slot, "accent", 0, 1.13, -0.78, 1.66, 0.22, 0.95);
      box(slot, "accent", 0, 0.70, -1.57, 2.48, 0.23, 0.24);
      box(slot, "frame", 0, 1.03, 0.51, 1.28, 0.27, 0.85);
      box(slot, "accent", 0, 1.35, 0.27, 0.66, 0.62, 0.50);
      ball(slot, "helmet", 0, 1.86, 0.26, 0.41, 0.40, 0.40);
      box(slot, "visor", 0, 1.82, -0.14, 0.55, 0.17, 0.07);
      for (const s of [-1, 1]) {
        box(slot, "frame", s * 0.77, 1.53, 0.61, 0.11, 0.86, 0.12);
        box(slot, "frame", s * 0.77, 1.90, 0.52, 0.11, 0.12, 1.16);
        box(slot, "lamp", s * 0.62, 1.17, -1.49, 0.34, 0.19, 0.09);
      }
      fourWheels(slot, 1.18, 1.08, 0.56, 0.39);
      numbers(slot, Race.opponentNumber(slot), {
        front: [0.89, -1.54], rear: [0.86, 1.54],
        left: [1.07, 0.93, 0.02], right: [1.07, 0.93, 0.02],
        top: [1.26, -0.79],
      });
    }

    function buildBike(slot) {
      box(slot, "frame", 0, 0.64, 0.06, 0.39, 0.28, 2.50);
      ball(slot, "body", 0, 0.89, 0, 0.51, 0.33, 1.17);
      ball(slot, "body", 0, 1.16, -0.65, 0.57, 0.47, 0.69);
      box(slot, "glass", 0, 1.50, -1.01, 0.59, 0.25, 0.14, -0.27);
      box(slot, "accent", 0, 0.98, 0.94, 0.40, 0.20, 0.81);
      box(slot, "frame", 0, 1.27, 0.40, 0.44, 0.16, 0.70);
      box(slot, "accent", 0, 1.43, 0.49, 0.51, 0.59, 0.50, 0.37);
      ball(slot, "helmet", 0, 1.93, 0.64, 0.37, 0.37, 0.42);
      box(slot, "visor", 0, 1.91, 0.23, 0.52, 0.17, 0.07);
      for (const s of [-1, 1]) {
        box(slot, "frame", s * 0.37, 1.18, -0.36, 0.08, 0.12, 0.66);
        box(slot, "skin", s * 0.40, 1.37, 0.10, 0.16, 0.45, 0.18, -0.35);
        box(slot, "accent", s * 0.42, 0.98, -0.38, 0.09, 0.24, 0.83);
      }
      wheel(slot, 0, -1.34, 0.50, 0.26);
      wheel(slot, 0, 1.32, 0.50, 0.26);
      numbers(slot, Race.opponentNumber(slot), {
        front: [1.08, -1.22], rear: [1.00, 1.30],
        left: [0.52, 1.03, -0.32], right: [0.52, 1.03, -0.32],
        top: [1.45, -0.62], width: 0.52,
      });
    }

    for (let slot = 0; slot < Race.GRID_COUNT; slot++) {
      const model = ASSIGNMENTS[slot];
      if (!model) continue;
      const group = new THREE.Group();
      group.visible = false; // Pose handle only: rendered parts are instanced.
      group.userData.opponentModel = model;
      group.userData.color = rivalColors.get(slot);
      group.userData.aiWheels = [];
      group.userData.numberCount = 0;
      vehicles.set(slot, group);
      scene.add(group);
      if (model === "aero") buildAero(slot);
      if (model === "kart") buildKart(slot);
      if (model === "buggy") buildBuggy(slot);
      if (model === "bike") buildBike(slot);
    }

    // One GPU batch per surface/primitive, shared across all four silhouettes.
    // All primary/trim/helmet colors are set once using instanceColor;
    // animations update only instanceMatrix on each visible frame.
    const batches = [];
    const white = new THREE.Color(0xffffff);
    for (const [key, items] of parts) {
      const [surface, shape] = key.split(":");
      const material = new THREE.MeshStandardMaterial(finishes[surface]);
      const mesh = new THREE.InstancedMesh(geometries[shape], material, items.length);
      mesh.count = 0; // No opponents in free driving or in the main menu.
      mesh.frustumCulled = false; // Moving instances invalidate cached bounds.
      if (mesh.instanceMatrix.setUsage && THREE.DynamicDrawUsage)
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (surface === "body" || surface === "accent" || surface === "helmet") {
        for (let i = 0; i < items.length; i++) {
          const color = new THREE.Color(rivalColors.get(items[i].slot));
          if (surface === "accent") color.lerp(white, 0.35);
          if (surface === "helmet") color.lerp(white, 0.58);
          mesh.setColorAt(i, color);
        }
        mesh.instanceColor.needsUpdate = true;
      }
      scene.add(mesh);
      batches.push({ mesh, items });
    }
    const composed = new THREE.Matrix4();
    const wheelMatrix = new THREE.Matrix4();
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    function sync() {
      let anyVisible = false;
      for (const group of vehicles.values()) {
        if (!group.visible) continue;
        anyVisible = true;
        group.updateMatrix();
        for (const pivot of group.userData.aiWheels) pivot.updateMatrix();
      }
      for (const { mesh, items } of batches) {
        mesh.count = anyVisible ? items.length : 0;
        if (!anyVisible) continue;
        for (let i = 0; i < items.length; i++) {
          const item = items[i], group = vehicles.get(item.slot);
          if (!group.visible) {
            mesh.setMatrixAt(i, hidden);
            continue;
          }
          if (item.wheel) {
            wheelMatrix.multiplyMatrices(item.wheel.matrix, item.local);
            composed.multiplyMatrices(group.matrix, wheelMatrix);
          } else {
            composed.multiplyMatrices(group.matrix, item.local);
          }
          mesh.setMatrixAt(i, composed);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
    return { opponentMeshes: vehicles, sync, batches };
  }
  const api = Object.freeze({ create, MODELS, ASSIGNMENTS });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.GcvOpponentVehicles = api;
})(typeof window !== "undefined" ? window : globalThis);
