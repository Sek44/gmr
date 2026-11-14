"use strict";

// GCV Three.js rendering: WebGL lifecycle, car transforms, camera and viewport.
// The driving simulation, lap timing and requestAnimationFrame loop stay in game.js.
const GcvRendering = (() => {
  // The camera reveal finishes before the 3-2-1 countdown ends (2 s grid
  // staging plus 3 s countdown). No extra delay is added to the race.
  const GRID_INTRO_DURATION = 3.8;
  const GRID_REAR_FRACTION = 2 / 3;
  // Footprint widths and lengths (metres) follow the five player silhouettes.
  const SHADOW_FOOTPRINTS = Object.freeze({
    classic: [3.3, 5.1],
    moto: [1.7, 4.6],
    kart: [3.0, 4.1],
    buggy: [3.5, 4.7],
    comet: [3.0, 5.0],
  });
  const SHADOW_GROUND_OFFSET = 0.16; // Above the 0.125 m rainbow ribbons.
  const SHADOW_OPACITY = 0.78;
  function shadowFlightAppearance(height) {
    const lift = Math.max(0, Math.min(1, (Number(height) || 0) / 1.5));
    return { opacity: SHADOW_OPACITY * (1 - 0.3 * lift),
      scale: 1 - 0.08 * lift };
  }
  const smoothStep = (value) => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
  };

  function introFractions(progress, outsideView) {
    if (outsideView) return { approach: smoothStep(progress), enter: 0 };
    return {
      approach: smoothStep(progress / GRID_REAR_FRACTION),
      enter: smoothStep((progress - GRID_REAR_FRACTION) /
        (1 - GRID_REAR_FRACTION)),
    };
  }

  function create({ THREE, window, stage, sceneHost, scene, car, wheelPivots,
    brakeLights, rearBrakeGlows, opponentMeshes, extraWheelPivots = [], curve, startIndex,
    SAMPLE_COUNT, trackLength, closed = true, heightAt = () => 0,
    motoRider = null, onCameraVisibility = () => {} }) {
    // Limit framebuffer allocations for the longer open route. On older
    // tablet GPUs, MSAA at 1.7x pixel ratio can exhaust WebGL memory during
    // initialization, leaving the menu apparently frozen.
    const compact = !closed;
    const MAX_OPEN_TRACK_PIXELS = 750000;
    // Benchmark-only override; default 1 leaves the existing game unchanged.
    let resolutionScale = 1;
    const renderer = new THREE.WebGLRenderer({
      antialias: !compact, alpha: false, powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    sceneHost.append(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(72, 1, 0.08, 2400);
    const insidePosition = new THREE.Vector3(-0.42, 1.51, 0.34);
    const outsidePosition = new THREE.Vector3(0, 4.5, 9.7);
    const insideTarget = new THREE.Vector3(-0.42, 1.49, -14);
    const outsideTarget = new THREE.Vector3(0, 1.13, -8);
    // Start on the player's outer grid side, at an oblique angle that shows
    // the bodywork and pilot. The grid's adjacent car is on the other side.
    const introSidePosition = new THREE.Vector3(7.5, 3.2, 4.1);
    const introSideTarget = new THREE.Vector3(0, 1.3, 0);
    const desiredPosition = new THREE.Vector3();
    const desiredTarget = new THREE.Vector3();
    const smoothedTarget = new THREE.Vector3();
    let outsideView = false;
    let initializedCamera = false;
    let gridIntroElapsed = null;
    let introCockpitVisible = false;
    let selectedVehicle = "classic";
    let previousYaw = null;
    let motoLean = 0;
    let visualPitch = 0;
    let previousSpeed = null;
    let wasJumping = false;
    let landingCompression = 0;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    // One tiny radial alpha texture, one plane geometry and two materials for
    // all ten shadows. The meshes belong to the scene, NOT to the car groups:
    // jumping and pitching never lift or rotate the ground projection.
    const shadowCanvas = window.document.createElement("canvas");
    shadowCanvas.width = shadowCanvas.height = 64;
    const shadowContext = shadowCanvas.getContext("2d");
    const gradient = shadowContext.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(0, 0, 0, 0.55)");
    gradient.addColorStop(0.4, "rgba(0, 0, 0, 0.42)");
    gradient.addColorStop(0.72, "rgba(0, 0, 0, 0.14)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    shadowContext.fillStyle = gradient;
    shadowContext.fillRect(0, 0, 64, 64);
    const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
    shadowTexture.generateMipmaps = false;
    shadowTexture.minFilter = THREE.LinearFilter;
    shadowTexture.magFilter = THREE.LinearFilter;
    const shadowGeometry = new THREE.PlaneGeometry(1, 1);
    const opponentShadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x10141a, map: shadowTexture, transparent: true,
      opacity: SHADOW_OPACITY, depthWrite: false, side: THREE.DoubleSide,
    });
    const playerShadowMaterial = opponentShadowMaterial.clone();
    function makeShadow(material, footprint) {
      const mesh = new THREE.Mesh(shadowGeometry, material);
      mesh.rotation.set(-Math.PI / 2, 0, 0, "YXZ");
      mesh.scale.set(footprint[0], footprint[1], 1);
      scene.add(mesh);
      return mesh;
    }
    function placeShadow(mesh, x, groundY, z, yaw, footprint, size = 1) {
      mesh.position.set(x, groundY + SHADOW_GROUND_OFFSET, z);
      // YXZ applies yaw around world Y while leaving the plane horizontal.
      mesh.rotation.set(-Math.PI / 2, yaw, 0, "YXZ");
      mesh.scale.set(footprint[0] * size, footprint[1] * size, 1);
    }
    const playerShadow = makeShadow(playerShadowMaterial,
      SHADOW_FOOTPRINTS.classic);
    const opponentShadows = new Map();
    for (const [id] of opponentMeshes) {
      const shadow = makeShadow(opponentShadowMaterial,
        SHADOW_FOOTPRINTS.classic);
      shadow.visible = false;
      opponentShadows.set(id, shadow);
    }

    let riderMotionTime = 0;
    // Explicitly visible arcade-style rider motion: the bike banks while Milo
    // shifts his weight, reaches with each arm and keeps his head looking into
    // the corner. Four small pivot transforms, no extra geometry or draw calls.
    function animateMotoRider(dt, driver, yawRate, steerInput, acceleration,
      jumpVelocity, fall) {
      if (!motoRider || selectedVehicle !== "moto") return;
      const { body, helmet, arms = [], baseY } = motoRider;
      const step = Math.max(0, dt);
      const moving = !fall && Math.abs(driver.speed) > 0.5;
      const airborne = !fall && (driver.jumpY || 0) > 0;
      if (wasJumping && !airborne && !fall) landingCompression = -0.19;
      wasJumping = airborne;
      landingCompression *= Math.exp(-8 * step);
      riderMotionTime += step;
      // Steering anticipates the bend, while actual yaw keeps reacting in
      // autonomous rainbow zigzags. Capped angles prevent rubbery motion.
      const turn = !fall ? clamp(
        (moving ? yawRate : 0) - steerInput * 0.75, -2.8, 2.8) : 0;
      const speed = moving ? Math.abs(driver.speed) : 0;
      // Positive yaw and roll both mean a leftward turn/lean.
      const bodyRoll = clamp(turn * 0.12, -0.29, 0.29);
      const bodyPitch = clamp(
        (moving ? acceleration * 0.006 - Math.min(0.055, speed * 0.0015) : 0) +
        (airborne ? jumpVelocity * 0.010 : 0), -0.24, 0.19);
      const bodyBlend = 1 - Math.exp(-15 * step);
      const headBlend = 1 - Math.exp(-11 * step);
      // Up to 20 cm sideways is easy to read from the chase camera.
      const targetSide = clamp(-turn * 0.09, -0.20, 0.20);
      const bounce = moving && !airborne
        ? Math.sin(riderMotionTime * 13) * Math.min(0.035, speed * 0.0013) : 0;
      const targetY = baseY + landingCompression + bounce +
        (airborne ? clamp(jumpVelocity * 0.009, -0.07, 0.07) : 0);
      body.rotation.z += (bodyRoll - body.rotation.z) * bodyBlend;
      body.rotation.x += (bodyPitch - body.rotation.x) * bodyBlend;
      body.position.x += (targetSide - body.position.x) * bodyBlend;
      body.position.y += (targetY - body.position.y) * bodyBlend;
      // Head follows Milo's body but compensates for some of the bike's lean.
      // Looking into the next corner is more obvious than counter-lean alone.
      const headRoll = clamp(-motoLean * 0.20 - body.rotation.z * 0.24,
        -0.10, 0.10);
      helmet.rotation.z += (headRoll - helmet.rotation.z) * headBlend;
      helmet.rotation.y += (clamp(turn * 0.075, -0.18, 0.18) -
        helmet.rotation.y) * headBlend;
      helmet.rotation.x += (clamp(-body.rotation.x * 0.5 +
        bounce * 0.6, -0.12, 0.12) - helmet.rotation.x) * headBlend;
      // Move shoulders separately: one arm bends more than the other as
      // Milo holds the bars. All meshes stay attached to their existing rig.
      for (let i = 0; i < arms.length; i++) {
        const side = i === 0 ? -1 : 1;
        const arm = arms[i];
        const armPitch = clamp(-body.rotation.x * 0.58 +
          side * turn * 0.10, -0.29, 0.29);
        const armRoll = clamp(-body.rotation.z * 0.38 +
          side * turn * 0.065, -0.25, 0.25);
        arm.rotation.x += (armPitch - arm.rotation.x) * bodyBlend;
        arm.rotation.z += (armRoll - arm.rotation.z) * bodyBlend;
      }
    }

    function resetMotoRider() {
      previousSpeed = null;
      wasJumping = false;
      landingCompression = 0;
      riderMotionTime = 0;
      if (!motoRider) return;
      const { body, helmet, arms = [], baseY } = motoRider;
      body.position.x = 0;
      body.position.y = baseY;
      body.rotation.x = 0;
      body.rotation.z = 0;
      helmet.rotation.x = 0;
      helmet.rotation.y = 0;
      helmet.rotation.z = 0;
      for (const arm of arms) {
        arm.rotation.x = 0;
        arm.rotation.z = 0;
      }
    }

    function resize() {
      const width = Math.max(1, stage.clientWidth);
      const height = Math.max(1, stage.clientHeight);
      const deviceRatio = window.devicePixelRatio || 1;
      const pixelRatio = compact
        ? Math.min(deviceRatio, 1.15,
          Math.sqrt(MAX_OPEN_TRACK_PIXELS / (width * height)))
        : Math.min(deviceRatio, 1.7);
      renderer.setPixelRatio(pixelRatio * resolutionScale);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = width < height ? 77 : 72;
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", resize);
    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(resize) : null;
    resizeObserver?.observe(stage);
    resize();

    function setResolutionScale(scale) {
      if (!Number.isFinite(scale) || scale < 0.5 || scale > 1) {
        throw new RangeError("Rendering scale must be between 0.5 and 1");
      }
      if (resolutionScale === scale) return;
      resolutionScale = scale;
      resize();
    }

    function syncOpponents(opponents) {
      for (const [id, mesh] of opponentMeshes) {
        const ai = opponents?.find((entry) => entry.id === id);
        mesh.visible = Boolean(ai);
        const shadow = opponentShadows.get(id);
        if (shadow) shadow.visible = Boolean(ai);
        if (!ai) continue;
        // Use arc length, including on the final long straight.
        const rawT = startIndex / SAMPLE_COUNT + ai.progress / trackLength;
        const t = closed ? ((rawT % 1) + 1) % 1 : Math.max(0, Math.min(1, rawT));
        const center = curve.getPointAt(t);
        const forward = curve.getTangentAt(t).normalize();
        const sideX = -forward.z, sideZ = forward.x;
        mesh.position.set(center.x + sideX * ai.lateral,
          heightAt(t) + 0.14, center.z + sideZ * ai.lateral);
        mesh.rotation.y = Math.atan2(-forward.x, -forward.z);
        if (shadow) placeShadow(shadow, mesh.position.x, heightAt(t),
          mesh.position.z, mesh.rotation.y, SHADOW_FOOTPRINTS.classic);
      }
    }

    function updatePlayer({ driver, fall, dt, brakePressed, jumpVelocity = 0,
      steerInput = 0 }) {
      const deltaYaw = previousYaw === null ? 0 :
        Math.atan2(Math.sin(driver.yaw - previousYaw),
          Math.cos(driver.yaw - previousYaw));
      previousYaw = fall ? null : driver.yaw;
      const rate = dt > 0 && !fall ? deltaYaw / dt : 0;
      const acceleration = dt > 0 && previousSpeed !== null && !fall
        ? clamp((driver.speed - previousSpeed) / dt, -55, 35) : 0;
      previousSpeed = fall ? null : driver.speed;
      playerShadow.visible = !fall;
      if (!fall) {
        const footprint = SHADOW_FOOTPRINTS[selectedVehicle] ||
          SHADOW_FOOTPRINTS.classic;
        const flight = shadowFlightAppearance(driver.jumpY);
        playerShadowMaterial.opacity = flight.opacity;
        placeShadow(playerShadow, driver.x, driver.roadY || 0, driver.z,
          driver.yaw, footprint, flight.scale);
      }
      const targetLean = selectedVehicle === "moto" && !fall
        ? Math.max(-0.19, Math.min(0.19, rate * 0.18)) : 0;
      motoLean += (targetLean - motoLean) * (1 - Math.exp(-12 * Math.max(0, dt)));
      if (fall) {
        visualPitch = 0;
        car.position.set(fall.x, fall.y, fall.z);
        // The nose tips down while falling, independently of steering.
        car.rotation.set(Math.min(0.68, fall.elapsed * 0.42), driver.yaw, 0, "YXZ");
      } else {
        car.position.set(driver.x, 0.14 + (driver.roadY || 0) + (driver.jumpY || 0), driver.z);
        const targetPitch = (driver.jumpY || 0) > 0
          ? Math.max(-0.16, Math.min(0.16, -jumpVelocity * 0.018)) : 0;
        // Avoid an instantaneous body rotation on the launch frame.
        visualPitch += (targetPitch - visualPitch) *
          (1 - Math.exp(-16 * Math.max(0, dt)));
        car.rotation.set(visualPitch, driver.yaw, motoLean, "YXZ");
      }
      animateMotoRider(dt, driver, rate, steerInput, acceleration,
        jumpVelocity, fall);
      for (const wheel of wheelPivots) wheel.rotation.x -= driver.speed * dt / 0.46;
      for (const wheel of extraWheelPivots) wheel.rotation.x -= driver.speed * dt / 0.49;
      car.updateMatrixWorld(true); // Needed before particles use car.localToWorld().
      brakeLights.emissiveIntensity = brakePressed ? 3.8 : 0.15;
      for (const glow of rearBrakeGlows) glow.intensity = brakePressed ? 3.5 : 0;
    }

    function cancelGridIntro() {
      if (gridIntroElapsed !== null) onCameraVisibility(outsideView);
      gridIntroElapsed = null;
      introCockpitVisible = false;
    }

    function startGridIntro() {
      gridIntroElapsed = 0;
      introCockpitVisible = false;
      initializedCamera = false;
      // Keep the rider and helmet visible while orbiting the vehicle, even
      // when the selected driving view is the cockpit.
      onCameraVisibility(true);
    }

    // Place the cockpit camera above the selected pilot's seat or helmet,
    // keeping the road unobstructed for each vehicle silhouette.
    function setVehicle(id) {
      cancelGridIntro();
      selectedVehicle = id;
      previousYaw = null;
      motoLean = 0;
      visualPitch = 0;
      resetMotoRider();
      const cockpits = {
        classic: [-0.42, 1.51, 0.34],
        moto: [0, 2.22, 0.29],
        kart: [0, 1.94, 0.55],
        buggy: [0, 2.02, 0.38],
        comet: [0, 2.02, 0.38],
      };
      const [x, y, z] = cockpits[id] || cockpits.classic;
      insidePosition.set(x, y, z);
      insideTarget.set(x, y - 0.12, -14);
      // Framing the motorcycle slightly closer makes the rider's movement
      // legible on smaller phone screens without changing other cameras.
      outsidePosition.set(0, id === "moto" ? 3.6 : 4.5, id === "moto" ? 7.3 : 9.7);
      initializedCamera = false;
    }
    function setView(outside) {
      outsideView = Boolean(outside);
      cancelGridIntro();
      initializedCamera = false;
    }

    // Chase framing follows heading and position, not instantaneous
    // pitch/roll from the vehicle's jump or motorcycle lean.
    function yawToWorld(point) {
      const angle = car.rotation.y;
      const x = point.x, z = point.z;
      point.set(car.position.x + x * Math.cos(angle) + z * Math.sin(angle),
        car.position.y + point.y,
        car.position.z - x * Math.sin(angle) + z * Math.cos(angle));
    }

    function updateCamera(dt) {
      if (gridIntroElapsed !== null) {
        gridIntroElapsed = Math.min(GRID_INTRO_DURATION,
          gridIntroElapsed + Math.max(0, dt));
        const progress = gridIntroElapsed / GRID_INTRO_DURATION;
        const { approach, enter } = introFractions(progress, outsideView);
        desiredPosition.copy(introSidePosition).lerp(outsidePosition, approach);
        desiredTarget.copy(introSideTarget).lerp(outsideTarget, approach);
        if (!outsideView) {
          // Only the final third moves from the exact chase-camera pose into
          // the cockpit; at completion it is identical to the driving view.
          desiredPosition.lerp(insidePosition, enter);
          desiredTarget.lerp(insideTarget, enter);
          if (enter > 0.88 && !introCockpitVisible) {
            introCockpitVisible = true;
            onCameraVisibility(false);
          }
        }
        car.localToWorld(desiredPosition);
        car.localToWorld(desiredTarget);
        camera.position.copy(desiredPosition);
        camera.lookAt(desiredTarget);
        smoothedTarget.copy(desiredTarget);
        initializedCamera = true;
        if (gridIntroElapsed >= GRID_INTRO_DURATION) {
          gridIntroElapsed = null;
          onCameraVisibility(outsideView);
        }
        return;
      }

      desiredPosition.copy(outsideView ? outsidePosition : insidePosition);
      desiredTarget.copy(outsideView ? outsideTarget : insideTarget);
      if (outsideView) {
        yawToWorld(desiredPosition);
        yawToWorld(desiredTarget);
        const blend = initializedCamera ? 1 - Math.exp(-8 * Math.max(0, dt)) : 1;
        const aimBlend = initializedCamera ? 1 - Math.exp(-10 * Math.max(0, dt)) : 1;
        camera.position.lerp(desiredPosition, blend);
        smoothedTarget.lerp(desiredTarget, aimBlend);
      } else {
        car.localToWorld(desiredPosition);
        car.localToWorld(desiredTarget);
        // The cockpit remains mounted to the vehicle.
        camera.position.copy(desiredPosition);
        smoothedTarget.copy(desiredTarget);
      }
      camera.lookAt(smoothedTarget);
      initializedCamera = true;
    }

    function render() { renderer.render(scene, camera); }
    // Snapshot the renderer's per-frame counters after render(). No profiler
    // dependencies or extra GPU synchronization in the normal game loop.
    function getMetrics() {
      return {
        drawCalls: renderer.info?.render?.calls ?? null,
        triangles: renderer.info?.render?.triangles ?? null,
        geometries: renderer.info?.memory?.geometries ?? null,
        textures: renderer.info?.memory?.textures ?? null,
        pixelRatio: renderer.getPixelRatio?.() ?? null,
        resolutionScale,
        framebufferWidth: renderer.domElement.width ?? null,
        framebufferHeight: renderer.domElement.height ?? null,
      };
    }
    function dispose() {
      window.removeEventListener("resize", resize);
      resizeObserver?.disconnect();
      // Free the old track before allocating another WebGL context on tablets.
      const materials = new Set();
      const geometries = new Set();
      scene.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) {
          for (const material of Array.isArray(object.material)
            ? object.material : [object.material]) materials.add(material);
        }
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value?.isTexture) value.dispose();
        }
        material.dispose();
      }
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    }
    return {
      syncOpponents, updatePlayer, setView, setVehicle,
      startGridIntro, cancelGridIntro, updateCamera, render, getMetrics,
      setResolutionScale, dispose,
      get gridIntroActive() { return gridIntroElapsed !== null; },
    };
  }

  return { create, GRID_INTRO_DURATION, introFractions,
    SHADOW_FOOTPRINTS, SHADOW_GROUND_OFFSET, shadowFlightAppearance };
})();

if (typeof window !== "undefined") window.GcvRendering = GcvRendering;
if (typeof module !== "undefined" && module.exports) module.exports = GcvRendering;
