"use strict";

// GCV Three.js rendering: WebGL lifecycle, car transforms, camera and viewport.
// The driving simulation, lap timing and requestAnimationFrame loop stay in game.js.
const GcvRendering = (() => {
  function create({ THREE, window, stage, sceneHost, scene, car, wheelPivots,
    brakeLights, rearBrakeGlows, opponentMeshes, curve, startIndex,
    SAMPLE_COUNT, trackLength }) {
    const renderer = new THREE.WebGLRenderer({
      antialias: true, alpha: false, powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
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
        const t = (((startIndex / SAMPLE_COUNT + ai.progress / trackLength) % 1) + 1) % 1;
        const center = curve.getPointAt(t);
        const forward = curve.getTangentAt(t).normalize();
        const sideX = -forward.z, sideZ = forward.x;
        mesh.position.set(center.x + sideX * ai.lateral, 0.14,
          center.z + sideZ * ai.lateral);
        mesh.rotation.y = Math.atan2(-forward.x, -forward.z);
      }
    }

    function updatePlayer({ driver, fall, dt, brakePressed }) {
      if (fall) {
        car.position.set(fall.x, fall.y, fall.z);
        // The nose tips down while falling, independently of steering.
        car.rotation.set(Math.min(0.68, fall.elapsed * 0.42), driver.yaw, 0, "YXZ");
      } else {
        car.position.set(driver.x, 0.14, driver.z);
        car.rotation.set(0, driver.yaw, 0, "YXZ");
      }
      for (const wheel of wheelPivots) wheel.rotation.x -= driver.speed * dt / 0.46;
      car.updateMatrixWorld(true); // Needed before particles use car.localToWorld().
      brakeLights.emissiveIntensity = brakePressed ? 3.8 : 0.15;
      for (const glow of rearBrakeGlows) glow.intensity = brakePressed ? 3.5 : 0;
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
    return { syncOpponents, updatePlayer, setView, updateCamera, render };
  }

  return { create };
})();

if (typeof window !== "undefined") window.GcvRendering = GcvRendering;
if (typeof module !== "undefined" && module.exports) module.exports = GcvRendering;
