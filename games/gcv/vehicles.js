"use strict";

// GCV 3D vehicle geometry. Simulation and AI movements stay in game.js.
// Explicit inputs keep this module independent of the game session state.
(function (root) {
  const DEFAULT_ID = "classic";
  const CHOICES = Object.freeze([
    Object.freeze({ id: "classic", name: "Voiture n° 9", pilot: "Pilote classique" }),
    Object.freeze({ id: "moto", name: "Moto Turbo", pilot: "Milo le motard" }),
    Object.freeze({ id: "kart", name: "Kart Citron", pilot: "Luna la pilote" }),
    Object.freeze({ id: "buggy", name: "Buggy Dragon", pilot: "Bongo l'aventurier" }),
    Object.freeze({ id: "comet", name: "Comète Violette", pilot: "Nova l'astronaute" }),
  ]);
  const normalize = (id) => CHOICES.some((choice) => choice.id === id) ? id : DEFAULT_ID;

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

    // One high-contrast racing-number texture per vehicle, reused on all faces.
    function createNumberMaterial(number) {
      const canvas = canvasDocument.createElement("canvas");
      canvas.width = 256;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#182536";
      ctx.fillRect(0, 0, 256, 128);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(8, 8, 240, 112);
      ctx.fillStyle = "#182536";
      ctx.font = "bold 100px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(number), 128, 71);

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    }

    function addNumberDecal(group, material, width, height, x, y, z,
                            rotationX = 0, rotationY = 0) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
      mesh.position.set(x, y, z);
      mesh.rotation.x = rotationX;
      mesh.rotation.y = rotationY;
      group.add(mesh);
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

    // Match the opponents' five markings, adjusted to the taller player's
    // roof, raised bonnet and longer body. Keep the decals off cockpit glass,
    // lights and wheel arches, slightly above the paint to prevent z-fighting.
    const playerNumberMaterial = createNumberMaterial(9);
    addNumberDecal(car, playerNumberMaterial, 1.00, 0.50,
      0, 2.036, 0.17, -Math.PI / 2); // Roof
    addNumberDecal(car, playerNumberMaterial, 1.00, 0.44,
      0, 1.087, -1.34, -Math.PI / 2); // Bonnet
    addNumberDecal(car, playerNumberMaterial, 0.92, 0.40,
      0, 0.775, 2.068); // Rear, between the tail lamps
    addNumberDecal(car, playerNumberMaterial, 1.00, 0.39,
      -1.040, 0.77, 0, 0, -Math.PI / 2); // Left door
    addNumberDecal(car, playerNumberMaterial, 1.00, 0.39,
      1.040, 0.77, 0, 0, Math.PI / 2); // Right door
    scene.add(car);

    // The original car remains a complete, selectable model. The four other
    // low-poly vehicle/pilot pairs share its world transform and driving rules.
    // Only the active group is rendered; no additional scenes or renderers.
    const originalParts = [...car.children];
    const models = new Map();
    let motoRider = null; // Rider-only rig: no moving motorcycle fairing or wheels.
    const extraWheelPivots = [];
    const helmetHeads = [];
    const numberMaterial = playerNumberMaterial;
    const modelDark = new THREE.MeshStandardMaterial({ color: 0x19212d, roughness: 0.82 });
    const wheelSilver = new THREE.MeshStandardMaterial({ color: 0xb6cbd0, metalness: 0.35, roughness: 0.42 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xf6bb88, roughness: 0.9 });

    function paint(color) {
      return new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.14 });
    }
    function addWheel(group, x, z, radius = 0.46, width = 0.30) {
      const pivot = new THREE.Group();
      pivot.position.set(x, radius, z);
      const tyre = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 10), modelDark);
      tyre.rotation.z = Math.PI / 2;
      pivot.add(tyre);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.50,
        radius * 0.50, width + 0.025, 8), wheelSilver);
      rim.rotation.z = Math.PI / 2;
      pivot.add(rim);
      group.add(pivot);
      extraWheelPivots.push(pivot);
    }
    function addPilot(group, { z = 0.35, y = 1.28, jacket = 0x3db9dc,
      helmet = 0xffd34e, eyes = false, ears = false, antenna = false, lean = 0 }) {
      const clothing = paint(jacket), helmetPaint = paint(helmet);
      const torso = box(group, 0.76, 0.72, 0.47, clothing, 0, y, z);
      torso.rotation.x = lean;
      for (const side of [-1, 1]) {
        const arm = box(group, 0.20, 0.57, 0.23, clothing, side * 0.48,
          y - 0.11, z - 0.20);
        arm.rotation.x = -0.36;
        box(group, 0.26, 0.38, 0.47, modelDark,
          side * 0.32, y - 0.53, z + 0.20);
        box(group, 0.22, 0.16, 0.22, skin, side * 0.48,
          y - 0.39, z - 0.29);
      }
      const head = new THREE.Group();
      head.position.set(0, y + 0.62, z - 0.08);
      const headGeometry = THREE.SphereGeometry
        ? new THREE.SphereGeometry(0.37, 10, 8)
        : new THREE.BoxGeometry(0.70, 0.70, 0.70);
      head.add(new THREE.Mesh(headGeometry, helmetPaint));
      box(head, 0.51, 0.18, 0.09, paint(0x25354d), 0, -0.02, -0.33);
      if (eyes) {
        const eyeMaterial = paint(0xffffff);
        for (const side of [-1, 1]) {
          box(head, 0.10, 0.10, 0.05, eyeMaterial, side * 0.13, 0.03, -0.39);
        }
      }
      if (ears) {
        for (const side of [-1, 1]) {
          const ear = box(head, 0.19, 0.37, 0.24, helmetPaint,
            side * 0.29, 0.36, 0.03);
          ear.rotation.z = side * -0.30;
        }
      }
      if (antenna) {
        box(head, 0.08, 0.33, 0.08, wheelSilver, 0, 0.45, 0.05);
        box(head, 0.20, 0.17, 0.20, paint(0xffe78c), 0, 0.64, 0.05);
      }
      group.add(head);
      helmetHeads.push(head);
    }

    // A few bevelled low-poly shapes and thin rods give the bike a clear
    // motorcycle silhouette without expensive imported models or textures.
    function rounded(parent, material, x, y, z, sx, sy, sz) {
      const shape = THREE.SphereGeometry
        ? new THREE.SphereGeometry(1, 10, 8)
        : new THREE.BoxGeometry(2, 2, 2);
      const mesh = new THREE.Mesh(shape, material);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      parent.add(mesh);
      return mesh;
    }
    function tube(parent, start, end, radius, material) {
      const from = new THREE.Vector3(...start);
      const to = new THREE.Vector3(...end);
      const axis = to.clone().sub(from);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(
        radius, radius, axis.length(), 7), material);
      mesh.position.copy(from).add(to).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize());
      parent.add(mesh);
      return mesh;
    }

    function buildModel(id) {
      const group = new THREE.Group();
      const blue = paint(0x2c99df), yellow = paint(0xf8c943);
      const green = paint(0x57c66a), purple = paint(0xa06ce1);
      const red = paint(0xeb5b64);
      if (id === "moto") {
        // Milo's red supersport: a light, original 3D silhouette inspired by
        // road-racing motorcycles. All detail is procedural, with no texture
        // downloads, glTF decoding, or extra WebGL contexts on older tablets.
        const racingRed = new THREE.MeshStandardMaterial({
          color: 0xd9112f, metalness: 0.31, roughness: 0.32, side: THREE.DoubleSide,
        });
        const shadowRed = new THREE.MeshStandardMaterial({
          color: 0x960d27, metalness: 0.23, roughness: 0.41, side: THREE.DoubleSide,
        });
        const highlightRed = paint(0xf32a42);
        const white = new THREE.MeshStandardMaterial({
          color: 0xf1f2f5, metalness: 0.07, roughness: 0.49, side: THREE.DoubleSide,
        });
        const graphite = new THREE.MeshStandardMaterial({
          color: 0x20242c, roughness: 0.81, side: THREE.DoubleSide,
        });
        const rubber = new THREE.MeshStandardMaterial({ color: 0x0d1118, roughness: 1 });
        const brakeMetal = new THREE.MeshStandardMaterial({
          color: 0x8c929b, metalness: 0.7, roughness: 0.45,
        });
        const gloves = paint(0x151d29);
        const visor = new THREE.MeshStandardMaterial({
          color: 0x122235, roughness: 0.14, metalness: 0.40,
        });
        const headlamp = new THREE.MeshStandardMaterial({
          color: 0xe1f4ff, emissive: 0x81c6ed, emissiveIntensity: 0.44,
        });
        const rearLamp = new THREE.MeshStandardMaterial({
          color: 0xea3547, emissive: 0xde1937, emissiveIntensity: 0.55,
        });
        const windscreen = new THREE.MeshStandardMaterial({
          color: 0x243746, roughness: 0.16, metalness: 0.16,
          transparent: true, opacity: 0.68, depthWrite: false,
          side: THREE.DoubleSide,
        });

        // Eight-point cross-sections give fairings a curved, tapered outline
        // instead of the rectangular blocks used by the other vehicles.
        function sportShell(stations, material) {
          const ring = ({ z, y0, y1, w }) => {
            const h = y1 - y0;
            return [
              [-w * 0.68, y0, z], [-w, y0 + h * 0.22, z],
              [-w * 0.94, y1 - h * 0.19, z], [-w * 0.62, y1, z],
              [w * 0.62, y1, z], [w * 0.94, y1 - h * 0.19, z],
              [w, y0 + h * 0.22, z], [w * 0.68, y0, z],
            ];
          };
          const rings = stations.map(ring);
          const vertices = [];
          const triangle = (a, b, c) => vertices.push(...a, ...b, ...c);
          for (let i = 0; i + 1 < rings.length; i++) {
            for (let j = 0; j < 8; j++) {
              const k = (j + 1) % 8;
              triangle(rings[i][j], rings[i + 1][j], rings[i + 1][k]);
              triangle(rings[i][j], rings[i + 1][k], rings[i][k]);
            }
          }
          for (let j = 1; j < 7; j++) {
            triangle(rings[0][0], rings[0][j], rings[0][j + 1]);
            triangle(rings[rings.length - 1][0],
              rings[rings.length - 1][j + 1], rings[rings.length - 1][j]);
          }
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position",
            new THREE.Float32BufferAttribute(vertices, 3));
          geometry.computeVertexNormals();
          group.add(new THREE.Mesh(geometry, material));
        }
        function sportPanel(points, material) {
          const vertices = [];
          for (let i = 1; i + 1 < points.length; i++)
            vertices.push(...points[0], ...points[i], ...points[i + 1]);
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position",
            new THREE.Float32BufferAttribute(vertices, 3));
          geometry.computeVertexNormals();
          group.add(new THREE.Mesh(geometry, material));
        }
        function sportWheel(z, radius = 0.59) {
          const pivot = new THREE.Group();
          pivot.position.set(0, radius, z);
          const tyre = new THREE.Mesh(
            new THREE.TorusGeometry(radius - 0.105, 0.105, 7, 22), rubber);
          tyre.rotation.y = Math.PI / 2;
          pivot.add(tyre);
          // Open alloy rims, five spokes, hub and a narrow brake ring.
          for (const side of [-1, 1]) {
            const rim = new THREE.Mesh(
              new THREE.TorusGeometry(radius - 0.21, 0.042, 6, 20),
              wheelSilver);
            rim.rotation.y = Math.PI / 2;
            rim.position.x = side * 0.095;
            pivot.add(rim);
            for (let i = 0; i < 5; i++) {
              const angle = i * Math.PI * 2 / 5;
              tube(pivot, [side * 0.095, Math.sin(angle) * 0.11,
                Math.cos(angle) * 0.11],
              [side * 0.095, Math.sin(angle) * (radius - 0.22),
                Math.cos(angle) * (radius - 0.22)], 0.033, wheelSilver);
            }
          }
          const hub = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.12, 0.28, 10), brakeMetal);
          hub.rotation.z = Math.PI / 2;
          pivot.add(hub);
          const brake = new THREE.Mesh(
            new THREE.TorusGeometry(radius - 0.255, 0.042, 5, 16),
            brakeMetal);
          brake.rotation.y = Math.PI / 2;
          brake.position.x = -0.145;
          pivot.add(brake);
          group.add(pivot);
          extraWheelPivots.push(pivot);
        }

        sportWheel(-1.48);
        sportWheel(1.35);
        // A continuous red nose, low belly pan and swept rear tail.
        sportShell([
          { z: -1.67, y0: 1.10, y1: 1.39, w: 0.25 },
          { z: -1.39, y0: 0.97, y1: 1.60, w: 0.40 },
          { z: -0.95, y0: 0.81, y1: 1.57, w: 0.51 },
          { z: -0.39, y0: 0.70, y1: 1.32, w: 0.53 },
          { z: 0.18, y0: 0.72, y1: 1.03, w: 0.42 },
        ], racingRed);
        sportShell([
          { z: -0.94, y0: 0.58, y1: 1.01, w: 0.42 },
          { z: -0.34, y0: 0.40, y1: 1.05, w: 0.51 },
          { z: 0.43, y0: 0.46, y1: 0.91, w: 0.39 },
          { z: 0.74, y0: 0.53, y1: 0.66, w: 0.25 },
        ], shadowRed);
        // Fuel tank is prominent in side view and clear of the rider's arms.
        rounded(group, racingRed, 0, 1.46, -0.25, 0.51, 0.35, 0.67);
        rounded(group, highlightRed, 0, 1.60, -0.50, 0.38, 0.13, 0.34);
        const fuelCap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.13, 0.13, 0.026, 12), graphite);
        fuelCap.position.set(0, 1.815, -0.25);
        group.add(fuelCap);
        const capCenter = new THREE.Mesh(
          new THREE.CylinderGeometry(0.073, 0.073, 0.030, 10), wheelSilver);
        capCenter.position.set(0, 1.834, -0.25);
        group.add(capCenter);
        sportShell([
          { z: 0.48, y0: 1.17, y1: 1.39, w: 0.39 },
          { z: 1.03, y0: 1.34, y1: 1.58, w: 0.40 },
          { z: 1.65, y0: 1.52, y1: 1.62, w: 0.23 },
        ], racingRed);
        rounded(group, graphite, 0, 1.42, 0.57, 0.43, 0.095, 0.57);
        rounded(group, graphite, 0, 1.57, 1.17, 0.31, 0.075, 0.25);
        box(group, 0.31, 0.095, 0.055, rearLamp, 0, 1.54, 1.66);
        // Smoked screen leans back, bounded by two delicate metal stays.
        sportPanel([
          [-0.32, 1.53, -1.48], [0.32, 1.53, -1.48],
          [0.25, 1.96, -1.04], [-0.25, 1.96, -1.04],
        ], windscreen);
        for (const side of [-1, 1]) {
          tube(group, [side * 0.32, 1.53, -1.48],
            [side * 0.25, 1.96, -1.04], 0.018, graphite);
          const lamp = box(group, 0.22, 0.115, 0.036, headlamp,
            side * 0.135, 1.26, -1.68);
          lamp.rotation.z = side * 0.16;
        }
        // Front fender follows the upper tyre, rather than covering the rim.
        sportShell([
          { z: -1.92, y0: 1.04, y1: 1.12, w: 0.26 },
          { z: -1.50, y0: 1.15, y1: 1.28, w: 0.31 },
          { z: -1.21, y0: 1.04, y1: 1.13, w: 0.28 },
        ], racingRed);

        // Under-fairing engine, twin fork tubes, silver swingarm and one
        // short silencer remain readable even in the low camera view.
        rounded(group, graphite, 0, 0.76, 0.13, 0.38, 0.30, 0.40);
        box(group, 0.48, 0.20, 2.30, graphite, 0, 0.86, 0.18);
        for (const side of [-1, 1]) {
          tube(group, [side * 0.27, 1.38, -1.05],
            [side * 0.18, 0.59, -1.48], 0.071, wheelSilver);
          tube(group, [side * 0.24, 1.03, -0.13],
            [side * 0.31, 0.89, 0.52], 0.082, wheelSilver);
          tube(group, [side * 0.31, 0.89, 0.52],
            [side * 0.18, 0.59, 1.35], 0.075, wheelSilver);
          tube(group, [side * 0.21, 0.87, 0.34],
            [side * 0.18, 0.59, 1.35], 0.047, brakeMetal);
          const engineCover = new THREE.Mesh(
            new THREE.CylinderGeometry(0.23, 0.23, 0.035, 12), brakeMetal);
          engineCover.rotation.z = Math.PI / 2;
          engineCover.position.set(side * 0.50, 0.79, 0.14);
          group.add(engineCover);
          // Two angular white race flashes flank the fairing's air intakes.
          sportPanel([
            [side * 0.56, 1.07, -0.89],
            [side * 0.57, 1.15, -0.19],
            [side * 0.55, 0.95, -0.19],
            [side * 0.55, 0.89, -0.63],
          ], white);
          sportPanel([
            [side * 0.575, 0.90, -0.53],
            [side * 0.56, 0.76, -0.24],
            [side * 0.57, 0.84, 0.08],
            [side * 0.575, 1.01, -0.10],
          ], graphite);
          box(group, 0.09, 0.065, 0.32, wheelSilver,
            side * 0.56, 0.85, 0.53);
          // Rear side-panel accent makes the tapered tail recognizable.
          sportPanel([
            [side * 0.41, 1.48, 1.02], [side * 0.28, 1.60, 1.56],
            [side * 0.35, 1.51, 1.41],
          ], white);
          tube(group, [side * 0.20, 1.53, -0.92],
            [side * 0.54, 1.53, -0.98], 0.05, graphite);
          box(group, 0.14, 0.09, 0.18, rubber,
            side * 0.56, 1.53, -0.98);
        }
        const exhaust = box(group, 0.18, 0.20, 0.66, wheelSilver,
          0.52, 0.77, 0.99);
        exhaust.rotation.x = -0.12;
        box(group, 0.16, 0.16, 0.035, graphite, 0.52, 0.79, 1.34);
        tube(group, [-0.24, 0.62, 0.92],
          [0.24, 0.62, 0.92], 0.045, brakeMetal);
        // Rider-only joint at the hips. The counter-offset keeps every limb
        // in the original position at rest; only these two Groups move.
        const riderBody = new THREE.Group();
        riderBody.position.set(0, 1.32, 0.22);
        const riderParts = new THREE.Group();
        riderParts.position.set(0, -1.32, -0.22);
        riderBody.add(riderParts);
        group.add(riderBody);
        motoRider = { body: riderBody, helmet: null, arms: [], baseY: 1.32 };
        // Hands naturally grip the bars; bent arms and knees show the pose.
        const suit = paint(0x222a35);
        rounded(riderParts, suit, 0, 1.80, 0.10, 0.46, 0.43, 0.33);
        box(riderParts, 0.55, 0.10, 0.37, racingRed, 0, 1.91, 0.33);
        for (const side of [-1, 1]) {
          // Shoulder pivots let each arm follow the handlebars separately.
          // Nested counter-offset preserves the existing pose at rest.
          const shoulder = new THREE.Group();
          shoulder.position.set(side * 0.43, 1.88, 0.02);
          const arm = new THREE.Group();
          arm.position.set(-side * 0.43, -1.88, -0.02);
          shoulder.add(arm);
          riderParts.add(shoulder);
          motoRider.arms.push(shoulder);
          rounded(arm, racingRed, side * 0.43, 1.88, 0.02,
            0.21, 0.19, 0.26);
          tube(arm, [side * 0.43, 1.80, -0.04],
            [side * 0.49, 1.53, -0.96], 0.135, suit);
          rounded(arm, gloves, side * 0.49, 1.51, -0.96,
            0.15, 0.12, 0.15);
          // Knees and boots stay attached to the seated pelvis.
          tube(riderParts, [side * 0.30, 1.53, 0.42],
            [side * 0.43, 1.00, 0.76], 0.16, suit);
          tube(riderParts, [side * 0.43, 1.00, 0.76],
            [side * 0.57, 0.80, 0.35], 0.14, gloves);
          box(riderParts, 0.26, 0.16, 0.42, gloves,
            side * 0.57, 0.73, 0.27);
        }
        const helmetGroup = new THREE.Group();
        helmetGroup.position.set(0, 2.30, -0.42);
        rounded(helmetGroup, racingRed, 0, 0, 0, 0.43, 0.42, 0.42);
        rounded(helmetGroup, white, 0, 0.21, 0.01, 0.16, 0.21, 0.35);
        // Wide full-face visor, mouth guard and rear aerodynamic fin.
        rounded(helmetGroup, visor, 0, -0.025, -0.355, 0.36, 0.185, 0.13);
        box(helmetGroup, 0.60, 0.20, 0.22, graphite, 0, -0.24, -0.24);
        const crest = box(helmetGroup, 0.18, 0.19, 0.62, white,
          0, 0.35, 0.13);
        crest.rotation.x = -0.14;
        riderParts.add(helmetGroup);
        motoRider.helmet = helmetGroup;
        helmetHeads.push(helmetGroup);

        // #9 is legible from the front, rear and both sides.
        addNumberDecal(group, numberMaterial, 0.47, 0.31,
          0, 1.625, -1.13, -Math.PI / 2);
        addNumberDecal(group, numberMaterial, 0.38, 0.25, 0, 1.59, 1.675);
        for (const side of [-1, 1])
          addNumberDecal(group, numberMaterial, 0.45, 0.31,
            side * 0.602, 1.18, -0.58, 0, side * Math.PI / 2);
      } else if (id === "kart") {
        box(group, 2.18, 0.28, 2.85, yellow, 0, 0.57, 0);
        box(group, 1.72, 0.39, 0.96, green, 0, 0.79, -0.87);
        box(group, 2.40, 0.23, 0.28, modelDark, 0, 0.54, -1.42);
        box(group, 1.10, 0.25, 0.87, modelDark, 0, 0.87, 0.53);
        box(group, 0.84, 0.14, 0.12, wheelSilver, 0, 1.28, -0.22);
        for (const x of [-1.08, 1.08]) {
          addWheel(group, x, -1.04, 0.43);
          addWheel(group, x, 1.03, 0.43);
        }
        addPilot(group, { z: 0.49, y: 1.28, jacket: 0x56b960, helmet: 0xffe276, eyes: true });
        addNumberDecal(group, numberMaterial, 0.88, 0.43, 0, 1.015, -0.91, -Math.PI / 2);
        for (const sign of [-1, 1]) {
          addNumberDecal(group, numberMaterial, 0.63, 0.30, sign * 1.10, 0.68, 0.10,
            0, sign * Math.PI / 2);
        }
      } else if (id === "buggy") {
        // Friendly fantasy off-road racer; no franchise character or copied design.
        box(group, 2.32, 0.45, 3.22, green, 0, 0.75, 0);
        box(group, 1.85, 0.33, 1.06, yellow, 0, 1.08, -0.82);
        box(group, 2.55, 0.23, 0.27, modelDark, 0, 0.60, -1.57);
        box(group, 1.60, 0.16, 0.79, modelDark, 0, 0.99, 0.44);
        for (const sign of [-1, 1]) {
          addWheel(group, sign * 1.22, -1.11, 0.57, 0.41);
          addWheel(group, sign * 1.22, 1.15, 0.57, 0.41);
          box(group, 0.11, 0.74, 0.14, wheelSilver, sign * 0.78, 1.61, 0.62);
        }
        box(group, 1.63, 0.10, 0.16, wheelSilver, 0, 1.98, 0.62);
        addPilot(group, { z: 0.32, y: 1.36, jacket: 0xef7e45,
          helmet: 0x46ba78, ears: true });
        addNumberDecal(group, numberMaterial, 0.91, 0.43, 0, 1.261, -0.92, -Math.PI / 2);
        for (const sign of [-1, 1])
          addNumberDecal(group, numberMaterial, 0.77, 0.39,
            sign * 1.17, 0.83, 0.12, 0, sign * Math.PI / 2);
      } else if (id === "comet") {
        box(group, 1.93, 0.36, 3.73, purple, 0, 0.67, 0);
        box(group, 1.48, 0.27, 1.40, red, 0, 0.89, -0.98);
        box(group, 2.55, 0.08, 0.55, purple, 0, 0.71, 1.34);
        box(group, 1.20, 0.25, 0.95, modelDark, 0, 1.02, 0.33);
        box(group, 1.33, 0.13, 0.15, wheelSilver, 0, 1.43, -0.19);
        for (const sign of [-1, 1]) {
          addWheel(group, sign * 0.96, -1.13, 0.41);
          addWheel(group, sign * 1.02, 1.14, 0.49);
          const fin = box(group, 0.31, 0.56, 0.72, red,
            sign * 0.78, 0.97, 1.31);
          fin.rotation.z = sign * -0.26;
        }
        addPilot(group, { z: 0.32, y: 1.36, jacket: 0x7766db,
          helmet: 0xf5a9e0, antenna: true });
        addNumberDecal(group, numberMaterial, 0.85, 0.41, 0, 1.055, -1.04, -Math.PI / 2);
        for (const sign of [-1, 1])
          addNumberDecal(group, numberMaterial, 0.62, 0.33,
            sign * 1.01, 0.73, 0.16, 0, sign * Math.PI / 2);
      }
      group.visible = false;
      car.add(group);
      models.set(id, group);
    }
    for (const choice of CHOICES) {
      if (choice.id !== DEFAULT_ID) buildModel(choice.id);
    }
    let activeVehicle = DEFAULT_ID;
    let cameraOutside = true;
    function setCameraMode(outside) {
      cameraOutside = Boolean(outside);
      cabin.visible = activeVehicle === DEFAULT_ID;
      dashboard.visible = activeVehicle === DEFAULT_ID && !cameraOutside;
      // The inside camera must not sit inside a helmet.
      for (const head of helmetHeads) head.visible = cameraOutside;
    }
    function setVehicle(id) {
      activeVehicle = normalize(id);
      const isClassic = activeVehicle === DEFAULT_ID;
      for (const part of originalParts) part.visible = isClassic;
      for (const [modelId, model] of models) model.visible = modelId === activeVehicle;
      setCameraMode(cameraOutside);
      return activeVehicle;
    }

    // Nine lightweight opponent cars. They use the same circuit as the player,
    // but a simple slow path follower rather than expensive vehicle physics.
    const opponentMeshes = new Map();
    const opponentColors = new Map(Race.create(trackLength).opponents.map((ai) =>
      [ai.id, ai.color]));
    const aiGlass = new THREE.MeshStandardMaterial({
      color: 0x193345, roughness: 0.34, metalness: 0.05,
    });
    const aiTyre = new THREE.MeshStandardMaterial({ color: 0x12181f, roughness: 1 });

    // The AI's simpler, lower body needs its original decal positions.
    function addOpponentNumber(group, number) {
      const material = createNumberMaterial(number);
      addNumberDecal(group, material, 1.00, 0.50, 0, 1.404, 0.06, -Math.PI / 2); // Roof
      addNumberDecal(group, material, 1.00, 0.44, 0, 1.005, -1.27, -Math.PI / 2); // Bonnet
      addNumberDecal(group, material, 0.94, 0.43, 0, 0.77, 1.844); // Rear
      addNumberDecal(group, material, 0.98, 0.44, -0.991, 0.77, 0, 0, -Math.PI / 2); // Left
      addNumberDecal(group, material, 0.98, 0.44, 0.991, 0.77, 0, 0, Math.PI / 2); // Right
    }
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
      addOpponentNumber(group, Race.opponentNumber(gridSlot));
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

    return {
      car, wheelPivots, extraWheelPivots, brakeLights, rearBrakeGlows,
      opponentMeshes, motoRider, setCameraMode, setVehicle,
    };
  }

  const api = Object.freeze({ create, CHOICES, DEFAULT_ID, normalize });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.GcvVehicles = api;
})(typeof window !== "undefined" ? window : globalThis);
