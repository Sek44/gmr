"use strict";

// GCV Three.js rendering: WebGL lifecycle, car transforms, camera and viewport.
// The driving simulation, lap timing and requestAnimationFrame loop stay in game.js.
const GcvRendering = (() => {
  // The camera reveal finishes before the 3-2-1 countdown ends (2 s grid
  // staging plus 3 s countdown). No extra delay is added to the race.
  const GRID_INTRO_DURATION = 3.8;
  const GRID_REAR_FRACTION = 2 / 3;
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
    const introSidePosition = new THREE.Vector3(-7.5, 3.2, 4.1);
    const introSideTarget = new THREE.Vector3(0, 1.3, 0);
    const desiredPosition = new THREE.Vector3();
    const desiredTarget = new THREE.Vector3();
    let outsideView = false;
    let initializedCamera = false;
    let gridIntroElapsed = null;
    let introCockpitVisible = false;
    let selectedVehicle = "classic";
    let previousYaw = null;
    let motoLean = 0;
    let previousSpeed = null;
    let wasJumping = false;
    let landingCompression = 0;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

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
      const bodyRoll = clamp(-turn * 0.12, -0.29, 0.29);
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
      helmet.rotation.y += (clamp(-turn * 0.075, -0.18, 0.18) -
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
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = width < height ? 77 : 72;
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", resize);
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(resize).observe(stage);
    resize();

    function syncOpponents(opponents) {
      for (const [id, mesh] of opponentMeshes) {
        const ai = opponents?.find((entry) => entry.id === id);
        mesh.visible = Boolean(ai);
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
      const targetLean = selectedVehicle === "moto" && !fall
        ? Math.max(-0.19, Math.min(0.19, -rate * 0.18)) : 0;
      motoLean += (targetLean - motoLean) * (1 - Math.exp(-12 * Math.max(0, dt)));
      if (fall) {
        car.position.set(fall.x, fall.y, fall.z);
        // The nose tips down while falling, independently of steering.
        car.rotation.set(Math.min(0.68, fall.elapsed * 0.42), driver.yaw, 0, "YXZ");
      } else {
        car.position.set(driver.x, 0.14 + (driver.roadY || 0) + (driver.jumpY || 0), driver.z);
        const pitch = (driver.jumpY || 0) > 0
          ? Math.max(-0.16, Math.min(0.16, -jumpVelocity * 0.018)) : 0;
        car.rotation.set(pitch, driver.yaw, motoLean, "YXZ");
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
        initializedCamera = true;
        if (gridIntroElapsed >= GRID_INTRO_DURATION) {
          gridIntroElapsed = null;
          onCameraVisibility(outsideView);
        }
        return;
      }

      desiredPosition.copy(outsideView ? outsidePosition : insidePosition);
      desiredTarget.copy(outsideView ? outsideTarget : insideTarget);
      car.localToWorld(desiredPosition);
      car.localToWorld(desiredTarget);
      if (!outsideView) {
        // Rigid cockpit mount: never smooth the inside camera.
        camera.position.copy(desiredPosition);
      } else {
        const blend = initializedCamera ? 1 - Math.exp(-8 * dt) : 1;
        camera.position.lerp(desiredPosition, blend);
      }
      camera.lookAt(desiredTarget);
      initializedCamera = true;
    }

    function render() { renderer.render(scene, camera); }
    return {
      syncOpponents, updatePlayer, setView, setVehicle,
      startGridIntro, cancelGridIntro, updateCamera, render,
      get gridIntroActive() { return gridIntroElapsed !== null; },
    };
  }

  return { create, GRID_INTRO_DURATION, introFractions };
})();

if (typeof window !== "undefined") window.GcvRendering = GcvRendering;
if (typeof module !== "undefined" && module.exports) module.exports = GcvRendering;
