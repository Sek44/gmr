"use strict";

// Lightweight driving prototype. Three.js is imported from a pinned CDN version so GMR
// remains a static GitHub Pages site without an application build pipeline.
(async () => {
  const stage = document.getElementById("gcv-stage");
  const sceneHost = document.getElementById("gcv-scene");
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
  const replayButton = document.getElementById("race-replay-button");
  const raceFreeButton = document.getElementById("race-free-button");
  const notice = document.getElementById("gcv-notice");
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
  const Controls = window.GcvControls;
  const Hud = window.GcvHud;
  const MiniMap = window.GcvMiniMap;
  // Bump this revision after incompatible GCV updates. Old sessions are canceled.
  const SAVE_REVISION = 7;

  function announce(message) {
    notice.textContent = message;
    notice.hidden = !message;
  }

  try {
    if (!Physics || !TrackProgress || !Scenery || !World3D || !TrackLayout || !LapTimes || !Race || !Barriers || !Vehicles || !VisualEffects || !Controls || !Hud || !MiniMap)
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
    const hud = Hud.create({ document, LapTimes, Race });

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

    function refreshBests() { hud.refreshBests(lapRecords.top()); }
    function bestPosition(ms) {
      return LapTimes.qualifyingRank(lapRecords.top(), ms);
    }

    function holdFinishedLap(ms, rank = null) {
      // The stopwatch continues behind this short HUD-only display.
      lapHold = { ms, rank, remainingSeconds: 2 };
      refreshChrono();
    }

    function clearLapHold() {
      lapHold = null;
      refreshChrono();
    }

    function tickLapHold(dt) {
      if (!lapHold) return;
      lapHold.remainingSeconds -= dt;
      if (lapHold.remainingSeconds <= 0) clearLapHold();
    }

    function refreshChrono() { hud.refreshChrono(lapTimer, lapHold); }
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

    function syncRaceHud() {
      const refreshed = hud.syncRace({
        gameMode, raceState, lapCount: lapTracker.laps, lapHold,
        refreshResults: resultRefreshCooldown <= 0,
      });
      if (refreshed) resultRefreshCooldown = 0.25;
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

    const controls = Controls.create({
      window, document, stage,
      pad: document.getElementById("steer-pad"),
      knob: document.getElementById("steer-knob"),
      gasButton: document.getElementById("accelerate-button"),
      brakeButton: document.getElementById("brake-button"),
    });
    const clearControls = controls.clear;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

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
      hud.setLapCount(0);
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

    const miniMap = MiniMap.create({
      document, canvas: document.getElementById("mini-map"),
      positions, sides, SAMPLE_COUNT, ROAD_HALF_WIDTH, OUTER_HALF_WIDTH,
      islands, LapTimes, startIndex, startCenter, startSide,
    });
    function drawMap() {
      miniMap.draw(
        falling && fall ? { x: fall.x, z: fall.z, yaw: driver.yaw } : driver,
        gameMode === "race" && raceState ? raceState.opponents : null,
        opponentMeshes
      );
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
      hud.setLapCount(lapTracker.laps);
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
      const brakePressed = controls.isBraking();
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
        const { steer, accelerate, brake } = controls.read();
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
          hud.setLapCount(lapTracker.laps);
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
      hud.setSpeed(driver.speed);
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
