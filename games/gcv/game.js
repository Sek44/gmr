"use strict";

// Lightweight driving prototype. Three.js is imported from a pinned CDN version so GMR
// remains a static GitHub Pages site without an application build pipeline.
(async () => {
  const stage = document.getElementById("gcv-stage");
  const sceneHost = document.getElementById("gcv-scene");
  const speedLabel = document.getElementById("speed-value");
  const gearLabel = document.getElementById("gear-value");
  const lapLabel = document.getElementById("lap-value");
  const sessionModeLabel = document.getElementById("session-mode-label");
  const chronoLabel = document.getElementById("lap-chrono");
  const chronoBox = document.getElementById("lap-chrono-box");
  const chronoTitle = document.getElementById("lap-chrono-title");
  const chronoRank = document.getElementById("lap-chrono-rank");
  const deltaLabel = document.getElementById("lap-delta");
  const deltaValue = document.getElementById("lap-delta-value");
  const splitLabel = document.getElementById("lap-split-label");
  const bestLabels = [1, 2, 3].map((rank) =>
    document.getElementById("best-lap-" + rank));
  const cameraButton = document.getElementById("camera-button");
  const fullscreenButton = document.getElementById("fullscreen-button");
  const restartButton = document.getElementById("restart-button");
  const homePanel = document.getElementById("gcv-home");
  const resumeButton = document.getElementById("resume-button");
  const menuButton = document.getElementById("menu-button");
  const menuFullscreenButton = document.getElementById("menu-fullscreen-button");
  const scoresButton = document.getElementById("scores-button");
  const menuScoresButton = document.getElementById("menu-scores-button");
  const scoresFrame = document.getElementById("gcv-scores");
  const freeModeButton = document.getElementById("free-mode-button");
  const raceModeButton = document.getElementById("race-mode-button");
  const racePositionBox = document.getElementById("race-position");
  const racePositionValue = document.getElementById("position-value");
  const raceLapLabel = document.getElementById("race-lap-label");
  const lapCountLabel = document.getElementById("lap-count-label");
  const raceOverlay = document.getElementById("race-overlay");
  const raceOverlayTitle = document.getElementById("race-overlay-title");
  const raceOverlaySubtitle = document.getElementById("race-overlay-subtitle");
  const raceOverlayActions = document.getElementById("race-overlay-actions");
  const raceResults = document.getElementById("race-results");
  const raceResultsBody = document.getElementById("race-results-body");
  const raceResultsStatus = document.getElementById("race-results-status");
  const replayButton = document.getElementById("race-replay-button");
  const raceFreeButton = document.getElementById("race-free-button");
  const notice = document.getElementById("gcv-notice");
  const pad = document.getElementById("steer-pad");
  const knob = document.getElementById("steer-knob");
  const gasButton = document.getElementById("accelerate-button");
  const brakeButton = document.getElementById("brake-button");
  const mapCanvas = document.getElementById("mini-map");
  const Physics = window.GcvPhysics;
  const TrackProgress = window.GcvTrackProgress;
  const Scenery = window.GcvScenery;
  const World3D = window.GcvWorld3D;
  const TrackLayout = window.GcvTrackLayout;
  const Barriers = window.GcvBarriers;
  const LapTimes = window.GcvLapTimes;
  const Race = window.GcvRace;
  const Vehicles = window.GcvVehicles;
  const VisualEffects = window.GcvVisualEffects;
  // Bump this revision after incompatible GCV updates. Old sessions are canceled.
  const SAVE_REVISION = 7;

  function announce(message) {
    notice.textContent = message;
    notice.hidden = !message;
  }

  try {
    if (!Physics || !TrackProgress || !Scenery || !World3D || !TrackLayout || !LapTimes || !Race || !Barriers || !Vehicles || !VisualEffects)
      throw new Error("Les modules de conduite sont introuvables.");
    const THREE = await import("https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js");
    start(THREE);
  } catch (error) {
    console.error("GCV cannot start:", error);
    announce("Impossible de charger le jeu 3D. Vérifie ta connexion et recharge la page.");
  }

  function start(THREE) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    sceneHost.append(renderer.domElement);

    const {
      scene, ROAD_HALF_WIDTH, OUTER_HALF_WIDTH, SAMPLE_COUNT, curve,
      trackLength, positions, directions, sides, barriers,
      startIndex, startCenter, startSide, startYaw, islands,
    } = World3D.create({ THREE, TrackLayout, Barriers, Scenery });
    const camera = new THREE.PerspectiveCamera(72, 1, 0.08, 2400);
    const { car, wheelPivots, brakeLights, rearBrakeGlows, opponentMeshes, setCameraMode } =
      Vehicles.create({ THREE, scene, Race, trackLength, document });

    const visualEffects = VisualEffects.create({ THREE, scene, car });

    // Start on a straight section, facing the road in its normal forward direction.
    const initialIndex = TrackLayout.nearestIndex(positions, TrackLayout.SPAWN);
    const initial = positions[initialIndex];
    let driver = {
      x: initial.x, z: initial.z,
      yaw: Math.atan2(-directions[initialIndex].x, -directions[initialIndex].z),
      speed: 0,
    };
    let cameraMode = "inside";
    function startOffset(index) {
      let samples = (index - startIndex + SAMPLE_COUNT) % SAMPLE_COUNT;
      if (samples > SAMPLE_COUNT / 2) samples -= SAMPLE_COUNT;
      return samples * trackLength / SAMPLE_COUNT;
    }
    const progressSamples = (metres) => metres * SAMPLE_COUNT / trackLength;
    let lapTracker = TrackProgress.createMotion(
      trackLength, startOffset(initialIndex), initialIndex);
    const lapRecords = LapTimes.createStore(TrackLayout);
    const circuitKey = LapTimes.circuitKey(TrackLayout);
    let lapTimer = LapTimes.initial(SAMPLE_COUNT, progressSamples(lapTracker.progress));
    let gameMode = "free";
    let raceState = null;
    let freeSession = null;
    let lapHold = null; // {ms, rank, remainingSeconds}; top chrono only, for 2s.
    let resultRefreshCooldown = 0;
    let menuOpen = true;
    let scoresOpen = false;
    let hasActiveSession = false;
    let falling = false, fall = null, respawnIndex = initialIndex;

    function refreshBests() {
      const records = lapRecords.top();
      bestLabels.forEach((label, index) => {
        label.textContent = records[index] ? LapTimes.format(records[index].ms) : "—";
      });
    }
    function bestPosition(ms) {
      return LapTimes.qualifyingRank(lapRecords.top(), ms);
    }

    function holdFinishedLap(ms, rank = null) {
      // The stopwatch continues behind this short HUD-only display.
      lapHold = { ms, rank, remainingSeconds: 2 };
      chronoBox.classList.add("is-lap-hold");
      refreshChrono();
    }

    function clearLapHold() {
      lapHold = null;
      chronoBox.classList.remove("is-lap-hold");
      refreshChrono();
    }

    function tickLapHold(dt) {
      if (!lapHold) return;
      lapHold.remainingSeconds -= dt;
      if (lapHold.remainingSeconds <= 0) clearLapHold();
    }

    function refreshChrono() {
      chronoLabel.textContent = lapHold
        ? LapTimes.format(lapHold.ms)
        : lapTimer.running ? LapTimes.format(lapTimer.elapsedMs) : "—";
      chronoTitle.textContent = lapHold ? "TOUR TERMINÉ" : "TOUR EN COURS";
      chronoRank.textContent = lapHold?.rank
        ? ["", "1er meilleur temps", "2e meilleur temps", "3e meilleur temps"][lapHold.rank]
        : "";
      chronoRank.hidden = !lapHold?.rank;
      const delta = lapTimer.delta;
      deltaValue.textContent = LapTimes.formatDelta(delta);
      splitLabel.textContent = "S" + (lapTimer.splitNumber || 1);
      deltaLabel.classList.toggle("is-faster", delta !== null && delta < -10);
      deltaLabel.classList.toggle("is-slower", delta !== null && delta > 10);
      deltaLabel.classList.toggle("is-even", delta !== null && Math.abs(delta) <= 10);
    }
    function syncRaceCars() {
      const active = gameMode === "race" && raceState !== null;
      for (const [id, mesh] of opponentMeshes) {
        const ai = active ? raceState.opponents.find((entry) => entry.id === id) : null;
        mesh.visible = Boolean(ai);
        if (!ai) continue;
        // The track is parametrized by arc length. Use it for all AI vehicles,
        // including on the final long straight.
        const t = (((startIndex / SAMPLE_COUNT + ai.progress / trackLength) % 1) + 1) % 1;
        const center = curve.getPointAt(t);
        const forward = curve.getTangentAt(t).normalize();
        const sideX = -forward.z, sideZ = forward.x;
        mesh.position.set(center.x + sideX * ai.lateral, 0.14,
          center.z + sideZ * ai.lateral);
        mesh.rotation.y = Math.atan2(-forward.x, -forward.z);
      }
    }

    function refreshClassification() {
      if (!raceState) return;
      const rows = Race.classification(raceState);
      const fragment = document.createDocumentFragment();
      for (const row of rows) {
        const tr = document.createElement("tr");
        const isPlayer = row.id === "player";
        if (isPlayer) tr.classList.add("is-player");
        if (!Number.isFinite(row.finishTime)) tr.classList.add("is-pending");
        const rank = document.createElement("td");
        rank.textContent = String(row.rank);
        const vehicle = document.createElement("td");
        if (!isPlayer) {
          const opponent = raceState.opponents.find((ai) => ai.id === row.id);
          const swatch = document.createElement("span");
          swatch.className = "gcv-car-swatch";
          swatch.style.backgroundColor = "#" + opponent.color.toString(16).padStart(6, "0");
          vehicle.append(swatch);
        }
        vehicle.append(document.createTextNode(isPlayer
          ? "Vous · n° 9" : "Voiture n° " + Race.opponentNumber(row.id)));
        const time = document.createElement("td");
        time.textContent = Number.isFinite(row.finishTime)
          ? LapTimes.format(row.finishTime * 1000) : "En course…";
        const gap = document.createElement("td");
        gap.textContent = Number.isFinite(row.gap)
          ? "+" + row.gap.toFixed(2) + " s" : "—";
        tr.append(rank, vehicle, time, gap);
        fragment.append(tr);
      }
      raceResultsBody.replaceChildren(fragment);
      const count = rows.filter((row) => Number.isFinite(row.finishTime)).length;
      raceResultsStatus.textContent = count === Race.GRID_COUNT
        ? "Les 10 voitures ont terminé." : count + " / 10 voitures à l’arrivée · les autres poursuivent la course.";
    }

    function syncRaceHud() {
      const racing = gameMode === "race" && raceState !== null;
      freeModeButton.classList.toggle("is-selected", !racing);
      raceModeButton.classList.toggle("is-selected", racing);
      freeModeButton.setAttribute("aria-pressed", String(!racing));
      raceModeButton.setAttribute("aria-pressed", String(racing));
      racePositionBox.hidden = !racing;
      sessionModeLabel.textContent = racing ? "Course · 10 voitures" : "Essais libres · N° 9";
      lapCountLabel.firstChild.textContent = racing ? "Tours en course : " : "Tours chronométrés : ";
      restartButton.textContent = racing ? "↻ Rejouer" : "↻ Départ";
      if (!racing) {
        raceOverlay.hidden = true;
        return;
      }
      racePositionValue.textContent = String(Race.position(raceState)) + "ᵉ";
      raceLapLabel.textContent = raceState.phase === "finished"
        ? Race.LAPS + " tours terminés" : "Tour " + Race.currentLap(raceState) + "/" + Race.LAPS;
      // Display validated physical lap crossings, not rounded estimated
      // distance (which can lag the finish when the samples jitter).
      lapLabel.textContent = String(lapTracker.laps);
      const phase = raceState.phase;
      raceOverlay.classList.toggle("is-results", phase === "finished");
      raceOverlay.hidden = phase === "racing" ||
        (phase === "finished" && lapHold !== null);
      raceOverlayActions.hidden = phase !== "finished";
      raceResults.hidden = phase !== "finished";
      if (phase === "finished" && resultRefreshCooldown <= 0) {
        refreshClassification();
        resultRefreshCooldown = 0.25;
      }
      if (phase === "staging") {
        raceOverlayTitle.textContent = "Prépare-toi !";
        raceOverlaySubtitle.textContent = "Les voitures se mettent en place…";
      } else if (phase === "countdown") {
        raceOverlayTitle.textContent = String(Math.max(1, Math.ceil(raceState.countdown)));
        raceOverlaySubtitle.textContent = "Départ dans " +
          String(Math.max(1, Math.ceil(raceState.countdown))) + "…";
      } else if (phase === "finished") {
        raceOverlayTitle.textContent = "Arrivée !";
        raceOverlaySubtitle.textContent =
          "Position : " + Race.position(raceState) + " / 10 · " +
          LapTimes.format(raceState.raceTime * 1000);
      }
    }

    function syncMenu() {
      homePanel.hidden = !menuOpen;
      stage.classList.toggle("gcv-in-menu", menuOpen);
      resumeButton.hidden = !hasActiveSession;
      resumeButton.textContent = gameMode === "race"
        ? "Reprendre la course" : "Reprendre les essais libres";
      scoresFrame.hidden = !scoresOpen;
      stage.classList.toggle("gcv-scores-open", scoresOpen);
    }

    function resumeGame() {
      menuOpen = false;
      hasActiveSession = true;
      syncMenu();
      lastFrame = performance.now();
      if (binding) binding.changed();
    }

    function openMenu() {
      clearControls();
      menuOpen = true;
      syncMenu();
      if (binding && hasActiveSession) binding.changed();
    }

    function openScores() {
      clearControls();
      scoresOpen = true;
      syncMenu();
      scoresFrame.src = "../../scores.html?game=gcv&from=gcv";
      if (binding && hasActiveSession) binding.changed();
    }

    function closeScores() {
      scoresOpen = false;
      scoresFrame.hidden = true;
      scoresFrame.removeAttribute("src");
      syncMenu();
      lastFrame = performance.now();
    }

    resumeButton.addEventListener("click", resumeGame);
    menuButton.addEventListener("click", openMenu);
    scoresButton.addEventListener("click", openScores);
    menuScoresButton.addEventListener("click", openScores);
    window.addEventListener("message", (event) => {
      if (scoresOpen && event.origin === location.origin &&
          event.source === scoresFrame.contentWindow &&
          event.data?.type === "gmr-scores-back") closeScores();
    });

    refreshBests();
    refreshChrono();
    let lastFrame = performance.now(), autosaveElapsed = 0, mapElapsed = 0;
    let initializedCamera = false;
    let binding = null;

    function closestRoad(x, z, hintIndex = null) {
      // Prefer nearby samples while still in the same road corridor. A tight
      // hairpin may be closer to a DIFFERENT section of this closed circuit.
      return TrackProgress.nearestSample(positions, SAMPLE_COUNT, x, z,
        hintIndex, 12, OUTER_HALF_WIDTH);
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
      // A fall only wastes time. Keep elapsed time, the three sectors
      // already reached and the current reference delta intact. Relocation
      // changes no accumulated lap progress and cannot count as a shortcut.
      lapTracker = TrackProgress.relocate(lapTracker, index);
      refreshChrono();
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

    function startRace() {
      // Preserve a running time trial when switching to race mode.
      if (gameMode === "free") freeSession = snapshot();
      clearControls();
      gameMode = "race";
      clearLapHold();
      resultRefreshCooldown = 0;
      const grid = Race.gridSlot(Race.PLAYER_SLOT);
      const start = startCenter.clone()
        .addScaledVector(directions[startIndex], -grid.distance)
        .addScaledVector(startSide, grid.lateral);
      const current = closestRoad(start.x, start.z).index;
      driver = { x: start.x, z: start.z, yaw: startYaw, speed: 0, reverseHold: 0 };
      falling = false;
      fall = null;
      respawnIndex = current;
      lapTracker = TrackProgress.createMotion(
        trackLength, -grid.distance, current);
      raceState = Race.create(trackLength, Math.random, lapTracker);
      lapTimer = LapTimes.initial(SAMPLE_COUNT, progressSamples(lapTracker.progress));
      announce("");
      initializedCamera = false;
      syncRaceCars();
      syncRaceHud();
      refreshChrono();
      updateCar(0);
      updateCamera(0);
      drawMap();
      resumeGame();
    }

    function chooseFree() {
      if (gameMode === "free") { resumeGame(); return; }
      clearLapHold();
      resultRefreshCooldown = 0;
      const priorFree = freeSession;
      clearControls();
      gameMode = "free";
      raceState = null;
      freeSession = null;
      if (priorFree && LapTimes.sameCircuitRoute(priorFree.circuitKey, circuitKey)) {
        restore(priorFree);
      } else {
        restartNearFinish();
      }
      syncRaceCars();
      syncRaceHud();
      refreshCameraButton();
      refreshChrono();
      initializedCamera = false;
      updateCar(0);
      updateCamera(0);
      drawMap();
      resumeGame();
    }
    freeModeButton.addEventListener("click", chooseFree);
    raceModeButton.addEventListener("click", startRace);
    replayButton.addEventListener("click", startRace);
    raceFreeButton.addEventListener("click", chooseFree);

    function restartNearFinish() {
      if (gameMode === "race") { startRace(); return; }
      clearLapHold();
      // Put the car exactly ten metres before the visible finish line,
      // facing in the racing direction. This resets the CURRENT attempt,
      // not the permanent top-three lap records.
      const beforeLine = startCenter.clone().addScaledVector(directions[startIndex], -10);
      const index = closestRoad(beforeLine.x, beforeLine.z).index;
      clearControls();
      driver = { x: beforeLine.x, z: beforeLine.z, yaw: startYaw,
        speed: 0, reverseHold: 0 };
      falling = false;
      fall = null;
      respawnIndex = index;
      lapTracker = TrackProgress.createMotion(trackLength, -10, index);
      lapTimer = LapTimes.initial(SAMPLE_COUNT, progressSamples(lapTracker.progress));
      lapLabel.textContent = "0";
      refreshChrono();
      announce("");
      initializedCamera = false;
      updateCar(0);
      updateCamera(0);
      drawMap();
      if (binding) binding.changed();
    }
    restartButton.addEventListener("click", restartNearFinish);

    function refreshCameraButton() {
      const outside = cameraMode === "outside";
      cameraButton.querySelector(".gcv-action-label").textContent =
        outside ? "Caméra : extérieure" : "Caméra : intérieure";
      cameraButton.setAttribute("aria-label", outside ? "Passer en vue intérieure" : "Passer en vue extérieure");
      setCameraMode(outside);
      initializedCamera = false;
    }
    cameraButton.addEventListener("click", () => {
      cameraMode = cameraMode === "inside" ? "outside" : "inside";
      refreshCameraButton();
      if (binding) binding.changed();
    });

    function refreshFullscreen() {
      const full = document.fullscreenElement === stage;
      for (const button of [fullscreenButton, menuFullscreenButton]) {
        button.querySelector(".gcv-action-label").textContent =
          full ? "Écran normal" : "Plein écran";
        button.classList.toggle("is-fullscreen", full);
        button.setAttribute("aria-label",
          full ? "Quitter le plein écran" : "Passer en plein écran");
        button.title = full ? "Quitter le plein écran" : "Passer en plein écran";
      }
    }
    async function toggleFullscreen() {
      try {
        if (document.fullscreenElement === stage) {
          await document.exitFullscreen();
        } else if (stage.requestFullscreen) {
          await stage.requestFullscreen();
        } else {
          menuFullscreenButton.querySelector(".gcv-action-label").textContent = "Plein écran non disponible";
          announce("Plein écran non disponible dans ce navigateur.");
        }
      } catch (error) {
        console.warn("Fullscreen failed:", error);
        menuFullscreenButton.querySelector(".gcv-action-label").textContent = "Plein écran refusé";
        announce("Le plein écran a été refusé par le navigateur.");
      }
    }
    fullscreenButton.addEventListener("click", toggleFullscreen);
    menuFullscreenButton.addEventListener("click", toggleFullscreen);
    document.addEventListener("fullscreenchange", refreshFullscreen);
    refreshFullscreen();

    const map = mapCanvas.getContext("2d");
    const bounds = positions.slice(0, SAMPLE_COUNT).reduce((acc, p) => ({
      minX: Math.min(acc.minX, p.x), maxX: Math.max(acc.maxX, p.x),
      minZ: Math.min(acc.minZ, p.z), maxZ: Math.max(acc.maxZ, p.z),
    }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
    const mapWidth = mapCanvas.width, mapHeight = mapCanvas.height;
    const mapScale = Math.min((mapWidth - 74) / (bounds.maxX - bounds.minX),
      (mapHeight - 56) / (bounds.maxZ - bounds.minZ));
    const mapCenterX = (bounds.minX + bounds.maxX) / 2;
    const mapCenterZ = (bounds.minZ + bounds.maxZ) / 2;
    const toMap = (x, z) => [
      mapWidth / 2 + (x - mapCenterX) * mapScale,
      mapHeight / 2 + (z - mapCenterZ) * mapScale,
    ];

    // Pre-render the static satellite-style minimap just once. Colors match
    // sea, sandy islands, muddy roadway and light earth safety shoulders.
    const mapBackground = document.createElement("canvas");
    mapBackground.width = mapWidth;
    mapBackground.height = mapHeight;
    const satellite = mapBackground.getContext("2d");
    if (satellite) {
      const waterGradient = satellite.createLinearGradient(0, 0, 0, mapHeight);
      waterGradient.addColorStop(0, "#376e7f");
      waterGradient.addColorStop(1, "#28566b");
      satellite.fillStyle = waterGradient;
      satellite.fillRect(0, 0, mapWidth, mapHeight);

      function islandCircle(x, y, radius, color) {
        satellite.beginPath();
        satellite.arc(x, y, radius, 0, Math.PI * 2);
        satellite.fillStyle = color;
        satellite.fill();
      }
      for (const island of islands) {
        const [x, y] = toMap(island.x, island.z);
        islandCircle(x, y, island.rockRadius * mapScale, "#485b64");
        islandCircle(x - 2, y - 2, island.rockRadius * mapScale * 0.72, "#71828a");
      }

      function drawCourse(width, color) {
        satellite.beginPath();
        positions.forEach((p, index) => {
          const [x, y] = toMap(p.x, p.z);
          if (index === 0) satellite.moveTo(x, y);
          else satellite.lineTo(x, y);
        });
        satellite.closePath();
        satellite.lineCap = "round";
        satellite.lineJoin = "round";
        satellite.strokeStyle = color;
        satellite.lineWidth = width;
        satellite.stroke();
      }
      drawCourse(OUTER_HALF_WIDTH * 2 * mapScale + 3, "#534c3e");
      drawCourse(OUTER_HALF_WIDTH * 2 * mapScale, "#b29871");
      drawCourse(ROAD_HALF_WIDTH * 2 * mapScale, "#856044");

      // Uneven muddy details visible from above; no painted centerline.
      for (let i = 0; i < SAMPLE_COUNT; i += 9) {
        const position = positions[i], normal = sides[i];
        const offset = ((i * 17) % 19 - 9) * 0.65;
        const [x, y] = toMap(position.x + normal.x * offset,
          position.z + normal.z * offset);
        islandCircle(x, y, 1.6 + (i % 3), "#6f523c");
      }

      // Three visual sector checkpoints correspond exactly to the timer.
      LapTimes.SPLIT_FRACTIONS.forEach((fraction, index) => {
        const splitIndex = (startIndex + Math.round(SAMPLE_COUNT * fraction)) % SAMPLE_COUNT;
        const [sx, sy] = toMap(positions[splitIndex].x, positions[splitIndex].z);
        islandCircle(sx, sy, 7, "#15354d");
        islandCircle(sx, sy, 5, "#f8d690");
        satellite.font = "bold 9px system-ui";
        satellite.textAlign = "center";
        satellite.textBaseline = "middle";
        satellite.fillStyle = "#1d2834";
        satellite.fillText(String(index + 1), sx, sy);
      });

      // Finish line marker: a short contrasting crossing and flag, separate
      // from roadway lane markings.
      const [fx, fy] = toMap(startCenter.x, startCenter.z);
      satellite.save();
      satellite.translate(fx, fy);
      satellite.rotate(Math.atan2(startSide.z, startSide.x));
      satellite.fillStyle = "#332b28";
      satellite.fillRect(-ROAD_HALF_WIDTH * mapScale, -2, ROAD_HALF_WIDTH * 2 * mapScale, 4);
      satellite.fillStyle = "#ebd2a0";
      for (let i = 0; i < 8; i += 2) {
        satellite.fillRect(-ROAD_HALF_WIDTH * mapScale + i * ROAD_HALF_WIDTH * mapScale / 4,
          -2, ROAD_HALF_WIDTH * mapScale / 4, 2);
      }
      satellite.restore();
      satellite.fillStyle = "#ffffff";
      satellite.strokeStyle = "#243f4e";
      satellite.lineWidth = 3;
      satellite.font = "bold 17px system-ui";
      satellite.strokeText("⚑", fx + 9, fy - 10);
      satellite.fillText("⚑", fx + 9, fy - 10);
    }

    function drawMap() {
      if (!map) return;
      map.clearRect(0, 0, mapWidth, mapHeight);
      if (satellite) map.drawImage(mapBackground, 0, 0);
      if (gameMode === "race" && raceState) {
        // Tiny opponent markers on the same map as the player.
        for (const ai of raceState.opponents) {
          const mesh = opponentMeshes.get(ai.id);
          if (!mesh) continue;
          const [ax, ay] = toMap(mesh.position.x, mesh.position.z);
          map.beginPath();
          map.arc(ax, ay, 4.4, 0, Math.PI * 2);
          map.fillStyle = "#" + ai.color.toString(16).padStart(6, "0");
          map.strokeStyle = "#152e42";
          map.lineWidth = 1.5;
          map.fill();
          map.stroke();
        }
      }
      const x = falling && fall ? fall.x : driver.x;
      const z = falling && fall ? fall.z : driver.z;
      const [px, py] = toMap(x, z);
      map.save();
      map.shadowColor = "#16212a";
      map.shadowBlur = 7;
      map.fillStyle = "#ed4857";
      map.strokeStyle = "#ffffff";
      map.lineWidth = 3;
      map.beginPath();
      map.arc(px, py, 8, 0, Math.PI * 2);
      map.fill();
      map.stroke();
      map.shadowBlur = 0;
      map.beginPath();
      map.moveTo(px, py);
      map.lineTo(px - Math.sin(driver.yaw) * 17, py - Math.cos(driver.yaw) * 17);
      map.stroke();
      map.restore();
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
      // A saved fall must restore the same track hint in both the player's
      // progress and the race snapshot; relocation grants no travel.
      const savedMotion = falling
        ? TrackProgress.relocate(lapTracker, respawnIndex) : lapTracker;
      return {
        saveRevision: SAVE_REVISION,
        x: safe.x, z: safe.z,
        yaw: falling ? Math.atan2(-directions[respawnIndex].x, -directions[respawnIndex].z) : driver.yaw,
        speed: falling ? 0 : driver.speed,
        reverseHold: falling ? 0 : driver.reverseHold,
        camera: cameraMode,
        motion: savedMotion,
        // On refresh during a fall the car respawns safely, but the active
        // stopwatch must continue from the preserved elapsed time.
        lapTimer,
        mode: gameMode,
        race: gameMode === "race" && raceState
          ? { ...raceState, playerMotion: savedMotion,
            playerProgress: savedMotion.progress }
          : null,
        freeSession: gameMode === "race" ? freeSession : null,
        circuitKey,
        layoutVersion: TrackLayout.VERSION,
      };
    }
    function restore(saved) {
      if (!saved || saved.saveRevision !== SAVE_REVISION) return;
      // The redesigned, longer circuit invalidates prior saved coordinates
      // and lap progress; retain the view but start a clean free-drive session.
      if (!LapTimes.sameCircuitRoute(saved.circuitKey, circuitKey) ||
          saved.layoutVersion !== TrackLayout.VERSION) {
        cameraMode = saved.camera === "outside" ? "outside" : "inside";
        return;
      }
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
      lapTracker = TrackProgress.createMotion(
        trackLength, startOffset(nearestIndex), nearestIndex, saved.motion);
      lapTimer = LapTimes.restore(saved.lapTimer, SAMPLE_COUNT,
        progressSamples(lapTracker.progress));
      lapLabel.textContent = String(lapTracker.laps);
      refreshChrono();
      cameraMode = saved.camera === "outside" ? "outside" : "inside";
      const restoredRace = saved.mode === "race"
        ? Race.restore(saved.race, trackLength) : null;
      gameMode = restoredRace ? "race" : "free";
      raceState = restoredRace;
      if (restoredRace) lapTracker = restoredRace.playerMotion;
      freeSession = restoredRace &&
        LapTimes.sameCircuitRoute(saved.freeSession?.circuitKey, circuitKey)
        ? saved.freeSession : null;
      syncRaceCars();
      syncRaceHud();
      hasActiveSession = true;
    }
    const sessionStore = window.GameState.create("gcv");
    const previousSession = sessionStore.load();
    if (previousSession && previousSession.saveRevision !== SAVE_REVISION) {
      sessionStore.clear(); // Keep lap records and score history untouched.
    }
    binding = sessionStore.bind({ snapshot, restore });
    syncRaceCars();
    syncRaceHud();
    syncMenu(); // Always open on the home screen, even for saved games.
    refreshCameraButton();

    function updateCar(dt, fallDt = dt) {
      if ((menuOpen || scoresOpen) && dt > 0) return;
      const brakePressed = brakePointers.size > 0 || keys.has("arrowdown") || keys.has("s");
      let mudSkidIntensity = 0;
      let barrierSparkContact = null;
      let raceMotion = null;
      let recordedLapThisFrame = false;
      const mayDrive = gameMode === "free" || raceState?.phase === "racing";
      if (falling) {
        // Falling is part of this timed lap. Count only the actual remaining
        // fall duration (not a potential huge background-tab frame).
        const fallingStep = Math.min(fall.remaining, fallDt);
        lapTimer = LapTimes.elapse(lapTimer, fallingStep * 1000);
        fall = Physics.advanceFall(fall, fallingStep);
        if (fall.remaining <= 0.000001) {
          snapBack(respawnIndex);
        } else {
          announce("Chute dans le vide ! Retour dans " + fall.remaining.toFixed(1) + " s");
        }
      } else if (mayDrive) {
        const steer = refreshPad();
        const accelerate = gasPointers.size > 0 || keys.has("arrowup") || keys.has("w");
        const brake = brakePressed;
        // The dirt course now handles like the previous paved road, including
        // its safety shoulders. Only truly extreme steering emits particles.
        const previousPosition = { x: driver.x, z: driver.z };
        driver = Physics.advance(driver, { steer, accelerate, brake }, dt);
        mudSkidIntensity = Physics.skidIntensity(driver.speed, steer);
        let nearest = closestRoad(driver.x, driver.z, lapTracker.index);
        // Slide along the barrier and progressively match its forward
        // direction, even when the player keeps steering into the wall.
        const barrierContact = Barriers.resolve(previousPosition, driver,
          nearest.index, positions[nearest.index], sides[nearest.index],
          barriers, dt);
        if (barrierContact.collided) {
          // Apply the speed loss returned by the collision physics, too.
          driver.x = barrierContact.x;
          driver.z = barrierContact.z;
          driver.yaw = barrierContact.yaw;
          driver.speed = barrierContact.speed;
          const center = positions[nearest.index], side = sides[nearest.index];
          const lateral = (driver.x - center.x) * side.x +
            (driver.z - center.z) * side.z;
          const sign = Math.sign(lateral);
          barrierSparkContact = {
            x: driver.x + sign * side.x * Barriers.CAR_RADIUS,
            z: driver.z + sign * side.z * Barriers.CAR_RADIUS,
            nx: sign * side.x, nz: sign * side.z,
          };
          nearest = closestRoad(driver.x, driver.z, lapTracker.index);
        }
        if (nearest.distanceSquared > OUTER_HALF_WIDTH * OUTER_HALF_WIDTH) {
          // Keep the speed and forward momentum in the air. Begin both the
          // gravity animation and the two-second countdown at this instant.
          falling = true;
          // Keep the same timed lap: the recovery delay is the penalty.
          lapTimer = LapTimes.elapse(lapTimer, dt * 1000);
          respawnIndex = nearest.index;
          // Advance the fall on this very first rendering frame: no
          // horizontal glide before the car starts dropping visibly.
          fall = Physics.advanceFall(Physics.startFall(driver), dt);
          announce("Chute dans le vide ! Retour dans " + fall.remaining.toFixed(1) + " s");
        } else {
          // Longitudinal motion is measured once for both the chrono and
          // the live classification. Road samples only locate the tangent.
          const travel = TrackProgress.alongTrackTravel(
            previousPosition, driver, directions[nearest.index]);
          const crossing = TrackProgress.finishCrossing(
            previousPosition, driver, startCenter, directions[startIndex],
            OUTER_HALF_WIDTH);
          const progressBefore = lapTracker.progress;
          const motion = TrackProgress.move(
            lapTracker, trackLength, travel, crossing, nearest.index, SAMPLE_COUNT);
          lapTracker = motion.state;
          if (gameMode === "race") raceMotion = motion;
          // Sector timing uses signed travel, not the artificial distance
          // alignment performed at a validated finish line.
          const timing = LapTimes.advance(lapTimer,
            progressSamples(progressBefore), progressSamples(motion.sectorProgress),
            fallDt * 1000, SAMPLE_COUNT, lapRecords.best());
          lapTimer = timing.state;
          for (const event of motion.events) {
            const finish = LapTimes.crossFinish(
              lapTimer, event.fraction, fallDt * 1000, SAMPLE_COUNT,
              progressSamples(event.progress));
            lapTimer = finish.state;
            timing.events.push(...finish.events);
            if (binding) binding.changed();
          }
          for (const event of timing.events) {
            if (event.type === "lap") {
              const rank = bestPosition(event.ms);
              if (lapRecords.record(event.ms, event.splits)) {
                recordedLapThisFrame = true;
                refreshBests();
                holdFinishedLap(event.ms, rank);
                if (binding) binding.changed();
              }
            }
          }
          lapLabel.textContent = String(lapTracker.laps);
        }
      }

      if (gameMode === "race" && raceState) {
        const wasRacing = raceState.phase === "racing";
        const previousLapCount = raceState.playerLapTimes?.length || 0;
        raceState = Race.advance(raceState, dt, raceMotion || 0);
        lapTracker = raceState.playerMotion;
        const completedLaps = raceState.playerLapTimes?.length || 0;
        if (completedLaps > previousLapCount && !recordedLapThisFrame) {
          // A fall or a missed sector can invalidate the time-trial record,
          // but the actual race lap must always get a time announcement.
          const lapMs = raceState.playerLapTimes[completedLaps - 1] * 1000;
          holdFinishedLap(lapMs);
        }
        if (wasRacing && raceState.phase === "finished") {
          resultRefreshCooldown = 0;
          driver.speed = 0;
          clearControls();
          if (binding) binding.changed();
        }
        syncRaceCars();
        syncRaceHud();
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
      brakeLights.emissiveIntensity = brakePressed ? 3.8 : 0.15;
      for (const glow of rearBrakeGlows) glow.intensity = brakePressed ? 3.5 : 0;
      visualEffects.update(dt, driver, falling ? 0 : mudSkidIntensity,
        falling ? null : barrierSparkContact);
      speedLabel.textContent = String(Math.round(Math.abs(driver.speed) * 3.6));
      gearLabel.textContent = driver.speed < -0.02 ? "R" : "";
      refreshChrono();
    }

    function updateCamera(dt) {
      const inside = cameraMode === "inside";
      const desiredPosition = car.localToWorld(inside
        ? new THREE.Vector3(-0.42, 1.51, 0.34) // Higher view, fixed above the lowered wheel.
        : new THREE.Vector3(0, 4.5, 9.7));
      const desiredTarget = car.localToWorld(inside
        ? new THREE.Vector3(-0.42, 1.49, -14)
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
      if (!menuOpen && !scoresOpen) {
        resultRefreshCooldown = Math.max(0, resultRefreshCooldown - dt);
        updateCar(dt, realDt);
        tickLapHold(realDt);
        refreshChrono();
      }
      updateCamera(dt);
      autosaveElapsed += dt;
      if (hasActiveSession && autosaveElapsed >= 1.5) {
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
