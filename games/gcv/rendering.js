"use strict";

// GCV Three.js rendering: WebGL lifecycle, car transforms, camera and viewport.
// The driving simulation, lap timing and requestAnimationFrame loop stay in game.js.
const GcvRendering = (() => {
  function create({ THREE, window, stage, sceneHost, scene, car, wheelPivots,
    brakeLights, rearBrakeGlows, opponentMeshes, extraWheelPivots = [], curve, startIndex,
    SAMPLE_COUNT, trackLength, closed = true, heightAt = () => 0 }) {
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

    function updatePlayer({ driver, fall, dt, brakePressed }) {
      if (fall) {
        car.position.set(fall.x, fall.y, fall.z);
        // The nose tips down while falling, independently of steering.
        car.rotation.set(Math.min(0.68, fall.elapsed * 0.42), driver.yaw, 0, "YXZ");
      } else {
        car.position.set(driver.x, 0.14 + (driver.roadY || 0) + (driver.jumpY || 0), driver.z);
        car.rotation.set((driver.jumpY || 0) > 0 ? -0.045 : 0,
          driver.yaw, 0, "YXZ");
      }
      for (const wheel of wheelPivots) wheel.rotation.x -= driver.speed * dt / 0.46;
      for (const wheel of extraWheelPivots) wheel.rotation.x -= driver.speed * dt / 0.49;
      car.updateMatrixWorld(true); // Needed before particles use car.localToWorld().
      brakeLights.emissiveIntensity = brakePressed ? 3.8 : 0.15;
      for (const glow of rearBrakeGlows) glow.intensity = brakePressed ? 3.5 : 0;
    }

    // Place the cockpit camera above the selected pilot's seat or helmet,
    // keeping the road unobstructed for each vehicle silhouette.
    function setVehicle(id) {
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
