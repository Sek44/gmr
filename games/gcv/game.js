"use strict";

// Lightweight driving prototype. Three.js is imported from a pinned CDN version so GMR
// remains a static GitHub Pages site without an application build pipeline.
(async () => {
  const stage = document.getElementById("gcv-stage");
  const sceneHost = document.getElementById("gcv-scene");
  const speedLabel = document.getElementById("speed-value");
  const gearLabel = document.getElementById("gear-value");
  const lapLabel = document.getElementById("lap-value");
  const sessionModeLabel = document.getElementById("session-mode-label");
  const chronoLabel = document.getElementById("lap-chrono");
  const chronoBox = document.getElementById("lap-chrono-box");
  const chronoTitle = document.getElementById("lap-chrono-title");
  const chronoRank = document.getElementById("lap-chrono-rank");
  const deltaLabel = document.getElementById("lap-delta");
  const deltaValue = document.getElementById("lap-delta-value");
  const splitLabel = document.getElementById("lap-split-label");
  const bestLabels = [1, 2, 3].map((rank) =>
    document.getElementById("best-lap-" + rank));
  const cameraButton = document.getElementById("camera-button");
  const fullscreenButton = document.getElementById("fullscreen-button");
  const restartButton = document.getElementById("restart-button");
  const homePanel = document.getElementById("gcv-home");
  const resumeButton = document.getElementById("resume-button");
  const menuButton = document.getElementById("menu-button");
  const menuFullscreenButton = document.getElementById("menu-fullscreen-button");
  const scoresButton = document.getElementById("scores-button");
  const menuScoresButton = document.getElementById("menu-scores-button");
  const scoresFrame = document.getElementById("gcv-scores");
  const freeModeButton = document.getElementById("free-mode-button");
  const raceModeButton = document.getElementById("race-mode-button");
  const racePositionBox = document.getElementById("race-position");
  const racePositionValue = document.getElementById("position-value");
  const raceLapLabel = document.getElementById("race-lap-label");
  const lapCountLabel = document.getElementById("lap-count-label");
  const raceOverlay = document.getElementById("race-overlay");
  const raceOverlayTitle = document.getElementById("race-overlay-title");
  const raceOverlaySubtitle = document.getElementById("race-overlay-subtitle");
  const raceOverlayActions = document.getElementById("race-overlay-actions");
  const raceResults = document.getElementById("race-results");
  const raceResultsBody = document.getElementById("race-results-body");
  const raceResultsStatus = document.getElementById("race-results-status");
  const replayButton = document.getElementById("race-replay-button");
  const raceFreeButton = document.getElementById("race-free-button");
  const notice = document.getElementById("gcv-notice");
  const pad = document.getElementById("steer-pad");
  const knob = document.getElementById("steer-knob");
  const gasButton = document.getElementById("accelerate-button");
  const brakeButton = document.getElementById("brake-button");
  const mapCanvas = document.getElementById("mini-map");
  const Physics = window.GcvPhysics;
  const TrackProgress = window.GcvTrackProgress;
  const Scenery = window.GcvScenery;
  const TrackLayout = window.GcvTrackLayout;
  const LapTimes = window.GcvLapTimes;
  const Race = window.GcvRace;

  function announce(message) {
    notice.textContent = message;
    notice.hidden = !message;
  }

  try {
    if (!Physics || !TrackProgress || !Scenery || !TrackLayout || !LapTimes || !Race)
      throw new Error("Les modules de conduite sont introuvables.");
    const THREE = await import("https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js");
    start(THREE);
  } catch (error) {
    console.error("GCV cannot start:", error);
    announce("Impossible de charger le jeu 3D. Vérifie ta connexion et recharge la page.");
  }

  function start(THREE) {
    const ROAD_HALF_WIDTH = TrackLayout.ROAD_HALF_WIDTH;
    const GRAVEL_WIDTH = TrackLayout.SHOULDER_WIDTH;
    const OUTER_HALF_WIDTH = ROAD_HALF_WIDTH + GRAVEL_WIDTH;
    const SAMPLE_COUNT = TrackLayout.SAMPLE_COUNT;
    const CURVE_POINTS = TrackLayout.WAYPOINTS.map(([x, z]) =>
      new THREE.Vector3(x, 0, z));
    const curve = new THREE.CatmullRomCurve3(CURVE_POINTS, true, "catmullrom", 0.55);
    const trackLength = curve.getLength();
    const positions = [];
    const directions = [];
    const sides = [];

    for (let i = 0; i <= SAMPLE_COUNT; i++) {
      const t = i / SAMPLE_COUNT;
      const center = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t).normalize();
      positions.push(center);
      directions.push(tangent);
      sides.push(new THREE.Vector3(-tangent.z, 0, tangent.x));
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    sceneHost.append(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x97cfe4);
    scene.fog = new THREE.Fog(0x97cfe4, 500, 2100);
    scene.add(new THREE.HemisphereLight(0xeaf8ff, 0x526d6c, 2.0));
    const sunlight = new THREE.DirectionalLight(0xffeed5, 2.35);
    sunlight.position.set(-70, 120, 45);
    scene.add(sunlight);

    const camera = new THREE.PerspectiveCamera(72, 1, 0.08, 2400);
    // Earth/mud throughout: road and safety shoulders differ only by soil shade.
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x856044, roughness: 1, side: THREE.DoubleSide,
    });
    const shoulderMaterial = new THREE.MeshStandardMaterial({
      color: 0xb29871, roughness: 1, side: THREE.DoubleSide,
    });

    // Build ribbon meshes from a single closed centerline. The same geometry
    // drives minimap, collision/respawn and future AI waypoint navigation.
    function strip(offset, halfWidth, height, material) {
      const vertices = [], indices = [];
      for (let i = 0; i <= SAMPLE_COUNT; i++) {
        const p = positions[i], n = sides[i];
        for (const sign of [-1, 1]) {
          vertices.push(p.x + n.x * (offset + sign * halfWidth), height,
            p.z + n.z * (offset + sign * halfWidth));
        }
      }
      for (let i = 0; i < SAMPLE_COUNT; i++) {
        const v = 2 * i;
        indices.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
      return mesh;
    }

    strip(0, OUTER_HALF_WIDTH, 0.02, shoulderMaterial);
    strip(0, ROAD_HALF_WIDTH, 0.07, roadMaterial);

    // The previously flat ribbon is now a solid-looking elevated island road:
    // dark earth side walls and an underside along the complete closed curve.
    const TRACK_BOTTOM = -4.8;
    const solidVertices = [];
    const solidIndices = [];
    for (let i = 0; i <= SAMPLE_COUNT; i++) {
      const p = positions[i], normal = sides[i];
      const lx = p.x - normal.x * OUTER_HALF_WIDTH;
      const lz = p.z - normal.z * OUTER_HALF_WIDTH;
      const rx = p.x + normal.x * OUTER_HALF_WIDTH;
      const rz = p.z + normal.z * OUTER_HALF_WIDTH;
      solidVertices.push(
        lx, 0.02, lz, lx, TRACK_BOTTOM, lz,
        rx, 0.02, rz, rx, TRACK_BOTTOM, rz
      );
    }
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const a = i * 4, b = a + 4;
      // Left/right cliff faces and a real bottom face.
      solidIndices.push(
        a, b, a + 1, a + 1, b, b + 1,
        a + 2, a + 3, b + 2, a + 3, b + 3, b + 2,
        a + 1, b + 1, a + 3, a + 3, b + 1, b + 3
      );
    }
    const solidGeometry = new THREE.BufferGeometry();
    solidGeometry.setAttribute("position", new THREE.Float32BufferAttribute(solidVertices, 3));
    solidGeometry.setIndex(solidIndices);
    solidGeometry.computeVertexNormals();
    scene.add(new THREE.Mesh(solidGeometry, new THREE.MeshStandardMaterial({
      color: 0x674934, roughness: 1, side: THREE.DoubleSide,
    })));

    // Sparse, low-poly stones on the 6 m earth shoulders. Instancing keeps
    // rendering cheap on Android and never places stones on the asphalt.
    const pebbleCount = Math.ceil(SAMPLE_COUNT / 7) * 2 * 5;
    const pebbles = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(0.12, 0),
      new THREE.MeshStandardMaterial({ color: 0x736e61, roughness: 1 }),
      pebbleCount
    );
    const pebble = new THREE.Object3D();
    let pebbleIndex = 0;
    for (let i = 0; i < SAMPLE_COUNT; i += 7) {
      for (const side of [-1, 1]) {
        for (let stone = 0; stone < 5; stone++) {
          const proportion = ((i * 13 + stone * 43) % 97) / 97;
          const offset = side * (ROAD_HALF_WIDTH + 0.22 + proportion * (GRAVEL_WIDTH - 0.44));
          const center = positions[i], normal = sides[i];
          pebble.position.set(center.x + normal.x * offset, 0.11,
            center.z + normal.z * offset);
          pebble.scale.set(0.5 + proportion * 0.6, 0.25, 0.7);
          pebble.rotation.set(0, proportion * Math.PI, 0);
          pebble.updateMatrix();
          pebbles.setMatrixAt(pebbleIndex++, pebble.matrix);
        }
      }
    }
    pebbles.instanceMatrix.needsUpdate = true;
    scene.add(pebbles);
    // Muddy patches give the road a rough, irregular surface without painted
    // white/yellow lane markings. All use a single instanced draw call.
    const patches = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 10),
      new THREE.MeshStandardMaterial({
        color: 0x614a37, roughness: 1, transparent: true, opacity: 0.42,
        depthWrite: false, side: THREE.DoubleSide,
      }),
      Math.floor((SAMPLE_COUNT - 1) / 2)
    );
    const patch = new THREE.Object3D();
    let patchIndex = 0;
    for (let i = 2; i < SAMPLE_COUNT; i += 2) {
      const p = positions[i], normal = sides[i];
      const n = ((i * 61) % 97) / 97;
      const offset = (n * 2 - 1) * (ROAD_HALF_WIDTH - 1.5);
      patch.position.set(p.x + normal.x * offset, 0.096,
        p.z + normal.z * offset);
      patch.rotation.set(-Math.PI / 2, 0, i * 0.31);
      patch.scale.set(0.5 + n * 1.7, 1.2 + (i % 7) * 0.31, 1);
      patch.updateMatrix();
      patches.setMatrixAt(patchIndex++, patch.matrix);
    }
    patches.instanceMatrix.needsUpdate = true;
    scene.add(patches);

    // Shallow water puddles: purely decorative, no changes to grip or
    // physics. Instancing allows all puddles to render in two draw calls.
    // They sit slightly above the 0.07 m dirt road to prevent z-fighting.
    const puddleIndices = Array.from({ length: 19 }, (_, i) =>
      Math.round((i + 0.62) * SAMPLE_COUNT / 19));
    const puddleShape = new THREE.CircleGeometry(1, 20);
    const puddleWater = new THREE.InstancedMesh(
      puddleShape,
      new THREE.MeshStandardMaterial({
        color: 0x527d89, roughness: 0.14, metalness: 0.18,
        transparent: true, opacity: 0.77,
        depthWrite: false, side: THREE.DoubleSide,
      }),
      puddleIndices.length
    );
    const puddleReflection = new THREE.InstancedMesh(
      puddleShape,
      new THREE.MeshBasicMaterial({
        color: 0xadd6e0, transparent: true, opacity: 0.23,
        depthWrite: false, side: THREE.DoubleSide,
      }),
      puddleIndices.length
    );
    const puddleTransform = new THREE.Object3D();
    for (let i = 0; i < puddleIndices.length; i++) {
      const j = puddleIndices[i] % SAMPLE_COUNT;
      const center = positions[j], normal = sides[j];
      const variation = ((i * 37 + 13) % 89) / 89;
      const offset = (variation * 2 - 1) * (ROAD_HALF_WIDTH - 3.1);
      const radius = 1.2 + ((i * 19) % 11) / 11 * 1.7;
      const x = center.x + normal.x * offset;
      const z = center.z + normal.z * offset;
      const yaw = i * 0.71;
      puddleTransform.position.set(x, 0.086, z);
      puddleTransform.rotation.set(-Math.PI / 2, 0, yaw);
      puddleTransform.scale.set(radius, radius * (0.55 + variation * 0.25), 1);
      puddleTransform.updateMatrix();
      puddleWater.setMatrixAt(i, puddleTransform.matrix);
      // A narrow, pale reflected strip makes the standing water legible,
      // even in the low-poly lighting of the rest of the circuit.
      puddleTransform.position.set(x, 0.088, z);
      puddleTransform.scale.set(radius * 0.59, radius * 0.17, 1);
      puddleTransform.updateMatrix();
      puddleReflection.setMatrixAt(i, puddleTransform.matrix);
    }
    puddleWater.instanceMatrix.needsUpdate = true;
    puddleReflection.instanceMatrix.needsUpdate = true;
    scene.add(puddleWater, puddleReflection);

    // Checkered line across a straight section of the circuit.
    const startIndex = TrackLayout.nearestIndex(positions, TrackLayout.FINISH);
    const startCenter = positions[startIndex], startSide = sides[startIndex];
    const startYaw = Math.atan2(-directions[startIndex].x, -directions[startIndex].z);
    // The finish marking is made of dark and pale earth tiles, not paint.
    const black = new THREE.MeshStandardMaterial({ color: 0x523b2e, roughness: 1 });
    const white = new THREE.MeshStandardMaterial({ color: 0xc2a783, roughness: 1 });
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 12; col++) {
        const longitudinal = directions[startIndex].clone().multiplyScalar((row - 0.5) * 1.35);
        const across = startSide.clone().multiplyScalar((col - 5.5) * 1.47);
        const tile = new THREE.Mesh(new THREE.BoxGeometry(1.47, 0.02, 1.35),
          (row + col) % 2 ? black : white);
        tile.position.copy(startCenter).add(longitudinal).add(across);
        tile.position.y = 0.10;
        tile.rotation.y = startYaw;
        scene.add(tile);
      }
    }

    // Huge sea under the raised dirt course. It extends beyond the camera's
    // visibility so its rectangular edge cannot appear on the horizon.
    const WATER_LEVEL = -30;
    const abyss = new THREE.Mesh(
      new THREE.PlaneGeometry(4200, 4200),
      new THREE.MeshStandardMaterial({
        color: 0x417f91, roughness: 0.28, metalness: 0.04,
      })
    );
    abyss.rotation.x = -Math.PI / 2;
    abyss.position.y = WATER_LEVEL;
    scene.add(abyss);

    // Bare rock islets: the rocks rise directly out of the water, with
    // no beaches or sandy discs. Validate against the ENTIRE winding circuit
    // and previously placed rocks to avoid obstacles appearing on the road.
    const rockMaterial = new THREE.MeshStandardMaterial({
      color: 0x64737b, roughness: 1, flatShading: true,
    });
    const rockGeometry = new THREE.DodecahedronGeometry(1, 1);
    const islands = [];
    for (let i = 0; i < 22; i++) {
      const index = Math.floor(i * SAMPLE_COUNT / 22);
      const side = i % 2 === 0 ? -1 : 1;
      const rockRadius = 8.5 + (i % 4) * 1.4;
      const rockHeight = 22 + (i % 5) * 3.5;
      const location = Scenery.placeRock({
        center: positions[index], normal: sides[index], side,
        startOffset: OUTER_HALF_WIDTH + 42 + (i % 3) * 13,
        radius: rockRadius, roadLimit: OUTER_HALF_WIDTH,
        trackPoints: positions, existing: islands,
      });
      if (!location) continue;
      const rock = new THREE.Mesh(rockGeometry, rockMaterial);
      rock.scale.set(rockRadius, rockHeight, rockRadius * 0.9);
      // Centre low enough that the rock penetrates the water surface.
      rock.position.set(location.x, WATER_LEVEL + rockHeight * 0.70, location.z);
      rock.rotation.y = i * 0.74;
      scene.add(rock);
      islands.push(location);
    }

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
    const dialCanvas = document.createElement("canvas");
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
    const numberCanvas = document.createElement("canvas");
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

    // One batched particle system: only very severe fast steering produces mud.
    const MAX_MUD_PARTICLES = 240;
    const mudPositions = new Float32Array(MAX_MUD_PARTICLES * 3);
    const mudColors = new Float32Array(MAX_MUD_PARTICLES * 3);
    const mudState = Array.from({ length: MAX_MUD_PARTICLES }, () => ({
      lifetime: 0, duration: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    }));
    for (let i = 0; i < MAX_MUD_PARTICLES; i++) mudPositions[i * 3 + 1] = -2000;
    const mudGeometry = new THREE.BufferGeometry();
    const mudPositionAttribute = new THREE.BufferAttribute(mudPositions, 3);
    const mudColorAttribute = new THREE.BufferAttribute(mudColors, 3);
    mudPositionAttribute.setUsage(THREE.DynamicDrawUsage);
    mudColorAttribute.setUsage(THREE.DynamicDrawUsage);
    mudGeometry.setAttribute("position", mudPositionAttribute);
    mudGeometry.setAttribute("color", mudColorAttribute);
    const mudPoints = new THREE.Points(mudGeometry, new THREE.PointsMaterial({
      size: 0.34, vertexColors: true, transparent: true,
      opacity: 0.92, depthWrite: false, sizeAttenuation: true,
    }));
    mudPoints.frustumCulled = false;
    scene.add(mudPoints);
    let nextMudParticle = 0, mudEmissionRemainder = 0;

    function tickMudParticles(dt, intensity) {
      for (let i = 0; i < MAX_MUD_PARTICLES; i++) {
        const p = mudState[i], j = 3 * i;
        if (p.lifetime > 0) {
          p.lifetime -= dt;
          p.x += p.vx * dt;
          p.z += p.vz * dt;
          p.y += p.vy * dt;
          p.vy -= 9.81 * dt;
          if (p.y < 0.11) p.lifetime = 0;
        }
        if (p.lifetime > 0) {
          mudPositions[j] = p.x;
          mudPositions[j + 1] = p.y;
          mudPositions[j + 2] = p.z;
          const brightness = 0.3 + 0.7 * (p.lifetime / p.duration);
          mudColors[j] = brightness * 0.42;
          mudColors[j + 1] = brightness * 0.29;
          mudColors[j + 2] = brightness * 0.16;
        } else {
          mudPositions[j + 1] = -2000;
        }
      }

      if (intensity > 0 && dt > 0) {
        mudEmissionRemainder += Math.min(1.5, intensity) * dt * 100;
        const emissions = Math.min(12, Math.floor(mudEmissionRemainder));
        mudEmissionRemainder -= emissions;
        for (let i = 0; i < emissions; i++) {
          const p = mudState[nextMudParticle];
          const side = i % 2 === 0 ? -1 : 1;
          const origin = car.localToWorld(new THREE.Vector3(
            side * 0.86, 0.22, 1.48
          ));
          p.x = origin.x;
          p.y = origin.y;
          p.z = origin.z;
          const spread = (Math.random() - 0.5) * 3.0;
          const backSpeed = 1.3 + Math.random() * 3.7;
          p.vx = Math.sin(driver.yaw) * backSpeed + Math.cos(driver.yaw) * spread;
          p.vz = Math.cos(driver.yaw) * backSpeed - Math.sin(driver.yaw) * spread;
          p.vy = 1.4 + Math.random() * 2.2;
          p.duration = 0.4 + Math.random() * 0.4;
          p.lifetime = p.duration;
          nextMudParticle = (nextMudParticle + 1) % MAX_MUD_PARTICLES;
        }
      }
      mudPositionAttribute.needsUpdate = true;
      mudColorAttribute.needsUpdate = true;
    }

    // Start on a straight section, facing the road in its normal forward direction.
    const initialIndex = TrackLayout.nearestIndex(positions, TrackLayout.SPAWN);
    const initial = positions[initialIndex];
    let driver = {
      x: initial.x, z: initial.z,
      yaw: Math.atan2(-directions[initialIndex].x, -directions[initialIndex].z),
      speed: 0,
    };
    let cameraMode = "inside";
    let lapTracker = TrackProgress.create(SAMPLE_COUNT, startIndex, initialIndex);
    const lapRecords = LapTimes.createStore(TrackLayout);
    const circuitKey = LapTimes.circuitKey(TrackLayout);
    let lapTimer = LapTimes.initial(SAMPLE_COUNT, lapTracker.progress);
    let timedLapCount = 0;
    let gameMode = "free";
    let raceState = null;
    let freeSession = null;
    let lapHold = null; // {ms, rank, remainingSeconds}; top chrono only, for 2s.
    let resultRefreshCooldown = 0;
    let menuOpen = true;
    let scoresOpen = false;
    let hasActiveSession = false;
    let falling = false, fall = null, respawnIndex = initialIndex;

    function refreshBests() {
      const records = lapRecords.top();
      bestLabels.forEach((label, index) => {
        label.textContent = records[index] ? LapTimes.format(records[index].ms) : "—";
      });
    }
    function bestPosition(ms) {
      return LapTimes.qualifyingRank(lapRecords.top(), ms);
    }

    function holdFinishedLap(ms, rank = null) {
      // The stopwatch continues behind this short HUD-only display.
      lapHold = { ms, rank, remainingSeconds: 2 };
      chronoBox.classList.add("is-lap-hold");
      refreshChrono();
    }

    function clearLapHold() {
      lapHold = null;
      chronoBox.classList.remove("is-lap-hold");
      refreshChrono();
    }

    function tickLapHold(dt) {
      if (!lapHold) return;
      lapHold.remainingSeconds -= dt;
      if (lapHold.remainingSeconds <= 0) clearLapHold();
    }

    function refreshChrono() {
      chronoLabel.textContent = lapHold
        ? LapTimes.format(lapHold.ms)
        : lapTimer.running ? LapTimes.format(lapTimer.elapsedMs) : "—";
      chronoTitle.textContent = lapHold ? "TOUR TERMINÉ" : "TOUR EN COURS";
      chronoRank.textContent = lapHold?.rank
        ? ["", "1er meilleur temps", "2e meilleur temps", "3e meilleur temps"][lapHold.rank]
        : "";
      chronoRank.hidden = !lapHold?.rank;
      const delta = lapTimer.delta;
      deltaValue.textContent = LapTimes.formatDelta(delta);
      splitLabel.textContent = "S" + (lapTimer.splitNumber || 1);
      deltaLabel.classList.toggle("is-faster", delta !== null && delta < -10);
      deltaLabel.classList.toggle("is-slower", delta !== null && delta > 10);
      deltaLabel.classList.toggle("is-even", delta !== null && Math.abs(delta) <= 10);
    }
    function syncRaceCars() {
      const active = gameMode === "race" && raceState !== null;
      for (const [id, mesh] of opponentMeshes) {
        const ai = active ? raceState.opponents.find((entry) => entry.id === id) : null;
        mesh.visible = Boolean(ai);
        if (!ai) continue;
        // The track is parametrized by arc length. Use it for all AI vehicles,
        // including on the final long straight.
        const t = (((startIndex / SAMPLE_COUNT + ai.progress / trackLength) % 1) + 1) % 1;
        const center = curve.getPointAt(t);
        const forward = curve.getTangentAt(t).normalize();
        const sideX = -forward.z, sideZ = forward.x;
        mesh.position.set(center.x + sideX * ai.lateral, 0.14,
          center.z + sideZ * ai.lateral);
        mesh.rotation.y = Math.atan2(-forward.x, -forward.z);
      }
    }

    function refreshClassification() {
      if (!raceState) return;
      const rows = Race.classification(raceState);
      const fragment = document.createDocumentFragment();
      for (const row of rows) {
        const tr = document.createElement("tr");
        const isPlayer = row.id === "player";
        if (isPlayer) tr.classList.add("is-player");
        if (!Number.isFinite(row.finishTime)) tr.classList.add("is-pending");
        const rank = document.createElement("td");
        rank.textContent = String(row.rank);
        const vehicle = document.createElement("td");
        if (!isPlayer) {
          const opponent = raceState.opponents.find((ai) => ai.id === row.id);
          const swatch = document.createElement("span");
          swatch.className = "gcv-car-swatch";
          swatch.style.backgroundColor = "#" + opponent.color.toString(16).padStart(6, "0");
          vehicle.append(swatch);
        }
        vehicle.append(document.createTextNode(isPlayer
          ? "Vous · n° 9" : "Voiture n° " + (10 + row.id)));
        const time = document.createElement("td");
        time.textContent = Number.isFinite(row.finishTime)
          ? LapTimes.format(row.finishTime * 1000) : "En course…";
        const gap = document.createElement("td");
        gap.textContent = Number.isFinite(row.gap)
          ? "+" + row.gap.toFixed(2) + " s" : "—";
        tr.append(rank, vehicle, time, gap);
        fragment.append(tr);
      }
      raceResultsBody.replaceChildren(fragment);
      const count = rows.filter((row) => Number.isFinite(row.finishTime)).length;
      raceResultsStatus.textContent = count === Race.GRID_COUNT
        ? "Les 10 voitures ont terminé." : count + " / 10 voitures à l’arrivée · les autres poursuivent la course.";
    }

    function syncRaceHud() {
      const racing = gameMode === "race" && raceState !== null;
      freeModeButton.classList.toggle("is-selected", !racing);
      raceModeButton.classList.toggle("is-selected", racing);
      freeModeButton.setAttribute("aria-pressed", String(!racing));
      raceModeButton.setAttribute("aria-pressed", String(racing));
      racePositionBox.hidden = !racing;
      sessionModeLabel.textContent = racing ? "Course · 10 voitures" : "Essais libres · N° 9";
      lapCountLabel.firstChild.textContent = racing ? "Tours en course : " : "Tours chronométrés : ";
      restartButton.textContent = racing ? "↻ Rejouer" : "↻ Départ";
      if (!racing) {
        raceOverlay.hidden = true;
        return;
      }
      racePositionValue.textContent = String(Race.position(raceState)) + "ᵉ";
      raceLapLabel.textContent = raceState.phase === "finished"
        ? "2 tours terminés" : "Tour " + Race.currentLap(raceState) + "/2";
      lapLabel.textContent = String(Math.min(Race.LAPS,
        Math.max(0, Math.floor(Math.max(0, raceState.playerProgress) / trackLength))));
      const phase = raceState.phase;
      raceOverlay.classList.toggle("is-results", phase === "finished");
      raceOverlay.hidden = phase === "racing" ||
        (phase === "finished" && lapHold !== null);
      raceOverlayActions.hidden = phase !== "finished";
      raceResults.hidden = phase !== "finished";
      if (phase === "finished" && resultRefreshCooldown <= 0) {
        refreshClassification();
        resultRefreshCooldown = 0.25;
      }
      if (phase === "staging") {
        raceOverlayTitle.textContent = "Prépare-toi !";
        raceOverlaySubtitle.textContent = "Les voitures se mettent en place…";
      } else if (phase === "countdown") {
        raceOverlayTitle.textContent = String(Math.max(1, Math.ceil(raceState.countdown)));
        raceOverlaySubtitle.textContent = "Départ dans " +
          String(Math.max(1, Math.ceil(raceState.countdown))) + "…";
      } else if (phase === "finished") {
        raceOverlayTitle.textContent = "Arrivée !";
        raceOverlaySubtitle.textContent =
          "Position : " + Race.position(raceState) + " / 10 · " +
          LapTimes.format(raceState.raceTime * 1000);
      }
    }

    function syncMenu() {
      homePanel.hidden = !menuOpen;
      stage.classList.toggle("gcv-in-menu", menuOpen);
      resumeButton.hidden = !hasActiveSession;
      resumeButton.textContent = gameMode === "race"
        ? "Reprendre la course" : "Reprendre les essais libres";
      scoresFrame.hidden = !scoresOpen;
      stage.classList.toggle("gcv-scores-open", scoresOpen);
    }

    function resumeGame() {
      menuOpen = false;
      hasActiveSession = true;
      syncMenu();
      lastFrame = performance.now();
      if (binding) binding.changed();
    }

    function openMenu() {
      clearControls();
      menuOpen = true;
      syncMenu();
      if (binding && hasActiveSession) binding.changed();
    }

    function openScores() {
      clearControls();
      scoresOpen = true;
      syncMenu();
      scoresFrame.src = "../../scores.html?game=gcv&from=gcv";
      if (binding && hasActiveSession) binding.changed();
    }

    function closeScores() {
      scoresOpen = false;
      scoresFrame.hidden = true;
      scoresFrame.removeAttribute("src");
      syncMenu();
      lastFrame = performance.now();
    }

    resumeButton.addEventListener("click", resumeGame);
    menuButton.addEventListener("click", openMenu);
    scoresButton.addEventListener("click", openScores);
    menuScoresButton.addEventListener("click", openScores);
    window.addEventListener("message", (event) => {
      if (scoresOpen && event.origin === location.origin &&
          event.source === scoresFrame.contentWindow &&
          event.data?.type === "gmr-scores-back") closeScores();
    });

    refreshBests();
    refreshChrono();
    let lastFrame = performance.now(), autosaveElapsed = 0, mapElapsed = 0;
    let initializedCamera = false;
    let binding = null;

    function closestRoad(x, z) {
      let index = 0, distanceSquared = Infinity;
      for (let i = 0; i < SAMPLE_COUNT; i++) {
        const dx = x - positions[i].x;
        const dz = z - positions[i].z;
        const squared = dx * dx + dz * dz;
        if (squared < distanceSquared) {
          index = i;
          distanceSquared = squared;
        }
      }
      return { index, distanceSquared };
    }

    function snapBack(index) {
      const center = positions[index];
      driver.x = center.x;
      driver.z = center.z;
      driver.yaw = Math.atan2(-directions[index].x, -directions[index].z);
      driver.speed = 0;
      driver.reverseHold = 0;
      falling = false;
      fall = null;
      // A fall only wastes time. Keep elapsed time, the three sectors
      // already reached and the current reference delta intact. Relocation
      // changes no accumulated lap progress and cannot count as a shortcut.
      lapTracker = TrackProgress.relocate(lapTracker, index);
      refreshChrono();
      announce("");
      if (binding) binding.changed();
    }

    const keys = new Set();
    let steerPointer = null, touchSteer = 0;
    const gasPointers = new Set(), brakePointers = new Set();

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    function refreshPad() {
      const steering = steerPointer === null
        ? ((keys.has("arrowright") || keys.has("d") ? 1 : 0) -
            (keys.has("arrowleft") || keys.has("a") ? 1 : 0))
        : touchSteer;
      knob.style.left = (50 + clamp(steering, -1, 1) * 43) + "%";
      pad.setAttribute("aria-valuenow", String(Math.round(steering * 100)));
      pad.setAttribute("aria-valuetext", steering < -0.1 ? "Gauche" : steering > 0.1 ? "Droite" : "Tout droit");
      return steering;
    }
    function updateSteering(event) {
      const rect = pad.getBoundingClientRect();
      touchSteer = clamp(2 * (event.clientX - rect.left) / rect.width - 1, -1, 1);
      if (Math.abs(touchSteer) < 0.08) touchSteer = 0;
      refreshPad();
    }
    pad.addEventListener("pointerdown", (event) => {
      if (steerPointer !== null || (event.pointerType === "mouse" && event.button !== 0)) return;
      event.preventDefault();
      steerPointer = event.pointerId;
      pad.setPointerCapture(event.pointerId);
      updateSteering(event);
    });
    pad.addEventListener("pointermove", (event) => {
      if (event.pointerId === steerPointer) updateSteering(event);
    });
    function finishSteer(event) {
      if (event.pointerId !== steerPointer) return;
      steerPointer = null;
      touchSteer = 0;
      refreshPad();
    }
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      pad.addEventListener(type, finishSteer);
    }

    function bindPedal(button, pointerSet) {
      function sync() { button.classList.toggle("is-active", pointerSet.size !== 0); }
      button.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        event.preventDefault();
        pointerSet.add(event.pointerId);
        button.setPointerCapture(event.pointerId);
        sync();
      });
      function release(event) {
        pointerSet.delete(event.pointerId);
        sync();
      }
      for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
        button.addEventListener(type, release);
      }
    }
    bindPedal(gasButton, gasPointers);
    bindPedal(brakeButton, brakePointers);

    const drivingKeys = new Set(["arrowleft", "arrowright", "arrowup", "arrowdown", "a", "d", "w", "s"]);
    window.addEventListener("keydown", (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const key = event.key.toLowerCase();
      if (!drivingKeys.has(key)) return;
      event.preventDefault();
      keys.add(key);
      refreshPad();
    });
    window.addEventListener("keyup", (event) => {
      const key = event.key.toLowerCase();
      if (!drivingKeys.has(key)) return;
      keys.delete(key);
      refreshPad();
    });
    function clearControls() {
      keys.clear();
      gasPointers.clear();
      brakePointers.clear();
      steerPointer = null;
      touchSteer = 0;
      gasButton.classList.remove("is-active");
      brakeButton.classList.remove("is-active");
      refreshPad();
    }
    window.addEventListener("blur", clearControls);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) clearControls();
    });
    // Prevent a context menu from appearing after long touches.
    stage.addEventListener("contextmenu", (event) => event.preventDefault());

    function startRace() {
      // Preserve a running time trial when switching to race mode.
      if (gameMode === "free") freeSession = snapshot();
      clearControls();
      gameMode = "race";
      raceState = Race.create(trackLength);
      clearLapHold();
      resultRefreshCooldown = 0;
      const grid = Race.gridSlot(Race.PLAYER_SLOT);
      const start = startCenter.clone()
        .addScaledVector(directions[startIndex], -grid.distance)
        .addScaledVector(startSide, grid.lateral);
      const current = closestRoad(start.x, start.z).index;
      driver = { x: start.x, z: start.z, yaw: startYaw, speed: 0, reverseHold: 0 };
      falling = false;
      fall = null;
      respawnIndex = current;
      lapTracker = TrackProgress.create(SAMPLE_COUNT, startIndex, current);
      lapTimer = LapTimes.initial(SAMPLE_COUNT, lapTracker.progress);
      timedLapCount = 0;
      announce("");
      initializedCamera = false;
      syncRaceCars();
      syncRaceHud();
      refreshChrono();
      updateCar(0);
      updateCamera(0);
      drawMap();
      resumeGame();
    }

    function chooseFree() {
      if (gameMode === "free") { resumeGame(); return; }
      clearLapHold();
      resultRefreshCooldown = 0;
      const priorFree = freeSession;
      clearControls();
      gameMode = "free";
      raceState = null;
      freeSession = null;
      if (priorFree && priorFree.circuitKey === circuitKey) {
        restore(priorFree);
      } else {
        restartNearFinish();
      }
      syncRaceCars();
      syncRaceHud();
      refreshCameraButton();
      refreshChrono();
      initializedCamera = false;
      updateCar(0);
      updateCamera(0);
      drawMap();
      resumeGame();
    }
    freeModeButton.addEventListener("click", chooseFree);
    raceModeButton.addEventListener("click", startRace);
    replayButton.addEventListener("click", startRace);
    raceFreeButton.addEventListener("click", chooseFree);

    function restartNearFinish() {
      if (gameMode === "race") { startRace(); return; }
      clearLapHold();
      // Put the car exactly ten metres before the visible finish line,
      // facing in the racing direction. This resets the CURRENT attempt,
      // not the permanent top-three lap records.
      const beforeLine = startCenter.clone().addScaledVector(directions[startIndex], -10);
      const index = closestRoad(beforeLine.x, beforeLine.z).index;
      clearControls();
      driver = { x: beforeLine.x, z: beforeLine.z, yaw: startYaw,
        speed: 0, reverseHold: 0 };
      falling = false;
      fall = null;
      respawnIndex = index;
      lapTracker = TrackProgress.create(SAMPLE_COUNT, startIndex, index);
      lapTimer = LapTimes.initial(SAMPLE_COUNT, lapTracker.progress);
      timedLapCount = 0;
      lapLabel.textContent = "0";
      refreshChrono();
      announce("");
      initializedCamera = false;
      updateCar(0);
      updateCamera(0);
      drawMap();
      if (binding) binding.changed();
    }
    restartButton.addEventListener("click", restartNearFinish);

    function refreshCameraButton() {
      const outside = cameraMode === "outside";
      cameraButton.textContent = outside ? "Caméra : extérieure" : "Caméra : intérieure";
      cameraButton.setAttribute("aria-label", outside ? "Passer en vue intérieure" : "Passer en vue extérieure");
      cabin.visible = true; // Roof and pillars must stay visible in cockpit view.
      dashboard.visible = !outside;
      initializedCamera = false;
    }
    cameraButton.addEventListener("click", () => {
      cameraMode = cameraMode === "inside" ? "outside" : "inside";
      refreshCameraButton();
      if (binding) binding.changed();
    });

    function refreshFullscreen() {
      const full = document.fullscreenElement === stage;
      for (const button of [fullscreenButton, menuFullscreenButton]) {
        button.textContent = full ? "⤢ Écran normal" : "⛶ Plein écran";
        button.setAttribute("aria-label",
          full ? "Quitter le plein écran" : "Passer en plein écran");
      }
    }
    async function toggleFullscreen() {
      try {
        if (document.fullscreenElement === stage) {
          await document.exitFullscreen();
        } else if (stage.requestFullscreen) {
          await stage.requestFullscreen();
        } else {
          menuFullscreenButton.textContent = "Plein écran non disponible";
          announce("Plein écran non disponible dans ce navigateur.");
        }
      } catch (error) {
        console.warn("Fullscreen failed:", error);
        menuFullscreenButton.textContent = "Plein écran refusé";
        announce("Le plein écran a été refusé par le navigateur.");
      }
    }
    fullscreenButton.addEventListener("click", toggleFullscreen);
    menuFullscreenButton.addEventListener("click", toggleFullscreen);
    document.addEventListener("fullscreenchange", refreshFullscreen);
    refreshFullscreen();

    const map = mapCanvas.getContext("2d");
    const bounds = positions.slice(0, SAMPLE_COUNT).reduce((acc, p) => ({
      minX: Math.min(acc.minX, p.x), maxX: Math.max(acc.maxX, p.x),
      minZ: Math.min(acc.minZ, p.z), maxZ: Math.max(acc.maxZ, p.z),
    }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
    const mapWidth = mapCanvas.width, mapHeight = mapCanvas.height;
    const mapScale = Math.min((mapWidth - 74) / (bounds.maxX - bounds.minX),
      (mapHeight - 56) / (bounds.maxZ - bounds.minZ));
    const mapCenterX = (bounds.minX + bounds.maxX) / 2;
    const mapCenterZ = (bounds.minZ + bounds.maxZ) / 2;
    const toMap = (x, z) => [
      mapWidth / 2 + (x - mapCenterX) * mapScale,
      mapHeight / 2 + (z - mapCenterZ) * mapScale,
    ];

    // Pre-render the static satellite-style minimap just once. Colors match
    // sea, sandy islands, muddy roadway and light earth safety shoulders.
    const mapBackground = document.createElement("canvas");
    mapBackground.width = mapWidth;
    mapBackground.height = mapHeight;
    const satellite = mapBackground.getContext("2d");
    if (satellite) {
      const waterGradient = satellite.createLinearGradient(0, 0, 0, mapHeight);
      waterGradient.addColorStop(0, "#376e7f");
      waterGradient.addColorStop(1, "#28566b");
      satellite.fillStyle = waterGradient;
      satellite.fillRect(0, 0, mapWidth, mapHeight);

      function islandCircle(x, y, radius, color) {
        satellite.beginPath();
        satellite.arc(x, y, radius, 0, Math.PI * 2);
        satellite.fillStyle = color;
        satellite.fill();
      }
      for (const island of islands) {
        const [x, y] = toMap(island.x, island.z);
        islandCircle(x, y, island.rockRadius * mapScale, "#485b64");
        islandCircle(x - 2, y - 2, island.rockRadius * mapScale * 0.72, "#71828a");
      }

      function drawCourse(width, color) {
        satellite.beginPath();
        positions.forEach((p, index) => {
          const [x, y] = toMap(p.x, p.z);
          if (index === 0) satellite.moveTo(x, y);
          else satellite.lineTo(x, y);
        });
        satellite.closePath();
        satellite.lineCap = "round";
        satellite.lineJoin = "round";
        satellite.strokeStyle = color;
        satellite.lineWidth = width;
        satellite.stroke();
      }
      drawCourse(OUTER_HALF_WIDTH * 2 * mapScale + 3, "#534c3e");
      drawCourse(OUTER_HALF_WIDTH * 2 * mapScale, "#b29871");
      drawCourse(ROAD_HALF_WIDTH * 2 * mapScale, "#856044");

      // Uneven muddy details visible from above; no painted centerline.
      for (let i = 0; i < SAMPLE_COUNT; i += 9) {
        const position = positions[i], normal = sides[i];
        const offset = ((i * 17) % 19 - 9) * 0.65;
        const [x, y] = toMap(position.x + normal.x * offset,
          position.z + normal.z * offset);
        islandCircle(x, y, 1.6 + (i % 3), "#6f523c");
      }

      // Three visual sector checkpoints correspond exactly to the timer.
      LapTimes.SPLIT_FRACTIONS.forEach((fraction, index) => {
        const splitIndex = (startIndex + Math.round(SAMPLE_COUNT * fraction)) % SAMPLE_COUNT;
        const [sx, sy] = toMap(positions[splitIndex].x, positions[splitIndex].z);
        islandCircle(sx, sy, 7, "#15354d");
        islandCircle(sx, sy, 5, "#f8d690");
        satellite.font = "bold 9px system-ui";
        satellite.textAlign = "center";
        satellite.textBaseline = "middle";
        satellite.fillStyle = "#1d2834";
        satellite.fillText(String(index + 1), sx, sy);
      });

      // Finish line marker: a short contrasting crossing and flag, separate
      // from roadway lane markings.
      const [fx, fy] = toMap(startCenter.x, startCenter.z);
      satellite.save();
      satellite.translate(fx, fy);
      satellite.rotate(Math.atan2(startSide.z, startSide.x));
      satellite.fillStyle = "#332b28";
      satellite.fillRect(-ROAD_HALF_WIDTH * mapScale, -2, ROAD_HALF_WIDTH * 2 * mapScale, 4);
      satellite.fillStyle = "#ebd2a0";
      for (let i = 0; i < 8; i += 2) {
        satellite.fillRect(-ROAD_HALF_WIDTH * mapScale + i * ROAD_HALF_WIDTH * mapScale / 4,
          -2, ROAD_HALF_WIDTH * mapScale / 4, 2);
      }
      satellite.restore();
      satellite.fillStyle = "#ffffff";
      satellite.strokeStyle = "#243f4e";
      satellite.lineWidth = 3;
      satellite.font = "bold 17px system-ui";
      satellite.strokeText("⚑", fx + 9, fy - 10);
      satellite.fillText("⚑", fx + 9, fy - 10);
    }

    function drawMap() {
      if (!map) return;
      map.clearRect(0, 0, mapWidth, mapHeight);
      if (satellite) map.drawImage(mapBackground, 0, 0);
      if (gameMode === "race" && raceState) {
        // Tiny opponent markers on the same map as the player.
        for (const ai of raceState.opponents) {
          const mesh = opponentMeshes.get(ai.id);
          if (!mesh) continue;
          const [ax, ay] = toMap(mesh.position.x, mesh.position.z);
          map.beginPath();
          map.arc(ax, ay, 4.4, 0, Math.PI * 2);
          map.fillStyle = "#" + ai.color.toString(16).padStart(6, "0");
          map.strokeStyle = "#152e42";
          map.lineWidth = 1.5;
          map.fill();
          map.stroke();
        }
      }
      const x = falling && fall ? fall.x : driver.x;
      const z = falling && fall ? fall.z : driver.z;
      const [px, py] = toMap(x, z);
      map.save();
      map.shadowColor = "#16212a";
      map.shadowBlur = 7;
      map.fillStyle = "#ed4857";
      map.strokeStyle = "#ffffff";
      map.lineWidth = 3;
      map.beginPath();
      map.arc(px, py, 8, 0, Math.PI * 2);
      map.fill();
      map.stroke();
      map.shadowBlur = 0;
      map.beginPath();
      map.moveTo(px, py);
      map.lineTo(px - Math.sin(driver.yaw) * 17, py - Math.cos(driver.yaw) * 17);
      map.stroke();
      map.restore();
    }

    function resize() {
      const width = Math.max(1, stage.clientWidth);
      const height = Math.max(1, stage.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = width < height ? 77 : 72;
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", resize);
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(resize).observe(stage);
    resize();

    function snapshot() {
      // A saved fall resumes at the nearest safe edge instead of mid-air.
      const safe = falling ? positions[respawnIndex] : driver;
      return {
        x: safe.x, z: safe.z,
        yaw: falling ? Math.atan2(-directions[respawnIndex].x, -directions[respawnIndex].z) : driver.yaw,
        speed: falling ? 0 : driver.speed,
        reverseHold: falling ? 0 : driver.reverseHold,
        camera: cameraMode,
        progress: lapTracker.progress,
        laps: lapTracker.laps,
        timedLaps: timedLapCount,
        // On refresh during a fall the car respawns safely, but the active
        // stopwatch must continue from the preserved elapsed time.
        lapTimer,
        mode: gameMode,
        race: gameMode === "race" ? raceState : null,
        freeSession: gameMode === "race" ? freeSession : null,
        circuitKey,
        layoutVersion: TrackLayout.VERSION,
      };
    }
    function restore(saved) {
      if (!saved || typeof saved !== "object") return;
      // The redesigned, longer circuit invalidates prior saved coordinates
      // and lap progress; retain the view but start a clean free-drive session.
      if (saved.circuitKey !== circuitKey ||
          saved.layoutVersion !== TrackLayout.VERSION) {
        cameraMode = saved.camera === "outside" ? "outside" : "inside";
        return;
      }
      const valid = ["x", "z", "yaw", "speed"].every((key) => Number.isFinite(saved[key]));
      if (valid && Math.abs(saved.x) < 220 && Math.abs(saved.z) < 220) {
        driver = {
          x: saved.x, z: saved.z, yaw: saved.yaw,
          speed: clamp(saved.speed, -Physics.REVERSE_MAX_SPEED, Physics.MAX_SPEED),
          reverseHold: clamp(Number(saved.reverseHold) || 0, 0, Physics.REVERSE_DELAY),
        };
        const near = closestRoad(driver.x, driver.z);
        if (near.distanceSquared > OUTER_HALF_WIDTH * OUTER_HALF_WIDTH) {
          snapBack(near.index);
        }
      }
      const nearestIndex = closestRoad(driver.x, driver.z).index;
      lapTracker = TrackProgress.create(SAMPLE_COUNT, startIndex, nearestIndex, saved);
      timedLapCount = Number.isSafeInteger(saved.timedLaps) && saved.timedLaps >= 0
        ? saved.timedLaps : 0;
      lapTimer = LapTimes.restore(saved.lapTimer, SAMPLE_COUNT, lapTracker.progress);
      lapLabel.textContent = String(timedLapCount);
      refreshChrono();
      cameraMode = saved.camera === "outside" ? "outside" : "inside";
      const restoredRace = saved.mode === "race"
        ? Race.restore(saved.race, trackLength) : null;
      gameMode = restoredRace ? "race" : "free";
      raceState = restoredRace;
      freeSession = restoredRace && saved.freeSession?.circuitKey === circuitKey
        ? saved.freeSession : null;
      syncRaceCars();
      syncRaceHud();
      hasActiveSession = true;
    }
    binding = window.GameState.create("gcv").bind({ snapshot, restore });
    syncRaceCars();
    syncRaceHud();
    syncMenu(); // Always open on the home screen, even for saved games.
    refreshCameraButton();

    function updateCar(dt, fallDt = dt) {
      if ((menuOpen || scoresOpen) && dt > 0) return;
      const brakePressed = brakePointers.size > 0 || keys.has("arrowdown") || keys.has("s");
      let mudSkidIntensity = 0;
      let raceDistance = 0;
      const mayDrive = gameMode === "free" || raceState?.phase === "racing";
      if (falling) {
        // Falling is part of this timed lap. Count only the actual remaining
        // fall duration (not a potential huge background-tab frame).
        const fallingStep = Math.min(fall.remaining, fallDt);
        lapTimer = LapTimes.elapse(lapTimer, fallingStep * 1000);
        fall = Physics.advanceFall(fall, fallingStep);
        if (fall.remaining <= 0.000001) {
          snapBack(respawnIndex);
        } else {
          announce("Chute dans le vide ! Retour dans " + fall.remaining.toFixed(1) + " s");
        }
      } else if (mayDrive) {
        const steer = refreshPad();
        const accelerate = gasPointers.size > 0 || keys.has("arrowup") || keys.has("w");
        const brake = brakePressed;
        // The dirt course now handles like the previous paved road, including
        // its safety shoulders. Only truly extreme steering emits particles.
        const previousPosition = { x: driver.x, z: driver.z };
        driver = Physics.advance(driver, { steer, accelerate, brake }, dt);
        mudSkidIntensity = Physics.skidIntensity(driver.speed, steer);
        const nearest = closestRoad(driver.x, driver.z);
        if (nearest.distanceSquared > OUTER_HALF_WIDTH * OUTER_HALF_WIDTH) {
          // Keep the speed and forward momentum in the air. Begin both the
          // gravity animation and the two-second countdown at this instant.
          falling = true;
          // Keep the same timed lap: the recovery delay is the penalty.
          lapTimer = LapTimes.elapse(lapTimer, dt * 1000);
          respawnIndex = nearest.index;
          // Advance the fall on this very first rendering frame: no
          // horizontal glide before the car starts dropping visibly.
          fall = Physics.advanceFall(Physics.startFall(driver), dt);
          announce("Chute dans le vide ! Retour dans " + fall.remaining.toFixed(1) + " s");
        } else {
          const progressBefore = lapTracker.progress;
          lapTracker = TrackProgress.advance(lapTracker, nearest.index, SAMPLE_COUNT);
          // Forward distance tracked independently from the existing time-trial
          // stopwatch. Reversing and respawning never award race distance.
          raceDistance = Math.max(0, lapTracker.progress - progressBefore) *
            trackLength / SAMPLE_COUNT;
          // Sector checkpoints use along-track samples; the finish line uses
          // the car's REAL movement across the painted line. A skipped road
          // sample must never prevent the chronometer from starting.
          const timing = LapTimes.advance(lapTimer, progressBefore, lapTracker.progress,
            fallDt * 1000, SAMPLE_COUNT, lapRecords.best(), false);
          lapTimer = timing.state;
          const crossing = LapTimes.finishCrossing(
            previousPosition, driver, startCenter, directions[startIndex], OUTER_HALF_WIDTH);
          if (crossing !== null) {
            const nextFinishProgress = lapTimer.running
              ? lapTimer.startAt + SAMPLE_COUNT
              : Math.max(lapTimer.startAt,
                (Math.floor(progressBefore / SAMPLE_COUNT) + 1) * SAMPLE_COUNT);
            const finish = LapTimes.crossFinish(
              lapTimer, crossing, fallDt * 1000, SAMPLE_COUNT, nextFinishProgress);
            lapTimer = finish.state;
            lapTracker = TrackProgress.syncFinish(
              lapTracker, lapTimer.startAt, nearest.index, SAMPLE_COUNT);
            timing.events.push(...finish.events);
            if (binding) binding.changed();
          }
          for (const event of timing.events) {
            if (event.type === "lap") {
              const rank = bestPosition(event.ms);
              if (lapRecords.record(event.ms, event.splits)) {
                timedLapCount++;
                lapLabel.textContent = String(timedLapCount);
                refreshBests();
                holdFinishedLap(event.ms, rank);
                if (binding) binding.changed();
              }
            }
          }
        }
      }

      if (gameMode === "race" && raceState) {
        const wasRacing = raceState.phase === "racing";
        const previousLapCount = raceState.playerLapTimes?.length || 0;
        raceState = Race.advance(raceState, dt, raceDistance);
        const completedLaps = raceState.playerLapTimes?.length || 0;
        if (completedLaps > previousLapCount && timedLapCount < completedLaps) {
          // A fall or a missed sector can invalidate the time-trial record,
          // but the actual race lap must always get a time announcement.
          const lapMs = raceState.playerLapTimes[completedLaps - 1] * 1000;
          holdFinishedLap(lapMs);
        }
        if (wasRacing && raceState.phase === "finished") {
          resultRefreshCooldown = 0;
          driver.speed = 0;
          clearControls();
          if (binding) binding.changed();
        }
        syncRaceCars();
        syncRaceHud();
      }

      if (falling) {
        car.position.set(fall.x, fall.y, fall.z);
        // Nose dips as the car falls; this is an animation, not road steering.
        car.rotation.set(Math.min(0.68, fall.elapsed * 0.42), driver.yaw, 0, "YXZ");
      } else {
        car.position.set(driver.x, 0.14, driver.z);
        car.rotation.set(0, driver.yaw, 0, "YXZ");
      }
      for (const wheel of wheelPivots) wheel.rotation.x -= driver.speed * dt / 0.46;
      car.updateMatrixWorld(true);
      brakeLights.emissiveIntensity = brakePressed ? 3.8 : 0.15;
      for (const glow of rearBrakeGlows) glow.intensity = brakePressed ? 3.5 : 0;
      tickMudParticles(dt, falling ? 0 : mudSkidIntensity);
      speedLabel.textContent = String(Math.round(Math.abs(driver.speed) * 3.6));
      gearLabel.textContent = driver.speed < -0.02 ? "R" : "";
      refreshChrono();
    }

    function updateCamera(dt) {
      const inside = cameraMode === "inside";
      const desiredPosition = car.localToWorld(inside
        ? new THREE.Vector3(-0.42, 1.51, 0.34) // Higher view, fixed above the lowered wheel.
        : new THREE.Vector3(0, 4.5, 9.7));
      const desiredTarget = car.localToWorld(inside
        ? new THREE.Vector3(-0.42, 1.49, -14)
        : new THREE.Vector3(0, 1.13, -8));
      if (inside) {
        // Fixed cockpit mount: no elastic camera movement, even while turning.
        camera.position.copy(desiredPosition);
      } else {
        const blend = initializedCamera ? 1 - Math.exp(-8 * dt) : 1;
        camera.position.lerp(desiredPosition, blend);
      }
      camera.lookAt(desiredTarget);
      initializedCamera = true;
    }

    function frame(now) {
      requestAnimationFrame(frame);
      const realDt = Math.max(0, (now - lastFrame) / 1000);
      const dt = Math.min(realDt, 0.05);
      lastFrame = now;
      if (document.hidden) return;
      if (!menuOpen && !scoresOpen) {
        resultRefreshCooldown = Math.max(0, resultRefreshCooldown - dt);
        updateCar(dt, realDt);
        tickLapHold(realDt);
        refreshChrono();
      }
      updateCamera(dt);
      autosaveElapsed += dt;
      if (hasActiveSession && autosaveElapsed >= 1.5) {
        autosaveElapsed = 0;
        binding.changed();
      }
      mapElapsed += dt;
      if (mapElapsed >= 0.09) {
        mapElapsed = 0;
        drawMap();
      }
      renderer.render(scene, camera);
    }

    drawMap();
    updateCar(0);
    updateCamera(0);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
})();
