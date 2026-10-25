"use strict";

// Lightweight driving prototype. Three.js is imported from a pinned CDN version so GMR
// remains a static GitHub Pages site without an application build pipeline.
(async () => {
  const stage = document.getElementById("gcv-stage");
  const sceneHost = document.getElementById("gcv-scene");
  const speedLabel = document.getElementById("speed-value");
  const gearLabel = document.getElementById("gear-value");
  const lapLabel = document.getElementById("lap-value");
  const cameraButton = document.getElementById("camera-button");
  const fullscreenButton = document.getElementById("fullscreen-button");
  const notice = document.getElementById("gcv-notice");
  const pad = document.getElementById("steer-pad");
  const knob = document.getElementById("steer-knob");
  const gasButton = document.getElementById("accelerate-button");
  const brakeButton = document.getElementById("brake-button");
  const mapCanvas = document.getElementById("mini-map");
  const Physics = window.GcvPhysics;
  const TrackProgress = window.GcvTrackProgress;

  function announce(message) {
    notice.textContent = message;
    notice.hidden = !message;
  }

  try {
    if (!Physics || !TrackProgress) throw new Error("Les modules de conduite sont introuvables.");
    const THREE = await import("https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js");
    start(THREE);
  } catch (error) {
    console.error("GCV cannot start:", error);
    announce("Impossible de charger le jeu 3D. Vérifie ta connexion et recharge la page.");
  }

  function start(THREE) {
    const ROAD_HALF_WIDTH = 9;
    const GRAVEL_WIDTH = 6; // Six metres of gravel on each side of the asphalt.
    const OUTER_HALF_WIDTH = ROAD_HALF_WIDTH + GRAVEL_WIDTH;
    const SAMPLE_COUNT = 420;
    const CURVE_POINTS = [
      [35, 68], [35, 30], [37, -22], [21, -54],
      [-15, -62], [-43, -44], [-50, -9], [-40, 19],
      [-46, 51], [-21, 76], [9, 81],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z));
    const curve = new THREE.CatmullRomCurve3(CURVE_POINTS, true, "catmullrom", 0.55);
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
    scene.fog = new THREE.Fog(0x97cfe4, 145, 320);
    scene.add(new THREE.HemisphereLight(0xeaf8ff, 0x526d6c, 2.0));
    const sunlight = new THREE.DirectionalLight(0xffeed5, 2.35);
    sunlight.position.set(-70, 120, 45);
    scene.add(sunlight);

    const camera = new THREE.PerspectiveCamera(72, 1, 0.08, 460);
    const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x303944, roughness: 0.95, side: THREE.DoubleSide });
    const gravelMaterial = new THREE.MeshStandardMaterial({ color: 0xb5a388, roughness: 1, side: THREE.DoubleSide });
    const stripeMaterial = new THREE.MeshStandardMaterial({ color: 0xf6f3dd, roughness: 0.8, side: THREE.DoubleSide });

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

    strip(0, OUTER_HALF_WIDTH, 0.02, gravelMaterial);
    strip(0, ROAD_HALF_WIDTH, 0.07, roadMaterial);

    // Sparse, low-poly stones on the 2 m gravel shoulders. Instancing keeps
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
    strip(-ROAD_HALF_WIDTH + 0.38, 0.14, 0.084, stripeMaterial);
    strip(ROAD_HALF_WIDTH - 0.38, 0.14, 0.084, stripeMaterial);

    const markerMaterial = new THREE.MeshStandardMaterial({ color: 0xf7e9a4, roughness: 1 });
    for (let i = 0; i < SAMPLE_COUNT; i += 17) {
      const a = positions[i], b = positions[Math.min(i + 7, SAMPLE_COUNT)];
      const marker = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.022, a.distanceTo(b)),
        markerMaterial
      );
      marker.position.copy(a).add(b).multiplyScalar(0.5);
      marker.position.y = 0.10;
      marker.rotation.y = Math.atan2(-directions[i].x, -directions[i].z);
      scene.add(marker);
    }

    // Checkered line across a straight section of the circuit.
    const startIndex = 10;
    const startCenter = positions[startIndex], startSide = sides[startIndex];
    const startYaw = Math.atan2(-directions[startIndex].x, -directions[startIndex].z);
    const black = new THREE.MeshStandardMaterial({ color: 0x17212d });
    const white = new THREE.MeshStandardMaterial({ color: 0xf7fbff });
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

    // The low plain gives visual depth below the elevated track. Driving outside
    // the road is detected separately, not by a heavy physics engine.
    const abyss = new THREE.Mesh(
      new THREE.PlaneGeometry(520, 520),
      new THREE.MeshStandardMaterial({ color: 0x476f80, roughness: 1 })
    );
    abyss.rotation.x = -Math.PI / 2;
    abyss.position.y = -30;
    scene.add(abyss);
    const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x65807b, roughness: 1, flatShading: true });
    const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
    // Larger rock formations rise clearly above the abyss floor. Place them
    // beyond the 6-m shoulders, close enough to remain visible from the road.
    for (let i = 0; i < 26; i++) {
      const index = Math.floor(i * SAMPLE_COUNT / 26);
      const normal = sides[index], center = positions[index];
      const side = i % 2 === 0 ? -1 : 1;
      const offset = side * (OUTER_HALF_WIDTH + 18 + (i % 3) * 7);
      const rock = new THREE.Mesh(rockGeometry, rockMaterial);
      rock.scale.set(8 + (i % 4) * 2.2, 10 + (i % 5) * 3.5, 9 + (i % 3) * 2);
      rock.position.set(center.x + normal.x * offset, -4, center.z + normal.z * offset);
      rock.rotation.y = i * 0.74;
      scene.add(rock);
    }

    const car = new THREE.Group();
    const colored = new THREE.MeshStandardMaterial({ color: 0xe52b40, metalness: 0.3, roughness: 0.36 });
    const redDetail = new THREE.MeshStandardMaterial({ color: 0x9e1227, metalness: 0.18, roughness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x182332, roughness: 0.66 });
    const glass = new THREE.MeshStandardMaterial({
      color: 0x143448, roughness: 0.25, metalness: 0.24, side: THREE.DoubleSide
    });
    const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xf9f9dc, emissive: 0xf1e7a4, emissiveIntensity: 0.48 });
    const brakeLights = new THREE.MeshStandardMaterial({ color: 0xec1a38, emissive: 0xbc0717, emissiveIntensity: 0.4 });
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
    for (const side of [-1, 1]) {
      box(car, 0.48, 0.13, 0.06, lightMaterial, side * 0.69, 0.93, -2.11);
      box(car, 0.48, 0.14, 0.06, brakeLights, side * 0.70, 0.88, 2.08);
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

    // Always render the roof and the structural pillars from inside AND outside.
    // Omit the windscreen pane to keep the forward view unobstructed.
    panel([[-0.72, 1.63, 0.75], [0.72, 1.63, 0.75],
      [0.86, 1.01, 1.35], [-0.86, 1.01, 1.35]], glass);
    for (const side of [-1, 1]) {
      panel([[side * 0.86, 1.02, -1.01], [side * 0.72, 1.63, -0.43],
        [side * 0.72, 1.63, 0.75], [side * 0.86, 1.01, 1.35]], glass);
    }
    function pillar(from, to, thickness = 0.085) {
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
      // Forward A pillars (no glass), central B pillars, rear C pillars.
      pillar([side * 0.86, 1.01, -1.01], [side * 0.72, 1.63, -0.43], 0.075);
      pillar([side * 0.83, 1.01, 0.25], [side * 0.72, 1.63, 0.25], 0.07);
      pillar([side * 0.86, 1.01, 1.35], [side * 0.72, 1.63, 0.75], 0.075);
      pillar([side * 0.72, 1.63, -0.43], [side * 0.72, 1.63, 0.75], 0.07);
    }
    box(cabin, 1.54, 0.11, 1.28, colored, 0, 1.69, 0.15); // Solid roof.
    box(cabin, 1.59, 0.105, 0.12, dark, 0, 1.62, -0.43); // Upper windscreen frame.
    box(cabin, 1.54, 0.09, 0.13, dark, 0, 1.62, 0.76); // Rear roof frame.

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
    const steeringWheel = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.041, 8, 18), dark);
    steeringWheel.position.set(-0.42, 1.16, -0.54);
    steeringWheel.rotation.x = -0.33;
    dashboard.add(steeringWheel);
    box(dashboard, 0.12, 0.12, 0.12, rimMaterial, -0.42, 1.16, -0.54);
    box(dashboard, 0.43, 0.034, 0.044, rimMaterial, -0.42, 1.16, -0.53);
    box(dashboard, 0.045, 0.32, 0.05, rimMaterial, -0.42, 1.11, -0.53);
    box(dashboard, 0.30, 0.20, 0.43, redDetail, 0.64, 1.03, -0.75);
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
    roofNumber.position.set(0, 1.74, 0.15);
    roofNumber.rotation.x = -Math.PI / 2;
    cabin.add(roofNumber);
    scene.add(car);

    // Start on a straight section, facing the road in its normal forward direction.
    const initialIndex = 19;
    const initial = positions[initialIndex];
    let driver = {
      x: initial.x, z: initial.z,
      yaw: Math.atan2(-directions[initialIndex].x, -directions[initialIndex].z),
      speed: 0,
    };
    let cameraMode = "inside";
    let lapTracker = TrackProgress.create(SAMPLE_COUNT, startIndex, initialIndex);
    let falling = false, fall = null, respawnIndex = initialIndex;
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
      lapTracker = TrackProgress.relocate(lapTracker, index);
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
      fullscreenButton.textContent = full ? "⤢ Écran normal" : "⛶ Plein écran";
      fullscreenButton.setAttribute("aria-label", full ? "Quitter le plein écran" : "Passer en plein écran");
    }
    fullscreenButton.addEventListener("click", async () => {
      try {
        if (document.fullscreenElement === stage) {
          await document.exitFullscreen();
        } else if (stage.requestFullscreen) {
          await stage.requestFullscreen();
        } else {
          announce("Plein écran non disponible dans ce navigateur.");
        }
      } catch (error) {
        console.warn("Fullscreen failed:", error);
        announce("Le plein écran a été refusé par le navigateur.");
      }
    });
    document.addEventListener("fullscreenchange", refreshFullscreen);
    refreshFullscreen();

    const map = mapCanvas.getContext("2d");
    const bounds = positions.slice(0, SAMPLE_COUNT).reduce((acc, p) => ({
      minX: Math.min(acc.minX, p.x), maxX: Math.max(acc.maxX, p.x),
      minZ: Math.min(acc.minZ, p.z), maxZ: Math.max(acc.maxZ, p.z),
    }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });

    function drawMap() {
      if (!map) return;
      const w = mapCanvas.width, h = mapCanvas.height;
      map.clearRect(0, 0, w, h);
      const scale = Math.min((w - 48) / (bounds.maxX - bounds.minX),
        (h - 42) / (bounds.maxZ - bounds.minZ));
      const centerX = (bounds.minX + bounds.maxX) / 2;
      const centerZ = (bounds.minZ + bounds.maxZ) / 2;
      const convert = (x, z) => [w / 2 + (x - centerX) * scale, h / 2 + (z - centerZ) * scale];
      map.lineJoin = "round";
      map.lineCap = "round";
      map.beginPath();
      positions.forEach((p, i) => {
        const [x, y] = convert(p.x, p.z);
        if (i === 0) map.moveTo(x, y);
        else map.lineTo(x, y);
      });
      map.closePath();
      map.strokeStyle = "#547b90";
      map.lineWidth = 18;
      map.stroke();
      map.strokeStyle = "#e1edee";
      map.lineWidth = 5;
      map.stroke();
      const [px, py] = convert(driver.x, driver.z);
      map.fillStyle = "#f04755";
      map.strokeStyle = "#ffffff";
      map.lineWidth = 3;
      map.beginPath();
      map.arc(px, py, 8, 0, Math.PI * 2);
      map.fill();
      map.stroke();
      map.beginPath();
      map.moveTo(px, py);
      map.lineTo(px - Math.sin(driver.yaw) * 16, py - Math.cos(driver.yaw) * 16);
      map.stroke();
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
      };
    }
    function restore(saved) {
      if (!saved || typeof saved !== "object") return;
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
      lapLabel.textContent = String(lapTracker.laps);
      cameraMode = saved.camera === "outside" ? "outside" : "inside";
    }
    binding = window.GameState.create("gcv").bind({ snapshot, restore });
    refreshCameraButton();

    function updateCar(dt, fallDt = dt) {
      if (falling) {
        fall = Physics.advanceFall(fall, fallDt);
        if (fall.remaining <= 0.000001) {
          snapBack(respawnIndex);
        } else {
          announce("Chute dans le vide ! Retour dans " + fall.remaining.toFixed(1) + " s");
        }
      } else {
        const steer = refreshPad();
        const accelerate = gasPointers.size > 0 || keys.has("arrowup") || keys.has("w");
        const brake = brakePointers.size > 0 || keys.has("arrowdown") || keys.has("s");
        const currentRoad = closestRoad(driver.x, driver.z);
        const gravel = currentRoad.distanceSquared > ROAD_HALF_WIDTH * ROAD_HALF_WIDTH;
        driver = Physics.advance(driver, { steer, accelerate, brake, gravel }, dt);
        const nearest = closestRoad(driver.x, driver.z);
        if (nearest.distanceSquared > OUTER_HALF_WIDTH * OUTER_HALF_WIDTH) {
          // Keep the speed and forward momentum in the air. Begin both the
          // gravity animation and the two-second countdown at this instant.
          falling = true;
          respawnIndex = nearest.index;
          fall = Physics.startFall(driver);
          announce("Chute dans le vide ! Retour dans 2.0 s");
        } else {
          const previousLaps = lapTracker.laps;
          lapTracker = TrackProgress.advance(lapTracker, nearest.index, SAMPLE_COUNT);
          if (lapTracker.laps !== previousLaps) {
            lapLabel.textContent = String(lapTracker.laps);
            if (binding) binding.changed();
          }
        }
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
      speedLabel.textContent = String(Math.round(Math.abs(driver.speed) * 3.6));
      gearLabel.textContent = driver.speed < -0.02 ? "R" : "";
    }

    function updateCamera(dt) {
      const inside = cameraMode === "inside";
      const desiredPosition = car.localToWorld(inside
        ? new THREE.Vector3(-0.42, 1.43, 0.30) // Directly behind the wheel.
        : new THREE.Vector3(0, 4.5, 9.7));
      const desiredTarget = car.localToWorld(inside
        ? new THREE.Vector3(-0.42, 1.42, -14)
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
      updateCar(dt, realDt);
      updateCamera(dt);
      autosaveElapsed += dt;
      if (autosaveElapsed >= 1.5) {
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
