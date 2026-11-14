"use strict";

// Standalone deterministic rendering benchmark. Never imports play-time or game
// session services: running it cannot consume credits or overwrite race scores.
(async () => {
  const startButton = document.getElementById("benchmark-start");
  const status = document.getElementById("benchmark-status");
  const resultsPanel = document.getElementById("benchmark-results");
  const deviceLabel = document.getElementById("benchmark-device");
  const sizeLabel = document.getElementById("benchmark-render-size");
  const rows = document.getElementById("benchmark-result-rows");
  const extras = document.getElementById("benchmark-extras");
  const copyButton = document.getElementById("benchmark-copy");
  const restartButton = document.getElementById("benchmark-restart");
  const copyStatus = document.getElementById("benchmark-copy-status");
  const stage = document.getElementById("benchmark-stage");
  const sceneHost = document.getElementById("benchmark-scene");
  const summarize = window.GcvBenchmarkMetrics?.summarize;

  const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
  const BENCHMARK_VERSION = "gcv-render-v1";
  const WARMUP_MS = 1500;
  const SAMPLE_MS = 8000;
  const SPEED = 28; // metres/second; same deterministic route on every device
  const SCENARIOS = Object.freeze([
    { name: "Classique solo", track: "classic", vehicle: "classic", race: false },
    { name: "Classique course", track: "classic", vehicle: "classic", race: true },
    { name: "Moto solo", track: "classic", vehicle: "moto", race: false },
    { name: "Arc-en-ciel course", track: "rainbow", vehicle: "classic", race: true },
  ]);
  let running = false;
  let lastResult = null;

  function requireModules() {
    const names = ["GcvTrackLayout", "GcvBarriers", "GcvScenery", "GcvWorld3D",
      "GcvVehicles", "GcvRace", "GcvRendering", "GcvVisualEffects"];
    for (const name of names) {
      if (!window[name]) throw new Error("Module absent : " + name);
    }
    if (typeof summarize !== "function") throw new Error("Module de statistiques absent");
  }

  function build(THREE, trackId) {
    const startedAt = performance.now();
    const layout = window.GcvTrackLayout.select(trackId);
    const world = window.GcvWorld3D.create({
      THREE, TrackLayout: layout, Barriers: window.GcvBarriers,
      Scenery: window.GcvScenery,
    });
    const vehicles = window.GcvVehicles.create({
      THREE, scene: world.scene, Race: window.GcvRace,
      trackLength: world.trackLength, document,
    });
    const rendering = window.GcvRendering.create({
      THREE, window, stage, sceneHost, scene: world.scene,
      car: vehicles.car, wheelPivots: vehicles.wheelPivots,
      brakeLights: vehicles.brakeLights, rearBrakeGlows: vehicles.rearBrakeGlows,
      opponentMeshes: vehicles.opponentMeshes,
      extraWheelPivots: vehicles.extraWheelPivots, motoRider: vehicles.motoRider,
      curve: world.curve, startIndex: world.startIndex,
      SAMPLE_COUNT: world.SAMPLE_COUNT, trackLength: world.trackLength,
      closed: world.closed, heightAt: world.heightAt,
      onCameraVisibility: vehicles.setCameraMode,
    });
    const effects = window.GcvVisualEffects.create({
      THREE, scene: world.scene, car: vehicles.car,
    });
    const opponents = window.GcvRace.create(world.trackLength).opponents.map(
      (entry, index) => ({
        id: entry.id, progress: 0, lateral: ((index % 3) - 1) * 3,
      }));
    return {
      layout, world, vehicles, rendering, effects, opponents,
      setupMs: performance.now() - startedAt,
    };
  }

  function drawFrame(session, scenario, elapsedMs, dt) {
    const { world, rendering, vehicles, effects, opponents } = session;
    const distance = elapsedMs / 1000 * SPEED;
    const start = world.startIndex / world.SAMPLE_COUNT;
    const unboundedT = start + distance / world.trackLength;
    const t = world.closed
      ? ((unboundedT % 1) + 1) % 1
      : Math.min(0.99, unboundedT);
    const center = world.curve.getPointAt(t);
    const tangent = world.curve.getTangentAt(t);
    const driver = {
      x: center.x, z: center.z,
      yaw: Math.atan2(-tangent.x, -tangent.z),
      roadY: world.heightAt(t), jumpY: 0, speed: SPEED,
    };
    if (scenario.race) {
      for (let i = 0; i < opponents.length; i++) {
        const distanceAhead = distance + (i - 4) * 13;
        opponents[i].progress = world.closed
          ? ((distanceAhead % world.trackLength) + world.trackLength) % world.trackLength
          : Math.max(0, distanceAhead);
      }
      rendering.syncOpponents(opponents);
    } else {
      rendering.syncOpponents(null);
    }
    rendering.updatePlayer({ driver, fall: null, dt, brakePressed: false });
    effects.update(dt, driver, 0, null);
    rendering.updateCamera(dt);
    rendering.render();
    return rendering.getMetrics();
  }

  function measure(session, scenario, number, invalid) {
    return new Promise((resolve, reject) => {
      session.vehicles.setVehicle(scenario.vehicle);
      session.vehicles.setCameraMode(true);
      session.rendering.setVehicle(scenario.vehicle);
      session.rendering.setView(true);
      let firstTimestamp = null;
      let previousTimestamp = null;
      let lastStatusUpdate = -Infinity;
      const samples = [];
      const initialSize = [stage.clientWidth, stage.clientHeight];
      const totalMs = WARMUP_MS + SAMPLE_MS;

      function frame(timestamp) {
        if (invalid() || document.hidden) {
          reject(new Error("Test interrompu : onglet masqué."));
          return;
        }
        if (stage.clientWidth !== initialSize[0] ||
            stage.clientHeight !== initialSize[1]) {
          reject(new Error("Test interrompu : taille ou orientation modifiée."));
          return;
        }
        if (firstTimestamp === null) firstTimestamp = timestamp;
        const elapsed = timestamp - firstTimestamp;
        const intervalMs = previousTimestamp === null ? 0 :
          timestamp - previousTimestamp;
        const dt = Math.min(Math.max(intervalMs, 0) / 1000, 0.05);
        const cpuStart = performance.now();
        let frameStats;
        try {
          frameStats = drawFrame(session, scenario, elapsed, dt);
        } catch (error) {
          reject(error);
          return;
        }
        const cpuMs = performance.now() - cpuStart;
        if (elapsed >= WARMUP_MS &&
            previousTimestamp !== null &&
            previousTimestamp - firstTimestamp >= WARMUP_MS) {
          samples.push({
            intervalMs, cpuMs,
            drawCalls: frameStats.drawCalls ?? 0,
            triangles: frameStats.triangles ?? 0,
          });
        }
        previousTimestamp = timestamp;
        if (elapsed - lastStatusUpdate >= 1000) {
          lastStatusUpdate = elapsed;
          const progress = Math.min(100, Math.round(100 * elapsed / totalMs));
          status.textContent = "Scène " + number + "/" + SCENARIOS.length +
            " · " + scenario.name + " · " + progress + " %";
        }
        if (elapsed < totalMs) {
          requestAnimationFrame(frame);
        } else {
          const summary = summarize(samples);
          if (!summary || summary.frames < 10) {
            reject(new Error("Pas assez d'images mesurées pour conclure."));
            return;
          }
          resolve({
            name: scenario.name, track: scenario.track, vehicle: scenario.vehicle,
            opponents: scenario.race ? session.opponents.length : 0,
            ...summary, ...frameStats,
          });
        }
      }
      requestAnimationFrame(frame);
    });
  }

  function oneDecimal(value) {
    return Number.isFinite(value) ? value.toFixed(1) : "—";
  }
  function shortTriangles(value) {
    if (!Number.isFinite(value)) return "—";
    return value >= 1000 ? oneDecimal(value / 1000) + "k" : String(Math.round(value));
  }

  function showResults(report) {
    lastResult = report;
    document.body.classList.add("is-complete");
    deviceLabel.textContent = report.userAgent;
    sizeLabel.textContent = "Écran CSS : " + report.viewport.width + " × " +
      report.viewport.height + " · DPR appareil : " +
      oneDecimal(report.devicePixelRatio);
    rows.replaceChildren();
    extras.replaceChildren();
    for (const item of report.scenarios) {
      const tr = document.createElement("tr");
      const values = [
        item.name,
        oneDecimal(item.fps),
        oneDecimal(item.frameP95Ms) + " ms",
        String(Math.round(item.drawCallsAvg)),
        shortTriangles(item.trianglesAvg),
      ];
      for (const value of values) {
        const td = document.createElement("td");
        td.textContent = value;
        tr.append(td);
      }
      rows.append(tr);
      const extra = document.createElement("p");
      extra.textContent = item.name + " : " + item.framebufferWidth + "×" +
        item.framebufferHeight + " px · P99 " + oneDecimal(item.frameP99Ms) +
        " ms · images >33 ms " + oneDecimal(item.longFramePct) +
        "% · géom. " + (item.geometries ?? "—") +
        " · textures " + (item.textures ?? "—");
      extras.append(extra);
    }
    resultsPanel.hidden = false;
    status.textContent = "Test terminé.";
  }

  async function start() {
    if (running) return;
    running = true;
    startButton.disabled = true;
    status.textContent = "Chargement de Three.js et préparation...";
    let session = null;
    let hiddenDuringTest = false;
    const onVisibilityChange = () => {
      if (document.hidden) hiddenDuringTest = true;
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    try {
      requireModules();
      const THREE = await import(THREE_URL);
      const output = [];
      const setupTimes = [];
      for (let i = 0; i < SCENARIOS.length; i++) {
        const scenario = SCENARIOS[i];
        if (!session || session.layout.ID !== scenario.track) {
          session?.rendering.dispose();
          session = build(THREE, scenario.track);
          setupTimes.push({ track: scenario.track, setupMs: session.setupMs });
        }
        output.push(await measure(session, scenario, i + 1,
          () => hiddenDuringTest));
      }
      const report = {
        version: BENCHMARK_VERSION,
        date: new Date().toISOString(),
        userAgent: navigator.userAgent,
        viewport: { width: stage.clientWidth, height: stage.clientHeight },
        devicePixelRatio: window.devicePixelRatio || 1,
        warmupMs: WARMUP_MS, sampleMs: SAMPLE_MS, routeSpeedMs: SPEED,
        setupTimes, scenarios: output,
        note: "requestAnimationFrame and Three.js info; synthetic rendering only, no GPU timer, full gameplay physics or HUD",
      };
      showResults(report);
    } catch (error) {
      status.textContent = "Échec : " + (error?.message || String(error)) +
        " Recharge la page puis relance le test.";
      console.error("GCV benchmark failed:", error);
    } finally {
      session?.rendering.dispose();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      running = false;
      startButton.disabled = false;
    }
  }

  startButton.addEventListener("click", start);
  restartButton.addEventListener("click", () => window.location.reload());
  copyButton.addEventListener("click", async () => {
    if (!lastResult) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(lastResult, null, 2));
      copyStatus.textContent = "JSON copié. Tu peux le coller dans ChatGPT.";
    } catch {
      copyStatus.textContent = "Copie indisponible. Envoie une capture d'écran du tableau.";
    }
  });
})();
