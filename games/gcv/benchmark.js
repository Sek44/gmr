"use strict";

// Standalone, repeatable WebGL/JavaScript benchmark. It deliberately does not
// import play time, saved sessions, scores, or the full gameplay/HUD loop.
(async () => {
  const byId = (id) => document.getElementById(id);
  const startButton = byId("benchmark-start");
  const windowedButton = byId("benchmark-windowed");
  const exitFullscreenButton = byId("benchmark-exit-fullscreen");
  const status = byId("benchmark-status");
  const resultsPanel = byId("benchmark-results");
  const copyButton = byId("benchmark-copy");
  const restartButton = byId("benchmark-restart");
  const copyStatus = byId("benchmark-copy-status");
  const stage = byId("benchmark-stage");
  const sceneHost = byId("benchmark-scene");
  const config = window.GcvBenchmarkConfig;
  const metrics = window.GcvBenchmarkMetrics;
  const display = window.GcvBenchmarkDisplay;
  const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
  let running = false;
  let lastResult = null;
  let selectedPage = 0;

  function requireModules() {
    const names = ["GcvTrackLayout", "GcvTrackProgress", "GcvBarriers",
      "GcvScenery", "GcvWorld3D", "GcvVehicles", "GcvRace",
      "GcvRendering", "GcvVisualEffects", "GcvBenchmarkMetrics",
      "GcvBenchmarkConfig", "GcvBenchmarkDisplay"];
    for (const name of names) {
      if (!window[name]) throw new Error("Module absent : " + name);
    }
    if (!config.validatePlan()) throw new Error("Plan de test invalide");
  }

  function build(THREE, trackId) {
    const t0 = performance.now();
    const layout = window.GcvTrackLayout.select(trackId);
    const world = window.GcvWorld3D.create({
      THREE, TrackLayout: layout, Barriers: window.GcvBarriers,
      Scenery: window.GcvScenery,
    });
    const t1 = performance.now();
    const vehicles = window.GcvVehicles.create({
      THREE, scene: world.scene, Race: window.GcvRace,
      trackLength: world.trackLength, document,
    });
    const t2 = performance.now();
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
    const t3 = performance.now();
    const effects = window.GcvVisualEffects.create({
      THREE, scene: world.scene, car: vehicles.car,
    });
    // Deterministic AI seed; the benchmark uses scripted paths and never
    // runs Race.advance() or modifies actual race results.
    const opponents = window.GcvRace.create(world.trackLength, () => 0.5)
      .opponents.map((entry, index) => ({
        id: entry.id, progress: 0, lateral: ((index % 3) - 1) * 3,
      }));
    const t4 = performance.now();
    return {
      layout, world, vehicles, rendering, effects, opponents,
      setup: {
        track: trackId, totalMs: t4 - t0, worldMs: t1 - t0,
        vehiclesMs: t2 - t1, rendererMs: t3 - t2,
        effectsAndAiMs: t4 - t3,
      },
    };
  }

  function drawFrame(session, scenario, elapsedMs, dt) {
    const { world, rendering, effects, opponents } = session;
    const marks = [performance.now()];
    const distance = elapsedMs / 1000 * config.SPEED;
    const start = world.startIndex / world.SAMPLE_COUNT;
    const unboundedT = start + distance / world.trackLength;
    const t = world.closed ? ((unboundedT % 1) + 1) % 1 :
      Math.max(0, Math.min(0.99, unboundedT));
    const center = world.curve.getPointAt(t);
    const tangent = world.curve.getTangentAt(t);
    const driver = {
      x: center.x, z: center.z,
      yaw: Math.atan2(-tangent.x, -tangent.z),
      roadY: world.heightAt(t), jumpY: 0, speed: config.SPEED,
    };
    marks.push(performance.now());

    if (scenario.race) {
      for (let i = 0; i < opponents.length; i++) {
        const distanceAhead = distance + (i - 4) * 13;
        opponents[i].progress = world.closed
          ? ((distanceAhead % world.trackLength) + world.trackLength) %
            world.trackLength
          : Math.max(0, distanceAhead);
      }
      rendering.syncOpponents(opponents);
    } else {
      rendering.syncOpponents(null);
    }
    marks.push(performance.now());

    rendering.updatePlayer({ driver, fall: null, dt, brakePressed: false });
    marks.push(performance.now());

    effects.update(dt, driver, 0, null);
    marks.push(performance.now());

    rendering.updateCamera(dt);
    marks.push(performance.now());

    rendering.render();
    marks.push(performance.now());

    const phases = {};
    const keys = metrics.PHASES;
    for (let i = 0; i < keys.length; i++) {
      phases[keys[i]] = marks[i + 1] - marks[i];
    }
    return {
      counters: rendering.getMetrics(),
      cpuMs: marks[marks.length - 1] - marks[0],
      phases,
    };
  }

  function measure(session, scenario, number, invalid) {
    return new Promise((resolve, reject) => {
      session.vehicles.setVehicle(scenario.vehicle);
      session.vehicles.setCameraMode(true);
      session.rendering.setVehicle(scenario.vehicle);
      session.rendering.setView(true);
      session.rendering.setResolutionScale(scenario.scale);
      let firstTimestamp = null;
      let previousTimestamp = null;
      let lastStatusUpdate = -Infinity;
      const samples = [];
      const initialSize = [stage.clientWidth, stage.clientHeight];
      const totalMs = config.WARMUP_MS + config.SAMPLE_MS;
      let lastCounters = null;

      function frame(timestamp) {
        if (invalid() || document.hidden) {
          reject(new Error("Test interrompu : onglet masqué ou plein écran quitté."));
          return;
        }
        if (stage.clientWidth !== initialSize[0] ||
            stage.clientHeight !== initialSize[1]) {
          reject(new Error("Test interrompu : taille/orientation modifiée."));
          return;
        }
        if (firstTimestamp === null) firstTimestamp = timestamp;
        const elapsed = timestamp - firstTimestamp;
        const intervalMs = previousTimestamp === null ? 0 :
          timestamp - previousTimestamp;
        const dt = Math.min(Math.max(intervalMs, 0) / 1000, 0.05);
        let frameData;
        try {
          frameData = drawFrame(session, scenario, elapsed, dt);
        } catch (error) {
          reject(error);
          return;
        }
        lastCounters = frameData.counters;
        if (elapsed >= config.WARMUP_MS &&
            previousTimestamp !== null &&
            previousTimestamp - firstTimestamp >= config.WARMUP_MS) {
          samples.push({
            intervalMs, cpuMs: frameData.cpuMs,
            drawCalls: frameData.counters.drawCalls ?? 0,
            triangles: frameData.counters.triangles ?? 0,
            ...frameData.phases,
          });
        }
        previousTimestamp = timestamp;
        if (elapsed - lastStatusUpdate >= 1000) {
          lastStatusUpdate = elapsed;
          const progress = Math.min(100, Math.round(100 * elapsed / totalMs));
          status.textContent = "Test " + number + "/" + config.SCENARIOS.length +
            " · " + scenario.name + " · " + progress + " %";
        }
        if (elapsed < totalMs) {
          requestAnimationFrame(frame);
        } else {
          const summary = metrics.summarize(samples);
          if (!summary || summary.frames < 10) {
            reject(new Error("Mesures insuffisantes."));
            return;
          }
          resolve({
            id: scenario.id, name: scenario.name,
            track: scenario.track, vehicle: scenario.vehicle,
            group: scenario.group, scale: scenario.scale,
            opponents: scenario.race ? session.opponents.length : 0,
            ...summary, ...lastCounters,
          });
        }
      }
      requestAnimationFrame(frame);
    });
  }

  const numeric = (value, digits = 1) =>
    Number.isFinite(value) ? value.toFixed(digits) : "—";
  function compactTriangles(value) {
    return Number.isFinite(value)
      ? value >= 1000 ? numeric(value / 1000, 1) + "k" :
        String(Math.round(value))
      : "—";
  }
  function tableRow(targetId, values) {
    const tr = document.createElement("tr");
    for (const value of values) {
      const td = document.createElement("td");
      td.textContent = String(value);
      tr.append(td);
    }
    byId(targetId).append(tr);
  }
  function clearRows(...ids) {
    for (const id of ids) byId(id).replaceChildren();
  }
  function showPage(index) {
    selectedPage = Math.max(0, Math.min(2, index));
    for (const page of document.querySelectorAll("[data-report-page]")) {
      page.hidden = Number(page.dataset.reportPage) !== selectedPage;
    }
    byId("benchmark-page-number").textContent = (selectedPage + 1) + " / 3";
    byId("benchmark-prev").hidden = selectedPage === 0;
    byId("benchmark-next").hidden = selectedPage === 2;
    byId("benchmark-end-actions").hidden = selectedPage !== 2;
    copyStatus.textContent = "";
    window.scrollTo(0, 0);
  }

  function showResults(report) {
    lastResult = report;
    const baseline = report.scenarios.filter((item) => item.group === "baseline");
    const res = report.scenarios.filter((item) =>
      ["classic-race", "classic-race-75", "classic-race-55",
        "classic-race-repeat"].includes(item.id));
    const comparison = report.resolutionComparison;

    clearRows("benchmark-overview-rows", "benchmark-cpu-rows",
      "benchmark-phase-rows", "benchmark-resolution-rows");
    byId("benchmark-run-id").textContent =
      "Version " + report.version + " · " + report.date.slice(0, 16).replace("T", " ") +
      " UTC";
    byId("benchmark-viewport").textContent =
      "Écran CSS " + report.viewport.width + "×" + report.viewport.height +
      " · DPR " + numeric(report.devicePixelRatio, 2) +
      " · " + report.device.platform;
    byId("benchmark-capture-mode").textContent =
      "Mesure : " + (report.display.fullscreen ? "plein écran" : "fenêtre navigateur") +
      " · " + report.display.orientation;
    for (const item of baseline) {
      tableRow("benchmark-overview-rows", [
        item.name, numeric(item.fps), numeric(item.frameP95Ms),
        numeric(item.frameP99Ms), numeric(item.longFramePct),
        String(Math.round(item.drawCallsAvg)),
      ]);
      tableRow("benchmark-cpu-rows", [
        item.name, numeric(item.cpuAvgMs, 2), numeric(item.cpuP95Ms, 2),
        numeric(item.updateAvgMs, 2), numeric(item.submitAvgMs, 2),
      ]);
      tableRow("benchmark-phase-rows", [
        item.name, numeric(item.routeAvgMs, 2), numeric(item.opponentsAvgMs, 2),
        numeric(item.playerAvgMs, 2),
        numeric((item.effectsAvgMs ?? 0) + (item.cameraAvgMs ?? 0), 2),
      ]);
    }
    const baseRace = baseline.find((item) => item.id === "classic-race");
    byId("benchmark-baseline-detail").textContent = baseRace ?
      "Course classique : " + compactTriangles(baseRace.trianglesAvg) +
      " triangles/image · " + baseRace.geometries + " géom. · " +
      baseRace.textures + " textures · " +
      numeric(baseRace.frameMaxMs) + " ms au pire." : "";
    for (const item of res) {
      tableRow("benchmark-resolution-rows", [
        item.id === "classic-race-repeat" ? "100 % bis" :
          Math.round(item.scale * 100) + " %",
        item.framebufferWidth + "×" + item.framebufferHeight,
        numeric(item.fps), numeric(item.frameP95Ms),
        numeric(item.longFramePct),
      ]);
    }
    byId("benchmark-resolution-note").textContent = comparison ?
      (comparison.refreshCappedAt60 ?
        "Les quatre passages sont plafonnés vers 60 FPS : le gain éventuel " +
        "de résolution ne peut pas être estimé en FPS." :
        "Comparer la même course à différentes résolutions ; une hausse " +
        "d'images/s à basse résolution suggère un coût lié aux pixels.") +
      " Dérive 100 % début/fin : " + numeric(comparison.driftPct) + " %." : "";
    const setup = report.setupTimes.map((time) =>
      time.track + " : " + numeric(time.totalMs, 0) +
      " ms (monde " + numeric(time.worldMs, 0) + ", véhicules " +
      numeric(time.vehiclesMs, 0) + ", moteur WebGL " +
      numeric(time.rendererMs, 0) + ")").join(" · ");
    byId("benchmark-device").textContent = report.device.userAgent;
    byId("benchmark-hardware").textContent =
      "Threads logiques : " + (report.device.logicalCores ?? "—") +
      " · RAM déclarée : " + (report.device.memoryGb ?? "—") +
      " Go · Écran CSS : " + report.viewport.width + "×" +
      report.viewport.height + " · DPR " + numeric(report.devicePixelRatio, 2);
    byId("benchmark-display-info").textContent =
      "Mode mesuré : " + (report.display.fullscreen ? "plein écran" : "fenêtre") +
      " · " + report.display.orientation +
      " · " + (report.fullscreenRequested ? "plein écran demandé" :
        "mode fenêtre choisi");
    byId("benchmark-setup").textContent = setup;
    byId("benchmark-method").textContent =
      report.scenarios.length + " tests · " + (report.warmupMs / 1000) +
      " s d'échauffement + " + (report.sampleMs / 1000) +
      " s de mesure · " + report.routeSpeedMs +
      " m/s · GPU non chronométré.";
    resultsPanel.hidden = false;
    document.body.classList.add("is-complete");
    showPage(0);
    status.textContent = "Test terminé.";
    refreshFullscreenControl();
  }

  function refreshFullscreenControl() {
    exitFullscreenButton.hidden = !display?.isActive(document);
  }

  async function start(fullscreenRequested = true) {
    if (running) return;
    running = true;
    startButton.disabled = true;
    windowedButton.disabled = true;
    status.textContent = "Préparation du test...";
    let session = null;
    let hiddenDuringTest = false;
    let fullscreenChangedDuringTest = false;
    let lockedDisplay = null;
    const onVisibilityChange = () => {
      if (document.hidden) hiddenDuringTest = true;
    };
    const onFullscreenChange = () => {
      if (lockedDisplay &&
          display.isActive(document) !== lockedDisplay.fullscreen) {
        fullscreenChangedDuringTest = true;
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    try {
      requireModules();
      if (fullscreenRequested) {
        // Must happen inside the initial click's user activation, BEFORE
        // awaiting the network import or a requestAnimationFrame.
        status.textContent = "Activation du plein écran...";
        const requested = await display.enter(document);
        if (!requested.ok) {
          status.textContent = "Plein écran indisponible ou refusé (" +
            requested.reason + "). Choisis « Sans plein écran » pour tester.";
          return;
        }
      }
      // Allow browser chrome/viewport to settle after entering fullscreen.
      await new Promise((resolve) => requestAnimationFrame(() =>
        requestAnimationFrame(resolve)));
      lockedDisplay = display.snapshot(document, window, stage);
      if (fullscreenRequested && !lockedDisplay.fullscreen) {
        status.textContent = "Plein écran interrompu. Utilise « Sans plein écran ».";
        return;
      }
      refreshFullscreenControl();
      status.textContent = "Chargement de Three.js et préparation...";
      const THREE = await import(THREE_URL);
      const output = [];
      const setupTimes = [];
      for (let i = 0; i < config.SCENARIOS.length; i++) {
        const scenario = config.SCENARIOS[i];
        if (!session || session.layout.ID !== scenario.track) {
          session?.rendering.dispose();
          session = build(THREE, scenario.track);
          setupTimes.push(session.setup);
        }
        if (stage.clientWidth !== lockedDisplay.viewport.width ||
            stage.clientHeight !== lockedDisplay.viewport.height ||
            fullscreenChangedDuringTest) {
          throw new Error("Mode d'affichage modifié pendant le test.");
        }
        output.push(await measure(session, scenario, i + 1,
          () => hiddenDuringTest || fullscreenChangedDuringTest));
      }
      const report = {
        version: config.VERSION,
        date: new Date().toISOString(),
        device: {
          userAgent: navigator.userAgent,
          platform: navigator.platform || "Android / browser",
          logicalCores: navigator.hardwareConcurrency ?? null,
          memoryGb: navigator.deviceMemory ?? null,
        },
        viewport: lockedDisplay.viewport,
        devicePixelRatio: lockedDisplay.devicePixelRatio,
        display: lockedDisplay, fullscreenRequested,
        warmupMs: config.WARMUP_MS, sampleMs: config.SAMPLE_MS,
        routeSpeedMs: config.SPEED, setupTimes,
        scenarios: output,
        resolutionComparison: metrics.resolutionComparison(output),
        note: "JS phase timers are elapsed wall-clock durations, including possible driver stalls. No GPU execution, complete game physics, HUD or thermal sensors measured.",
      };
      showResults(report);
    } catch (error) {
      status.textContent = "Échec : " + (error?.message || String(error)) +
        " Recharge la page puis relance le test.";
      console.error("GCV benchmark failed:", error);
    } finally {
      session?.rendering.dispose();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      running = false;
      startButton.disabled = false;
      windowedButton.disabled = false;
    }
  }

  // Fullscreen is recommended, but the fallback is explicit and recorded.
  // Never silently treat a failed fullscreen request as a fullscreen run.
  startButton.addEventListener("click", () => start(true));
  windowedButton.addEventListener("click", () => start(false));
  document.addEventListener("fullscreenchange", refreshFullscreenControl);
  exitFullscreenButton.addEventListener("click", async () => {
    if (display.isActive(document) &&
        typeof document.exitFullscreen === "function") {
      try { await document.exitFullscreen(); } catch { /* Browser may deny. */ }
    }
    refreshFullscreenControl();
  });
  byId("benchmark-prev").addEventListener("click",
    () => showPage(selectedPage - 1));
  byId("benchmark-next").addEventListener("click",
    () => showPage(selectedPage + 1));
  restartButton.addEventListener("click", () => window.location.reload());
  copyButton.addEventListener("click", async () => {
    if (!lastResult) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(lastResult, null, 2));
      copyStatus.textContent = "JSON copié. Colle-le dans ChatGPT.";
    } catch {
      copyStatus.textContent =
        "Copie indisponible. Envoie les trois captures d'écran.";
    }
  });
})();
