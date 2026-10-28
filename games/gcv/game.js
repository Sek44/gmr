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
  const Rendering = window.GcvRendering;
  const Controls = window.GcvControls;
  const Hud = window.GcvHud;
  const MiniMap = window.GcvMiniMap;
  const Navigation = window.GcvNavigation;
  const Session = window.GcvSession;
  // Bump this revision after incompatible GCV updates. Old sessions are canceled.
  const SAVE_REVISION = 9;

  function announce(message) {
    notice.textContent = message;
    notice.hidden = !message;
  }

  try {
    if (!Physics || !TrackProgress || !Scenery || !World3D || !TrackLayout || !LapTimes || !Race || !Barriers || !Vehicles || !VisualEffects || !Rendering || !Controls || !Hud || !MiniMap || !Navigation || !Session)
      throw new Error("Les modules de conduite sont introuvables.");
    const THREE = await import("https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js");
    start(THREE);
  } catch (error) {
    console.error("GCV cannot start:", error);
    announce("Impossible de charger le jeu 3D. Vérifie ta connexion et recharge la page.");
  }

  function start(THREE) {
    const {
      scene, ROAD_HALF_WIDTH, OUTER_HALF_WIDTH, SAMPLE_COUNT, curve,
      trackLength, positions, directions, sides, barriers,
      startIndex, startCenter, startSide, startYaw, islands,
    } = World3D.create({ THREE, TrackLayout, Barriers, Scenery });
    const { car, wheelPivots, brakeLights, rearBrakeGlows, opponentMeshes, setCameraMode } =
      Vehicles.create({ THREE, scene, Race, trackLength, document });

    const rendering = Rendering.create({
      THREE, window, stage, sceneHost, scene, car, wheelPivots,
      brakeLights, rearBrakeGlows, opponentMeshes, curve,
      startIndex, SAMPLE_COUNT, trackLength,
    });
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
      rendering.syncOpponents(gameMode === "race" ? raceState?.opponents : null);
    }

    function syncRaceHud() {
      const refreshed = hud.syncRace({
        gameMode, raceState, lapCount: lapTracker.laps, lapHold,
        refreshResults: resultRefreshCooldown <= 0,
      });
      if (refreshed) resultRefreshCooldown = 0.25;
    }

    refreshBests();
    refreshChrono();
    let lastFrame = performance.now(), mapElapsed = 0;

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
      session?.changed();
    }

    const controls = Controls.create({
      window, document, stage,
      pad: document.getElementById("steer-pad"),
      knob: document.getElementById("steer-knob"),
      gasButton: document.getElementById("accelerate-button"),
      brakeButton: document.getElementById("brake-button"),
    });
    const clearControls = controls.clear;

    function refreshCameraButton() {
      const outside = cameraMode === "outside";
      cameraButton.querySelector(".gcv-action-label").textContent =
        outside ? "Caméra : extérieure" : "Caméra : intérieure";
      cameraButton.setAttribute("aria-label", outside ? "Passer en vue intérieure" : "Passer en vue extérieure");
      setCameraMode(outside);
      rendering.setView(outside);
    }
    cameraButton.addEventListener("click", () => {
      cameraMode = cameraMode === "inside" ? "outside" : "inside";
      refreshCameraButton();
      session?.changed();
    });

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

    function renderSession() {
      syncRaceCars();
      syncRaceHud();
      refreshCameraButton();
      refreshChrono();
      rendering.setView(cameraMode === "outside");
      updateCar(0);
      rendering.updateCamera(0);
      drawMap();
    }

    // A writable facade; the physics loop retains authority over simulation.
    const sessionState = {
      get driver() { return driver; }, set driver(v) { driver = v; },
      get cameraMode() { return cameraMode; }, set cameraMode(v) { cameraMode = v; },
      get lapTracker() { return lapTracker; }, set lapTracker(v) { lapTracker = v; },
      get lapTimer() { return lapTimer; }, set lapTimer(v) { lapTimer = v; },
      get gameMode() { return gameMode; }, set gameMode(v) { gameMode = v; },
      get raceState() { return raceState; }, set raceState(v) { raceState = v; },
      get freeSession() { return freeSession; }, set freeSession(v) { freeSession = v; },
      get falling() { return falling; }, set falling(v) { falling = v; },
      get fall() { return fall; }, set fall(v) { fall = v; },
      get respawnIndex() { return respawnIndex; }, set respawnIndex(v) { respawnIndex = v; },
      get hasActiveSession() { return hasActiveSession; },
      set hasActiveSession(v) { hasActiveSession = v; },
    };
    let session = null;
    const navigation = Navigation.create({
      window, document, location: window.location, stage, homePanel,
      resumeButton, menuButton, scoresButton, menuScoresButton, scoresFrame,
      fullscreenButton, menuFullscreenButton, clearControls,
      getMode: () => gameMode,
      hasSession: () => hasActiveSession,
      activateSession: () => { hasActiveSession = true; },
      onResume: () => { lastFrame = performance.now(); },
      changed: () => session?.changed(), announce,
    });
    session = Session.create({
      window, state: sessionState, revision: SAVE_REVISION,
      circuitKey, layoutVersion: TrackLayout.VERSION, positions, directions,
      startIndex, startCenter, startSide, startYaw, trackLength,
      SAMPLE_COUNT, OUTER_HALF_WIDTH, Physics, TrackProgress, LapTimes, Race,
      progressSamples, startOffset, closestRoad, snapBack, clearControls,
      clearLapHold, resetResultsCooldown: () => { resultRefreshCooldown = 0; },
      renderSession, setLapCount: (laps) => hud.setLapCount(laps), announce,
      resume: navigation.resume,
    });
    freeModeButton.addEventListener("click", session.chooseFree);
    raceModeButton.addEventListener("click", session.startRace);
    replayButton.addEventListener("click", session.startRace);
    raceFreeButton.addEventListener("click", session.chooseFree);
    restartButton.addEventListener("click", session.restartNearFinish);

    session.bind();
    syncRaceCars();
    syncRaceHud();
    navigation.sync(); // Always open on home, including after restoration.
    refreshCameraButton();

    function updateCar(dt, fallDt = dt) {
      if (navigation.paused && dt > 0) return;
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
            session?.changed();
          }
          for (const event of timing.events) {
            if (event.type === "lap") {
              const rank = bestPosition(event.ms);
              if (lapRecords.record(event.ms, event.splits)) {
                recordedLapThisFrame = true;
                refreshBests();
                holdFinishedLap(event.ms, rank);
                session?.changed();
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
          session?.changed();
        }
        syncRaceCars();
        syncRaceHud();
      }

      rendering.updatePlayer({
        driver, fall: falling ? fall : null, dt, brakePressed,
      });
      visualEffects.update(dt, driver, falling ? 0 : mudSkidIntensity,
        falling ? null : barrierSparkContact);
      hud.setSpeed(driver.speed);
      refreshChrono();
    }

    function frame(now) {
      requestAnimationFrame(frame);
      const realDt = Math.max(0, (now - lastFrame) / 1000);
      const dt = Math.min(realDt, 0.05);
      lastFrame = now;
      if (document.hidden) return;
      if (!navigation.paused) {
        resultRefreshCooldown = Math.max(0, resultRefreshCooldown - dt);
        updateCar(dt, realDt);
        tickLapHold(realDt);
        refreshChrono();
      }
      rendering.updateCamera(dt);
      session.tickAutosave(dt);
      mapElapsed += dt;
      if (mapElapsed >= 0.09) {
        mapElapsed = 0;
        drawMap();
      }
      rendering.render();
    }

    drawMap();
    updateCar(0);
    rendering.updateCamera(0);
    rendering.render();
    requestAnimationFrame(frame);
  }
})();
