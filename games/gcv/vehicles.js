"use strict";

// GCV 3D vehicle geometry. Simulation and AI movements stay in game.js.
// Explicit inputs keep this module independent of the game session state.
(function (root) {
  function create({ THREE, scene, Race, trackLength, document: canvasDocument }) {
    const car = new THREE.Group();
    const colored = new THREE.MeshStandardMaterial({ color: 0xe52b40, metalness: 0.3, roughness: 0.36 });
    const redDetail = new THREE.MeshStandardMaterial({ color: 0x9e1227, metalness: 0.18, roughness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x182332, roughness: 0.66 });
    const glass = new THREE.MeshStandardMaterial({
      color: 0x143448, roughness: 0.25, metalness: 0.24, side: THREE.DoubleSide
    });
    const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xf9f9dc, emissive: 0xf1e7a4, emissiveIntensity: 0.48 });
    const brakeLights = new THREE.MeshStandardMaterial({ color: 0x9c1828, emissive: 0xff2135, emissiveIntensity: 0.15 });
    const tyreMaterial = new THREE.MeshStandardMaterial({ color: 0x11161d, roughness: 1 });
    const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xb4bbc4, metalness: 0.65, roughness: 0.32 });

    function box(parent, width, height, depth, material, x, y, z) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    }

    box(car, 1.98, 0.20, 4.36, dark, 0, 0.48, 0);
    box(car, 2.06, 0.43, 4.12, colored, 0, 0.78, 0);
    box(car, 1.72, 0.09, 1.43, colored, 0, 1.03, -1.29);
    box(car, 1.92, 0.16, 0.22, redDetail, 0, 0.57, -2.10);
    box(car, 1.7, 0.07, 0.3, dark, 0, 1.25, 1.91);
    box(car, 1.8, 0.08, 0.2, redDetail, 0, 1.30, 1.94);
    const rearBrakeGlows = [];
    for (const side of [-1, 1]) {
      box(car, 0.48, 0.13, 0.06, lightMaterial, side * 0.69, 0.93, -2.11);
      box(car, 0.48, 0.14, 0.06, brakeLights, side * 0.70, 0.88, 2.08);
      const glow = new THREE.PointLight(0xff2739, 0, 7);
      glow.position.set(side * 0.70, 0.89, 2.17);
      car.add(glow);
      rearBrakeGlows.push(glow);
      box(car, 0.07, 0.19, 0.48, dark, side * 1.03, 0.68, -1.55);
    }

    const cabin = new THREE.Group();
    car.add(cabin);

    function panel(points, material) {
      const vertices = [];
      for (let i = 1; i + 1 < points.length; i++) {
        vertices.push(...points[0], ...points[i], ...points[i + 1]);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      geometry.computeVertexNormals();
      cabin.add(new THREE.Mesh(geometry, material));
    }

    // Open front and side windows: pillars provide the recognizable cockpit
    // structure without tinted panes obstructing the road or sideways views.
    // Only the rear window remains glazed.
    panel([[-0.72, 1.89, 0.78], [0.72, 1.89, 0.78],
      [0.86, 1.01, 1.35], [-0.86, 1.01, 1.35]], glass);
    function pillar(from, to, thickness = 0.068) {
      const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
      const direction = b.clone().sub(a);
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(thickness, thickness, direction.length(), 8), dark
      );
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      cabin.add(mesh);
    }
    for (const side of [-1, 1]) {
      pillar([side * 0.86, 1.02, -1.02], [side * 0.73, 1.89, -0.44], 0.07);
      pillar([side * 0.84, 1.02, 0.32], [side * 0.73, 1.89, 0.32], 0.055);
      pillar([side * 0.86, 1.02, 1.35], [side * 0.73, 1.89, 0.78], 0.07);
      pillar([side * 0.73, 1.89, -0.44], [side * 0.73, 1.89, 0.78], 0.07);
      box(cabin, 0.10, 0.15, 1.98, colored, side * 0.91, 0.96, -0.02);
    }
    box(cabin, 1.57, 0.11, 1.31, colored, 0, 1.97, 0.17);
    box(cabin, 1.60, 0.10, 0.11, dark, 0, 1.89, -0.44);
    box(cabin, 1.57, 0.09, 0.13, dark, 0, 1.89, 0.78);

    const wheelPivots = [];
    for (const side of [-1, 1]) {
      for (const z of [-1.40, 1.41]) {
        const pivot = new THREE.Group();
        pivot.position.set(side * 1.01, 0.49, z);
        const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.29, 12), tyreMaterial);
        tyre.rotation.z = Math.PI / 2;
        pivot.add(tyre);
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.305, 10), rimMaterial);
        rim.rotation.z = Math.PI / 2;
        pivot.add(rim);
        car.add(pivot);
        wheelPivots.push(pivot);
      }
    }

    // Visible interior with a steering wheel, a dashboard, two decorative
    // analogue gauges and a small faux information display.
    const dashboard = new THREE.Group();
    box(dashboard, 1.88, 0.23, 0.47, dark, 0, 1.02, -0.91);
    box(dashboard, 1.28, 0.34, 0.13, dark, -0.22, 1.19, -0.86);
    const dialCanvas = canvasDocument.createElement("canvas");
    dialCanvas.width = 512;
    dialCanvas.height = 160;
    const dialCtx = dialCanvas.getContext("2d");
    dialCtx.fillStyle = "#111d2d";
    dialCtx.fillRect(0, 0, 512, 160);
    function paintDial(cx, label, angle) {
      dialCtx.strokeStyle = "#a0bacf";
      dialCtx.lineWidth = 5;
      dialCtx.beginPath();
      dialCtx.arc(cx, 83, 56, 0, Math.PI * 2);
      dialCtx.stroke();
      dialCtx.strokeStyle = "#e6f4ff";
      dialCtx.lineWidth = 3;
      for (let i = 0; i < 9; i++) {
        const t = Math.PI * 0.75 + i * Math.PI * 1.5 / 8;
        dialCtx.beginPath();
        dialCtx.moveTo(cx + Math.cos(t) * 44, 83 + Math.sin(t) * 44);
        dialCtx.lineTo(cx + Math.cos(t) * 52, 83 + Math.sin(t) * 52);
        dialCtx.stroke();
      }
      dialCtx.strokeStyle = "#ef4358";
      dialCtx.lineWidth = 5;
      dialCtx.beginPath();
      dialCtx.moveTo(cx, 83);
      dialCtx.lineTo(cx + Math.cos(angle) * 39, 83 + Math.sin(angle) * 39);
      dialCtx.stroke();
      dialCtx.fillStyle = "#e1ecf7";
      dialCtx.font = "bold 16px sans-serif";
      dialCtx.textAlign = "center";
      dialCtx.fillText(label, cx, 147);
    }
    paintDial(84, "KM/H", 2.6);
    paintDial(242, "RPM", 3.3);
    dialCtx.fillStyle = "#3889bc";
    dialCtx.fillRect(322, 38, 162, 80);
    dialCtx.fillStyle = "#eaffff";
    dialCtx.font = "bold 25px monospace";
    dialCtx.textAlign = "center";
    dialCtx.fillText("GCV  09", 402, 88);
    const gauges = new THREE.Mesh(new THREE.PlaneGeometry(1.30, 0.4),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(dialCanvas) }));
    gauges.position.set(-0.22, 1.19, -0.786); // Faces the driver's seat.
    dashboard.add(gauges);
    const steeringWheel = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.034, 8, 18), dark);
    steeringWheel.position.set(-0.42, 1.16, -0.54);
    steeringWheel.rotation.x = -0.33;
    dashboard.add(steeringWheel);
    box(dashboard, 0.12, 0.12, 0.12, rimMaterial, -0.42, 1.16, -0.54);
    box(dashboard, 0.43, 0.034, 0.044, rimMaterial, -0.42, 1.16, -0.53);
    box(dashboard, 0.045, 0.32, 0.05, rimMaterial, -0.42, 1.11, -0.53);
    box(dashboard, 0.30, 0.20, 0.43, redDetail, 0.64, 1.03, -0.75);
    // Shift the entire dashboard and wheel down to reveal more road.
    dashboard.position.y = -0.16;
    car.add(dashboard);

    // The number is on the car, independent of its position on the starting grid.
    const numberCanvas = canvasDocument.createElement("canvas");
    numberCanvas.width = 128;
    numberCanvas.height = 128;
    const numberContext = numberCanvas.getContext("2d");
    numberContext.fillStyle = "#ffffff";
    numberContext.fillRect(0, 0, 128, 128);
    numberContext.fillStyle = "#b40e2b";
    numberContext.font = "bold 104px sans-serif";
    numberContext.textAlign = "center";
    numberContext.textBaseline = "middle";
    numberContext.fillText("9", 64, 72);
    const numberTexture = new THREE.CanvasTexture(numberCanvas);
    numberTexture.colorSpace = THREE.SRGBColorSpace;
    const roofNumber = new THREE.Mesh(new THREE.PlaneGeometry(0.70, 0.70),
      new THREE.MeshBasicMaterial({ map: numberTexture, side: THREE.DoubleSide }));
    roofNumber.position.set(0, 2.035, 0.15);
    roofNumber.rotation.x = -Math.PI / 2;
    cabin.add(roofNumber);
    scene.add(car);

    // Nine lightweight opponent cars. They use the same circuit as the player,
    // but a simple slow path follower rather than expensive vehicle physics.
    const opponentMeshes = new Map();
    const opponentColors = new Map(Race.create(trackLength).opponents.map((ai) =>
      [ai.id, ai.color]));
    const aiGlass = new THREE.MeshStandardMaterial({
      color: 0x193345, roughness: 0.34, metalness: 0.05,
    });
    const aiTyre = new THREE.MeshStandardMaterial({ color: 0x12181f, roughness: 1 });
    for (let gridSlot = 0; gridSlot < Race.GRID_COUNT; gridSlot++) {
      if (gridSlot === Race.PLAYER_SLOT) continue;
      const group = new THREE.Group();
      const color = new THREE.MeshStandardMaterial({
        color: opponentColors.get(gridSlot),
        roughness: 0.52, metalness: 0.16,
      });
      box(group, 1.96, 0.49, 3.65, color, 0, 0.75, 0);
      box(group, 1.48, 0.46, 1.64, aiGlass, 0, 1.16, 0.06);
      box(group, 1.75, 0.10, 0.3, color, 0, 1.24, 1.77);
      for (const side of [-1, 1]) {
        for (const z of [-1.18, 1.18]) {
          const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.29, 9), aiTyre);
          tyre.rotation.z = Math.PI / 2;
          tyre.position.set(side * 1.02, 0.45, z);
          group.add(tyre);
        }
      }
      group.visible = false;
      scene.add(group);
      opponentMeshes.set(gridSlot, group);
    }

    // Camera-specific visibility belongs to the model, not to game.js.
    function setCameraMode(outside) {
      cabin.visible = true; // Keep the roof and pillars in both camera modes.
      dashboard.visible = !outside;
    }
    return { car, wheelPivots, brakeLights, rearBrakeGlows, opponentMeshes, setCameraMode };
  }

  const api = Object.freeze({ create });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.GcvVehicles = api;
})(typeof window !== "undefined" ? window : globalThis);
