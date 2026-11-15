"use strict";

// Shared one-draw-call dust/grit for the player and every rival. Soft round
// sprites use an analytic shader: no texture uploads or per-car meshes.
const GcvVisualEffects = (() => {
  function create({ THREE, scene, car, visualBody = car,
    opponentMeshes = new Map(), viewportCanvas = null }) {
    const MAX_MUD_PARTICLES = 512;
    const mudPositions = new Float32Array(MAX_MUD_PARTICLES * 3);
    const mudColors = new Float32Array(MAX_MUD_PARTICLES * 4);
    // Negative size means a sharp grit fleck; positive means a soft puff.
    const mudSizes = new Float32Array(MAX_MUD_PARTICLES);
    const mudState = Array.from({ length: MAX_MUD_PARTICLES }, () => ({
      lifetime: 0, duration: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
      groundY: 0.11, landing: false, grit: false, diameter: 0,
      opacity: 0, shade: 1,
    }));
    for (let i = 0; i < MAX_MUD_PARTICLES; i++) mudPositions[i * 3 + 1] = -2000;
    const mudGeometry = new THREE.BufferGeometry();
    const mudPositionAttribute = new THREE.BufferAttribute(mudPositions, 3);
    const mudColorAttribute = new THREE.BufferAttribute(mudColors, 4);
    const mudSizeAttribute = new THREE.BufferAttribute(mudSizes, 1);
    mudPositionAttribute.setUsage(THREE.DynamicDrawUsage);
    mudColorAttribute.setUsage(THREE.DynamicDrawUsage);
    mudSizeAttribute.setUsage(THREE.DynamicDrawUsage);
    mudGeometry.setAttribute("position", mudPositionAttribute);
    mudGeometry.setAttribute("color", mudColorAttribute);
    mudGeometry.setAttribute("particleSize", mudSizeAttribute);
    // Zero triangles, one small Points draw when active. Keep a tight pixel
    // cap so dust never becomes a huge overdraw hotspot near the camera.
    const mudMaterial = new THREE.ShaderMaterial({
      uniforms: { viewportHeight: { value: viewportCanvas?.height || 420 } },
      transparent: true, depthWrite: false,
      vertexShader: `
        attribute vec4 color;
        attribute float particleSize;
        uniform float viewportHeight;
        varying vec4 vColor;
        varying float vGrit;
        void main() {
          vColor = color;
          vGrit = step(particleSize, 0.0);
          vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewPos;
          float pixelDiameter = abs(particleSize) * projectionMatrix[1][1] *
            viewportHeight * 0.5 / max(0.1, -viewPos.z);
          gl_PointSize = clamp(pixelDiameter, 1.0, 18.0);
        }
      `,
      fragmentShader: `
        varying vec4 vColor;
        varying float vGrit;
        void main() {
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float radius2 = dot(uv, uv);
          float dust = 1.0 - smoothstep(0.04, 1.0, radius2);
          float grit = 1.0 - smoothstep(0.48, 0.95, radius2);
          float alpha = vColor.a * mix(dust, grit, vGrit);
          if (alpha < 0.012) discard;
          gl_FragColor = vec4(vColor.rgb, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    const mudPoints = new THREE.Points(mudGeometry, mudMaterial);
    mudPoints.frustumCulled = false;
    mudGeometry.setDrawRange(0, 0);
    scene.add(mudPoints);
    let nextMudParticle = 0;
    let highWaterMark = 0;
    let hasMud = false;
    // Independent fractional emitters for player (0) and rivals (id + 1).
    const mudEmissionRemainders = new Float32Array(11);
    const origin = new THREE.Vector3();

    function allocateMud() {
      const p = mudState[nextMudParticle];
      highWaterMark = Math.max(highWaterMark, nextMudParticle + 1);
      nextMudParticle = (nextMudParticle + 1) % MAX_MUD_PARTICLES;
      hasMud = true;
      return p;
    }

    function emitDrift(dt, intensity, source, yaw, groundY, slot,
      rearHalfWidth = 0.86, rearLength = 1.48, maxPerFrame = 12) {
      if (!(intensity > 0) || !(dt > 0) || !source) {
        mudEmissionRemainders[slot] = 0;
        return;
      }
      // More apparent smoke from expanding puffs, not more particles. Keep
      // emissions bounded for 9 simultaneous opponents on slow phones.
      const accumulated = mudEmissionRemainders[slot] +
        Math.min(1.5, intensity) * Math.min(dt, 0.05) * 82;
      const emissions = Math.min(maxPerFrame, Math.floor(accumulated));
      mudEmissionRemainders[slot] = Math.min(0.999, accumulated - emissions);
      for (let i = 0; i < emissions; i++) {
        const p = allocateMud();
        const side = i % 2 === 0 ? -1 : 1;
        source.localToWorld(origin.set(side * rearHalfWidth, 0.22, rearLength));
        p.x = origin.x;
        p.y = origin.y;
        p.z = origin.z;
        const spread = (Math.random() - 0.5) * 3.8;
        const backSpeed = 0.8 + Math.random() * 2.9;
        p.vx = Math.sin(yaw) * backSpeed + Math.cos(yaw) * spread;
        p.vz = Math.cos(yaw) * backSpeed - Math.sin(yaw) * spread;
        p.grit = Math.random() < 0.24;
        p.vy = p.grit ? 1.0 + Math.random() * 1.6 :
          0.5 + Math.random() * 1.1;
        p.duration = p.grit ? 0.28 + Math.random() * 0.28 :
          0.48 + Math.random() * 0.36;
        p.diameter = p.grit ? 0.10 + Math.random() * 0.13 :
          0.38 + Math.random() * 0.38;
        p.opacity = p.grit ? 0.75 : 0.40;
        p.shade = 0.82 + Math.random() * 0.27;
        // Dust lands on the current road elevation, including crests.
        p.groundY = groundY + 0.11;
        p.landing = false;
        p.lifetime = p.duration;
      }
    }

    function tickMudParticles(dt, intensity, driver, opponents) {
      emitDrift(dt, intensity, visualBody, driver.yaw,
        Number(driver.roadY) || 0, 0);
      if (opponents) {
        for (const ai of opponents) {
          const slot = ai.id + 1;
          if (slot < 1 || slot >= mudEmissionRemainders.length) continue;
          const mesh = opponentMeshes.get(ai.id);
          const model = mesh?.userData?.opponentModel;
          const bike = model === "bike", kart = model === "kart";
          emitDrift(dt, mesh?.visible && !(ai.jumpY > 0)
            ? ai.skidIntensity : 0,
            mesh, mesh?.rotation?.y || 0,
            (mesh?.position?.y || 0) - (ai.jumpY || 0) - 0.14,
            slot, bike ? 0.25 : kart ? 0.84 : 0.92,
            bike ? 1.12 : kart ? 1.0 : 1.45, 3);
        }
      } else {
        mudEmissionRemainders.fill(0, 1);
      }
      // No GPU buffer uploads or even a particle draw while the effect rests.
      if (!hasMud) return;
      let live = 0;
      for (let i = 0; i < highWaterMark; i++) {
        const p = mudState[i], j = 3 * i, c = 4 * i;
        if (p.lifetime > 0) {
          p.lifetime -= dt;
          p.x += p.vx * dt;
          p.z += p.vz * dt;
          p.y += p.vy * dt;
          p.vy -= 7.5 * dt;
          if (p.y < p.groundY) p.lifetime = 0;
        }
        if (p.lifetime > 0) {
          live++;
          mudPositions[j] = p.x;
          mudPositions[j + 1] = p.y;
          mudPositions[j + 2] = p.z;
          const t = Math.min(1, p.lifetime / p.duration);
          // A quick newborn puff, then expanding translucent smoke. Flecks
          // remain small and more opaque, falling out before the smoke.
          const expansion = p.grit ? 0.75 + 0.2 * t : 0.7 + 0.85 * (1 - t);
          mudSizes[i] = p.diameter * expansion * (p.grit ? -1 : 1);
          const brightness = p.shade * (0.86 + 0.14 * t);
          mudColors[c] = brightness * (p.landing ? 0.88 : p.grit ? 0.34 : 0.66);
          mudColors[c + 1] = brightness * (p.landing ? 0.77 : p.grit ? 0.25 : 0.56);
          mudColors[c + 2] = brightness * (p.landing ? 0.60 : p.grit ? 0.16 : 0.43);
          mudColors[c + 3] = p.opacity * t * t;
        } else {
          mudPositions[j + 1] = -2000;
          mudColors[c + 3] = 0;
        }
      }
      hasMud = live > 0;
      mudGeometry.setDrawRange(0, hasMud ? highWaterMark : 0);
      mudPositionAttribute.needsUpdate = true;
      mudColorAttribute.needsUpdate = true;
      mudSizeAttribute.needsUpdate = true;
      // Canvas dimensions reflect live DPR / adaptive-resolution changes,
      // without layout reads, texture regeneration or shader recompilation.
      const height = viewportCanvas?.height;
      if (height > 0 && height !== mudMaterial.uniforms.viewportHeight.value) {
        mudMaterial.uniforms.viewportHeight.value = height;
      }
    }

    // Reuse the same GPU batch for the touchdown puff.
    function land(driver) {
      const groundY = (Number(driver.roadY) || 0) + 0.1;
      for (let i = 0; i < 20; i++) {
        const p = allocateMud();
        const angle = i * Math.PI * 2 / 20;
        const speed = 2.1 + (i % 4) * 0.42;
        p.x = driver.x + Math.cos(angle) * 0.62;
        p.z = driver.z + Math.sin(angle) * 0.62;
        p.y = groundY + 0.12;
        p.vx = Math.cos(angle) * speed;
        p.vz = Math.sin(angle) * speed;
        p.vy = 1.05 + (i % 3) * 0.27;
        p.duration = 0.34 + (i % 5) * 0.055;
        p.diameter = 0.4 + (i % 4) * 0.11;
        p.opacity = 0.52;
        p.shade = 0.95 + (i % 3) * 0.025;
        p.grit = false;
        p.lifetime = p.duration;
        p.groundY = groundY;
        p.landing = true;
      }
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
      land,
      update(dt, driver, mudIntensity, barrierContact, opponents = null) {
        tickMudParticles(dt, mudIntensity, driver, opponents);
        tickBarrierSparks(dt, barrierContact, driver);
      },
    });
  }

  return Object.freeze({ create });
})();
if (typeof window !== "undefined") window.GcvVisualEffects = GcvVisualEffects;
if (typeof module !== "undefined" && module.exports) module.exports = GcvVisualEffects;
