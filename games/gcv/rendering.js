"use strict";

// GCV Three.js rendering: WebGL lifecycle, car transforms, camera and viewport.
// The driving simulation, lap timing and requestAnimationFrame loop stay in game.js.
const GcvRendering = (() => {
  function create({ THREE, window, stage, sceneHost, scene, car, wheelPivots,
    brakeLights, rearBrakeGlows, opponentMeshes, extraWheelPivots = [], curve, startIndex,
    SAMPLE_COUNT, trackLength, closed = true, heightAt = () => 0,
    motoRider = null }) {
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
    const desiredPosition = new THREE.Vector3();
    const desiredTarget = new THREE.Vector3();
    let outsideView = false;
    let initializedCamera = false;
    let selectedVehicle = "classic";
    let previousYaw = null;
    let motoLean = 0;
    let previousSpeed = null;
    let wasJumping = false;
    let landingCompression = 0;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    // Only a handful of joint transforms per frame: no bones, new geometry,
    // keyframes or render allocations. The rider's hip is the main joint;
    // the helmet compensates slightly to keep the eyes aimed at the road.
    function animateMotoRider(dt, driver, yawRate, acceleration, jumpVelocity, fall) {
      if (!motoRider || selectedVehicle !== "moto") return;
      const { body, helmet, baseY } = motoRider;
      const step = Math.max(0, dt);
      const moving = !fall && Math.abs(driver.speed) > 0.5;
      const airborne = !fall && (driver.jumpY || 0) > 0;
      if (wasJumping && !airborne && !fall) landingCompression = -0.10;
      wasJumping = airborne;
      // Short springy compression on touchdown, then quickly back to rest.
      landingCompression *= Math.exp(-12 * step);
      const turn = moving ? clamp(yawRate, -2.4, 2.4) : 0;
      const bodyRoll = clamp(-turn * 0.055, -0.11, 0.11);
      const bodyPitch = clamp(
        (moving ? acceleration * 0.0027 : 0) +
        (airborne ? jumpVelocity * 0.005 : 0), -0.14, 0.10);
      const bodyBlend = 1 - Math.exp(-11 * step);
      const headBlend = 1 - Math.exp(-7 * step);
      // The torso shifts inside the lean of the motorcycle. Momentum nudges
      // it backward on acceleration and toward the tank on hard braking.
      body.rotation.z += (bodyRoll - body.rotation.z) * bodyBlend;
      body.rotation.x += (bodyPitch - body.rotation.x) * bodyBlend;
      body.position.x += (clamp(-turn * 0.022, -0.045, 0.045) -
        body.position.x) * bodyBlend;
      const targetY = baseY + landingCompression +
        (airborne ? clamp(jumpVelocity * 0.004, -0.024, 0.024) : 0);
      body.position.y += (targetY - body.position.y) * bodyBlend;
      // Delayed head counter-lean and a tiny look into the next turn.
      const headRoll = clamp(-motoLean * 0.44 - body.rotation.z * 0.42,
        -0.10, 0.10);
      helmet.rotation.z += (headRoll - helmet.rotation.z) * headBlend;
      helmet.rotation.x += (-body.rotation.x * 0.55 - helmet.rotation.x) *
        headBlend;
      helmet.rotation.y += (clamp(-turn * 0.024, -0.055, 0.055) -
        helmet.rotation.y) * headBlend;
    }

    function resetMotoRider() {
      previousSpeed = null;
      wasJumping = false;
      landingCompression = 0;
      if (!motoRider) return;
      const { body, helmet, baseY } = motoRider;
      body.position.x = 0;
      body.position.y = baseY;
      body.rotation.x = 0;
      body.rotation.z = 0;
      helmet.rotation.x = 0;
      helmet.rotation.y = 0;
      helmet.rotation.z = 0;
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

    function updatePlayer({ driver, fall, dt, brakePressed, jumpVelocity = 0 }) {
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
      animateMotoRider(dt, driver, rate, acceleration, jumpVelocity, fall);
      for (const wheel of wheelPivots) wheel.rotation.x -= driver.speed * dt / 0.46;
      for (const wheel of extraWheelPivots) wheel.rotation.x -= driver.speed * dt / 0.49;
      car.updateMatrixWorld(true); // Needed before particles use car.localToWorld().
      brakeLights.emissiveIntensity = brakePressed ? 3.8 : 0.15;
      for (const glow of rearBrakeGlows) glow.intensity = brakePressed ? 3.5 : 0;
    }

    // Place the cockpit camera above the selected pilot's seat or helmet,
    // keeping the road unobstructed for each vehicle silhouette.
    function setVehicle(id) {
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
      outsidePosition.set(0, id === "moto" ? 4.0 : 4.5, id === "moto" ? 8.6 : 9.7);
      initializedCamera = false;
    }
    function setView(outside) {
      outsideView = Boolean(outside);
      initializedCamera = false;
    }

    function updateCamera(dt) {
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
    return { syncOpponents, updatePlayer, setView, setVehicle, updateCamera, render };
  }

  return { create };
})();

if (typeof window !== "undefined") window.GcvRendering = GcvRendering;
if (typeof module !== "undefined" && module.exports) module.exports = GcvRendering;
