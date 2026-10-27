"use strict";

// Dynamic particle effects for the player car: mud spray and guardrail sparks.
// Creation owns the Three.js buffers; simulation passes the current driver state.
const GcvVisualEffects = (() => {
  function create({ THREE, scene, car }) {
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

    function tickMudParticles(dt, intensity, driver) {
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

    // Small bright particles from actual guardrail contact; one batched system.
    const SPARK_COUNT = 48;
    const sparkXYZ = new Float32Array(SPARK_COUNT * 3);
    const sparkRGB = new Float32Array(SPARK_COUNT * 3);
    const sparkState = Array.from({ length: SPARK_COUNT }, () => ({
      life: 0, duration: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    }));
    for (let i = 0; i < SPARK_COUNT; i++) sparkXYZ[i * 3 + 1] = -2000;
    const sparkGeometry = new THREE.BufferGeometry();
    const sparkXYZAttr = new THREE.BufferAttribute(sparkXYZ, 3);
    const sparkRGBAttr = new THREE.BufferAttribute(sparkRGB, 3);
    sparkXYZAttr.setUsage(THREE.DynamicDrawUsage);
    sparkRGBAttr.setUsage(THREE.DynamicDrawUsage);
    sparkGeometry.setAttribute("position", sparkXYZAttr);
    sparkGeometry.setAttribute("color", sparkRGBAttr);
    const sparks = new THREE.Points(sparkGeometry, new THREE.PointsMaterial({
      size: 0.18, vertexColors: true, transparent: true,
      opacity: 0.94, depthWrite: false, sizeAttenuation: true,
    }));
    sparks.frustumCulled = false;
    scene.add(sparks);
    let nextSpark = 0, sparkRemainder = 0;

    function tickBarrierSparks(dt, contact, driver) {
      for (let i = 0; i < SPARK_COUNT; i++) {
        const p = sparkState[i], j = 3 * i;
        if (p.life > 0) {
          p.life -= dt;
          p.x += p.vx * dt;
          p.z += p.vz * dt;
          p.y += p.vy * dt;
          p.vy -= 8 * dt;
          if (p.y < 0.18) p.life = 0;
        }
        if (p.life > 0) {
          sparkXYZ[j] = p.x;
          sparkXYZ[j + 1] = p.y;
          sparkXYZ[j + 2] = p.z;
          const fade = p.life / p.duration;
          sparkRGB[j] = fade;
          sparkRGB[j + 1] = fade * (0.50 + 0.35 * fade);
          sparkRGB[j + 2] = fade * 0.16;
        } else {
          sparkXYZ[j + 1] = -2000;
        }
      }

      // Spawn just a few short-lived sparks per second while actually sliding.
      if (contact && dt > 0 && Math.abs(driver.speed) > 4) {
        sparkRemainder += dt * 16 * Math.min(1, Math.abs(driver.speed) / 18);
        const count = Math.min(3, Math.floor(sparkRemainder));
        sparkRemainder -= count;
        for (let i = 0; i < count; i++) {
          const p = sparkState[nextSpark];
          const along = (Math.random() - 0.5) * 2.4;
          p.x = contact.x - contact.nx * 0.12 - Math.sin(driver.yaw) * along;
          p.z = contact.z - contact.nz * 0.12 - Math.cos(driver.yaw) * along;
          p.y = 0.62 + Math.random() * 0.20;
          const back = 0.7 + Math.random() * 2;
          const inward = 0.4 + Math.random() * 1.4;
          p.vx = Math.sin(driver.yaw) * back - contact.nx * inward;
          p.vz = Math.cos(driver.yaw) * back - contact.nz * inward;
          p.vy = 0.7 + Math.random() * 1.7;
          p.duration = 0.16 + Math.random() * 0.22;
          p.life = p.duration;
          nextSpark = (nextSpark + 1) % SPARK_COUNT;
        }
      } else {
        sparkRemainder = 0;
      }
      sparkXYZAttr.needsUpdate = true;
      sparkRGBAttr.needsUpdate = true;
    }

    return Object.freeze({
      update(dt, driver, mudIntensity, barrierContact) {
        tickMudParticles(dt, mudIntensity, driver);
        tickBarrierSparks(dt, barrierContact, driver);
      },
    });
  }

  return Object.freeze({ create });
})();
if (typeof window !== "undefined") window.GcvVisualEffects = GcvVisualEffects;
if (typeof module !== "undefined" && module.exports) module.exports = GcvVisualEffects;
