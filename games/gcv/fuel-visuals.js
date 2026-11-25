"use strict";
// One opaque, vertex-colored GPU batch for all fuel cans.
const GcvFuelVisuals = (() => {
  function createGeometry(THREE) {
    const positions = [];
    const colors = [];

    function triangle(a, b, c, hex, shade = 1) {
      const color = new THREE.Color(hex).multiplyScalar(shade);
      positions.push(...a, ...b, ...c);
      for (let i = 0; i < 3; i++) colors.push(color.r, color.g, color.b);
    }

    function quad(a, b, c, d, hex, shade) {
      triangle(a, b, c, hex, shade);
      triangle(a, c, d, hex, shade);
    }

    // Counter-clockwise convex outlines in XY, extruded along Z.
    function prism(outline, z0, z1, hex, bevel = 0) {
      const cx = outline.reduce((sum, p) => sum + p[0], 0) / outline.length;
      const cy = outline.reduce((sum, p) => sum + p[1], 0) / outline.length;
      const ring = (z, scale) =>
        outline.map(([x, y]) => [cx + (x - cx) * scale, cy + (y - cy) * scale, z]);
      const back = ring(z0, bevel ? 0.91 : 1);
      const front = ring(z1, bevel ? 0.91 : 1);
      const rings = bevel
        ? [back, ring(z0 + bevel, 1), ring(z1 - bevel, 1), front]
        : [back, front];

      for (let i = 1; i < outline.length - 1; i++) {
        triangle(front[0], front[i], front[i + 1], hex);
        triangle(back[0], back[i + 1], back[i], hex, 0.92);
      }
      for (let r = 0; r < rings.length - 1; r++) {
        const a = rings[r];
        const b = rings[r + 1];
        for (let i = 0; i < outline.length; i++) {
          const j = (i + 1) % outline.length;
          const dx = outline[j][0] - outline[i][0];
          const dy = outline[j][1] - outline[i][1];
          const light = (-dy - dx) / (Math.hypot(dx, dy) * Math.SQRT2);
          const shade = (bevel && r !== 1 ? 0.85 : 0.72) + 0.25 * light;
          quad(a[i], a[j], b[j], b[i], hex, shade);
        }
      }
    }

    function rectangle(x, y, w, h, angle = 0) {
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      return [
        [-w / 2, -h / 2],
        [w / 2, -h / 2],
        [w / 2, h / 2],
        [-w / 2, h / 2],
      ].map(([u, v]) => [x + u * c - v * s, y + u * s + v * c]);
    }

    const red = 0xf43b24;
    const darkRed = 0x9c201b;
    // Ground-relative silhouette: broad base, clipped corners and sloping shoulder.
    prism(
      [
        [-0.73, 0.15],
        [0.73, 0.15],
        [0.83, 0.25],
        [0.83, 1.61],
        [0.23, 2.21],
        [-0.73, 2.21],
        [-0.83, 2.11],
        [-0.83, 0.25],
      ],
      -0.46, 0.46, red, 0.09,
    );

    // Three solid pieces leave a real opening in the top handle.
    prism(rectangle(-0.65, 2.32, 0.16, 0.38), -0.25, 0.25, red);
    prism(rectangle(-0.03, 2.32, 0.16, 0.38), -0.25, 0.25, red);
    prism(rectangle(-0.34, 2.55, 0.78, 0.15), -0.25, 0.25, red);

    // The neck and charcoal cap follow the diagonal shoulder.
    prism(rectangle(0.47, 1.99, 0.31, 0.28, -Math.PI / 4), -0.23, 0.23, darkRed);
    prism(rectangle(0.60, 2.12, 0.40, 0.19, -Math.PI / 4), -0.28, 0.28, 0x303640);

    // Reinforced square panel and raised X on both broad faces.
    // Offset the crossing bars slightly to avoid coplanar flicker.
    for (const side of [-1, 1]) {
      function detail(outline, near, far, color) {
        prism(outline, Math.min(side * near, side * far), Math.max(side * near, side * far), color);
      }
      detail(rectangle(-0.05, 1.12, 1.13, 1.13), 0.44, 0.49, darkRed);
      detail(rectangle(-0.05, 1.12, 1.01, 1.01), 0.49, 0.52, 0xd92d20);
      detail(rectangle(-0.05, 1.12, 1.08, 0.13, Math.PI / 4), 0.52, 0.556, darkRed);
      detail(rectangle(-0.05, 1.12, 1.08, 0.13, -Math.PI / 4), 0.52, 0.559, darkRed);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  }

  function create({ THREE, scene, fuel }) {
    const geometry = createGeometry(THREE);
    const material = new THREE.MeshBasicMaterial({ vertexColors: true });
    const cans = new THREE.InstancedMesh(geometry, material, fuel.pickups.length);
    cans.frustumCulled = false;
    scene.add(cans);
    const dummy = new THREE.Object3D();
    let lastVersion = -1;

    function sync() {
      if (lastVersion === fuel.version) return;
      lastVersion = fuel.version;
      fuel.pickups.forEach((p, i) => {
        dummy.position.set(p.x, p.y, p.z);
        dummy.scale.setScalar(p.collectedAt === null ? 1 : 0);
        dummy.updateMatrix();
        cans.setMatrixAt(i, dummy.matrix);
      });
      cans.instanceMatrix.needsUpdate = true;
    }

    sync();
    return {
      sync,
      dispose() {
        scene.remove(cans);
        geometry.dispose();
        material.dispose();
      },
    };
  }
  return { create };
})();
if (typeof window !== "undefined") window.GcvFuelVisuals = GcvFuelVisuals;
if (typeof module !== "undefined" && module.exports) module.exports = GcvFuelVisuals;
