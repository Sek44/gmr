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
  const Tracks = window.GcvTrackLayout;
  const selectedTrackId = new URL(window.location.href).searchParams.get("track");
  const TrackLayout = Tracks.select(selectedTrackId);
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
  const Flow = window.GcvFlow;
  // Bump this revision after incompatible GCV updates. Old sessions are canceled.
  const SAVE_REVISION = 11;

  function announce(message) {
    notice.textContent = message;
    notice.hidden = !message;
  }

  try {
    if (!Physics || !TrackProgress || !Scenery || !World3D || !TrackLayout || !LapTimes || !Race || !Barriers || !Vehicles || !VisualEffects || !Rendering || !Controls || !Hud || !MiniMap || !Navigation || !Session || !Flow)
      throw new Error("Les modules de conduite sont introuvables.");
    const THREE = await import("https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js");
    start(THREE);
  } catch (error) {
    console.error("Super Kart cannot start:", error);
    // Notices behind the home panel are deliberately hidden in menu mode.
    // Display initialization errors IN the panel rather than leaving inert
    // buttons with no explanation on phones and tablets.
    const message = document.createElement("p");
    message.className = "gcv-startup-error";
    message.setAttribute("role", "alert");
    message.textContent = "Impossible de démarrer le circuit. Recharge la page.";
    homePanel.querySelector(".gcv-home-panel")?.append(message);
  }

  function start(THREE) {
    const {
      scene, ROAD_HALF_WIDTH, OUTER_HALF_WIDTH, SAMPLE_COUNT, curve,
      trackLength, positions, directions, sides, barriers,
      startIndex, finishIndex, startCenter, finishCenter, startSide, startYaw,
      islands, closed, heightAt,
    } = World3D.create({ THREE, TrackLayout, Barriers, Scenery });
    const {
      car, wheelPivots, extraWheelPivots, brakeLights, rearBrakeGlows,
      opponentMeshes, motoRider, setCameraMode, setVehicle,
    } = Vehicles.create({ THREE, scene, Race, trackLength, document });

    const rendering = Rendering.create({
      THREE, window, stage, sceneHost, scene, car, wheelPivots,
      brakeLights, rearBrakeGlows, opponentMeshes, extraWheelPivots, motoRider, curve,
      startIndex, SAMPLE_COUNT, trackLength, closed, heightAt,
    });
    const visualEffects = VisualEffects.create({ THREE, scene, car });
    const hud = Hud.create({ document, LapTimes, Race, layout: TrackLayout });
    const routeLength = closed ? trackLength :
      (finishIndex - startIndex) * trackLength / SAMPLE_COUNT;
    const timingSamples = closed ? SAMPLE_COUNT :
      Math.round(routeLength * SAMPLE_COUNT / trackLength);

    // Start on a straight section, facing the road in its normal forward direction.
    const initialIndex = TrackLayout.nearestIndex(positions, TrackLayout.SPAWN);
    const initial = positions[initialIndex];
    let driver = {
      x: initial.x, z: initial.z,
      yaw: Math.atan2(-directions[initialIndex].x, -directions[initialIndex].z),
      speed: 0, roadY: initial.y, jumpY: 0,
    };
    let cameraMode = "outside";
    let vehicleId = Vehicles.normalize(new URL(window.location.href).searchParams.get("vehicle"));
    setVehicle(vehicleId);
    rendering.setVehicle(vehicleId);
    function startOffset(index) {
      let samples = index - startIndex;
      if (closed) {
        samples = (samples + SAMPLE_COUNT) % SAMPLE_COUNT;
        if (samples > SAMPLE_COUNT / 2) samples -= SAMPLE_COUNT;
      }
      return samples * trackLength / SAMPLE_COUNT;
    }
    const progressSamples = (metres) => metres * SAMPLE_COUNT / trackLength;
    let lapTracker = TrackProgress.createMotion(
      routeLength, startOffset(initialIndex), initialIndex);
    const lapRecords = LapTimes.createStore(TrackLayout);
    const circuitKey = LapTimes.circuitKey(TrackLayout);
    let lapTimer = LapTimes.initial(timingSamples, progressSamples(lapTracker.progress));
    const flow = Flow.create();
    let raceState = null;
    let freeSession = null;
    let lapHold = null; // {ms, rank, remainingSeconds}; top chrono only, for 2s.
    let resultRefreshCooldown = 0;
    let fall = null, respawnIndex = initialIndex;
    let jumpVelocity = 0;
    let jumpCooldown = 0;

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
      rendering.syncOpponents(flow.mode === "race" ? raceState?.opponents : null);
    }

    function syncRaceHud() {
      const refreshed = hud.syncRace({
        gameMode: flow.mode, raceState, lapCount: lapTracker.laps, lapHold,
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
      return (closed ? TrackProgress.nearestSample : TrackProgress.nearestOpenSample)(
        positions, SAMPLE_COUNT, x, z, hintIndex, 12, OUTER_HALF_WIDTH);
    }

    function snapBack(index) {
      const center = positions[index];
      driver.x = center.x;
      driver.z = center.z;
      driver.yaw = Math.atan2(-directions[index].x, -directions[index].z);
      driver.speed = 0;
      driver.roadY = center.y;
      driver.jumpY = 0;
      jumpVelocity = 0;
      jumpCooldown = 0;
      driver.reverseHold = 0;
      flow.land();
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
      islands, LapTimes, startIndex, startCenter, startSide, finishIndex, closed,
    });
    function drawMap() {
      miniMap.draw(
        flow.falling && fall ? { x: fall.x, z: fall.z, yaw: driver.yaw } : driver,
        flow.mode === "race" && raceState ? raceState.opponents : null,
        opponentMeshes
      );
    }

    function renderSession() {
      // A saved/restarted run always resumes firmly on the road.
      if (!driver.jumpY) jumpVelocity = 0;
      jumpCooldown = 0;
      syncRaceCars();
      syncRaceHud();
      refreshCameraButton();
      refreshChrono();
      rendering.setView(cameraMode === "outside");
      setVehicle(vehicleId);
      rendering.setVehicle(vehicleId);
      updateCar(0);
      rendering.updateCamera(0);
      drawMap();
    }

    // A writable facade; the physics loop retains authority over simulation.
    const sessionState = {
      get driver() { return driver; }, set driver(v) { driver = v; },
      get cameraMode() { return cameraMode; }, set cameraMode(v) { cameraMode = v; },
      get vehicleId() { return vehicleId; }, set vehicleId(v) { vehicleId = Vehicles.normalize(v); },
      get lapTracker() { return lapTracker; }, set lapTracker(v) { lapTracker = v; },
      get lapTimer() { return lapTimer; }, set lapTimer(v) { lapTimer = v; },
      get raceState() { return raceState; }, set raceState(v) { raceState = v; },
      get freeSession() { return freeSession; }, set freeSession(v) { freeSession = v; },
      get fall() { return fall; }, set fall(v) { fall = v; },
      get respawnIndex() { return respawnIndex; }, set respawnIndex(v) { respawnIndex = v; },
    };
    let session = null;
    const navigation = Navigation.create({
      window, document, location: window.location, stage, homePanel,
      resumeButton, menuButton, scoresButton, menuScoresButton, scoresFrame,
      fullscreenButton, menuFullscreenButton, clearControls,
      flow,
      onResume: () => { lastFrame = performance.now(); },
      changed: () => session?.changed(), announce,
    });
    session = Session.create({
      window, state: sessionState, flow, revision: SAVE_REVISION,
      circuitKey, layoutVersion: TrackLayout.VERSION, positions, directions,
      startIndex, startCenter, startSide, startYaw, trackLength: routeLength,
      SAMPLE_COUNT: timingSamples, OUTER_HALF_WIDTH, Physics, TrackProgress, LapTimes, Race,
      raceLaps: closed ? Race.LAPS : 1,
      progressSamples, startOffset, closestRoad, snapBack, clearControls,
      clearLapHold, resetResultsCooldown: () => { resultRefreshCooldown = 0; },
      renderSession, setLapCount: (laps) => hud.setLapCount(laps), announce,
      resume: navigation.resume,
    });
    function chooseVehicle(id, updateUrl = false) {
      vehicleId = Vehicles.normalize(id);
      setVehicle(vehicleId);
      rendering.setVehicle(vehicleId);
      document.querySelectorAll("[data-gcv-vehicle]").forEach((button) => {
        const selected = button.dataset.gcvVehicle === vehicleId;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
      if (updateUrl) {
        // The URL keeps the selected crew when switching circuits/reloading.
        const url = new URL(window.location.href);
        if (vehicleId === Vehicles.DEFAULT_ID) url.searchParams.delete("vehicle");
        else url.searchParams.set("vehicle", vehicleId);
        window.history.replaceState(null, "", url.href);
        session?.changed();
      }
    }
    document.querySelectorAll("[data-gcv-vehicle]").forEach((button) => {
      button.addEventListener("click", () => {
        if (vehicleId !== button.dataset.gcvVehicle)
          chooseVehicle(button.dataset.gcvVehicle, true);
      });
    });
    document.querySelectorAll("[data-gcv-track]").forEach((button) => {
      const active = button.dataset.gcvTrack === TrackLayout.ID;
      button.classList.toggle("is-selected", active);
      button.setAttribute("aria-pressed", String(active));
      button.addEventListener("click", () => {
        if (active) return;
        // Old running sessions may be discarded, records are stored separately.
        window.GameState.create("gcv").clear();
        const url = new URL(window.location.href);
        if (button.dataset.gcvTrack === "classic") url.searchParams.delete("track");
        else url.searchParams.set("track", button.dataset.gcvTrack);
        // A new page URL forces an updated HTML document on older tablets.
        url.searchParams.set("rev", "20261111g");
        window.location.assign(url.href);
      });
    });
    const raceModeCaption = raceModeButton.querySelector("strong");
    raceModeCaption.textContent = closed ? "Course · 3 tours" : "Course · parcours unique";
    freeModeButton.addEventListener("click", session.chooseFree);
    raceModeButton.addEventListener("click", session.startRace);
    replayButton.addEventListener("click", session.startRace);
    raceFreeButton.addEventListener("click", session.chooseFree);
    restartButton.addEventListener("click", session.restartNearFinish);

    window.GmrPlayTime.mountGame({
      host: stage,
      isPlaying: () => !flow.paused && flow.activity !== "finished",
      onBlocked: () => navigation.openMenu(),
    });

    session.bind();
    chooseVehicle(vehicleId);
    syncRaceCars();
    syncRaceHud();
    navigation.sync(); // Always open on home, including after restoration.
    refreshCameraButton();

    function updateCar(dt, fallDt = dt) {
      if (navigation.paused && dt > 0) return;
      const brakePressed = controls.isBraking();
      let mudSkidIntensity = 0;
      let steeringAnimation = 0;
      let barrierSparkContact = null;
      let raceMotion = null;
      let recordedLapThisFrame = false;
      const mayDrive = flow.canDrive;
      if (flow.falling) {
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
        steeringAnimation = steer;
        // The dirt course now handles like the previous paved road, including
        // its safety shoulders. Only truly extreme steering emits particles.
        const previousPosition = { x: driver.x, z: driver.z };
        // Preserve the vertical state; Physics.advance only returns x/z/yaw
        // and speed. Otherwise the jump resets on every simulation frame.
        const { roadY = 0, jumpY = 0 } = driver;
        driver = { ...Physics.advance(driver, { steer, accelerate, brake }, dt),
          roadY, jumpY };
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
        const endCap = Barriers.resolveEndCaps(driver, nearest.index,
          positions, directions, sides, barriers);
        if (endCap.collided) {
          driver.x = endCap.x;
          driver.z = endCap.z;
          driver.speed = endCap.speed;
          nearest = closestRoad(driver.x, driver.z, lapTracker.index);
        }
        if (nearest.distanceSquared > OUTER_HALF_WIDTH * OUTER_HALF_WIDTH) {
          // Keep the speed and forward momentum in the air. Begin both the
          // gravity animation and the two-second countdown at this instant.
          flow.beginFall();
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
          const startCrossing = TrackProgress.finishCrossing(
            previousPosition, driver, startCenter, directions[startIndex],
            ROAD_HALF_WIDTH);
          const finishCrossing = closed ? startCrossing :
            TrackProgress.finishCrossing(previousPosition, driver,
              finishCenter, directions[finishIndex], ROAD_HALF_WIDTH);
          const progressBefore = lapTracker.progress;
          const motion = closed
            ? TrackProgress.move(lapTracker, routeLength, travel, finishCrossing,
              nearest.index, SAMPLE_COUNT)
            : TrackProgress.moveOpen(lapTracker, routeLength, travel,
              startCrossing, finishCrossing, nearest.index, SAMPLE_COUNT);
          lapTracker = motion.state;
          if (flow.mode === "race") raceMotion = motion;
          // Sector timing uses signed travel, not the artificial distance
          // alignment performed at a validated finish line.
          const timing = LapTimes.advance(lapTimer,
            progressSamples(progressBefore), progressSamples(motion.sectorProgress),
            fallDt * 1000, timingSamples, lapRecords.best());
          lapTimer = timing.state;
          for (const event of motion.events) {
            const finish = !closed && event.type === "lap"
              ? LapTimes.completeRoute(lapTimer, event.fraction, fallDt * 1000)
              : LapTimes.crossFinish(lapTimer, event.fraction,
                fallDt * 1000, timingSamples, progressSamples(event.progress));
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
          // The three crests launch a short, sharp ballistic hop. Its
          // touchdown is a single event for the dust FX, not a new race lap.
          const previousRoadY = driver.roadY || 0;
          driver.roadY = positions[nearest.index].y;
          jumpCooldown = Math.max(0, jumpCooldown - dt);
          if (!closed && driver.speed > 24 && jumpCooldown === 0 &&
              jumpVelocity === 0 && driver.jumpY === 0 &&
              previousRoadY > 1.7 && driver.roadY < previousRoadY - 0.09) {
            jumpVelocity = Physics.JUMP_TAKEOFF_SPEED;
            driver.jumpY = 0.01;
            jumpCooldown = 0.85; // No repeated takeoff on the same hump.
          }
          if (driver.jumpY > 0 || jumpVelocity > 0) {
            const jump = Physics.advanceJump(driver.jumpY, jumpVelocity, dt);
            driver.jumpY = jump.height;
            jumpVelocity = jump.velocity;
            if (jump.landed) visualEffects.land(driver);
          }
          // Distinct automatic slalom: seven short, fast left/right
          // oscillations rather than four wide sweeps.
          if (TrackLayout.RAINBOW && driver.speed > 8 &&
              nearest.index / SAMPLE_COUNT >= TrackLayout.RAINBOW[0] &&
              nearest.index / SAMPLE_COUNT <= TrackLayout.RAINBOW[1]) {
            const section = TrackLayout.RAINBOW;
            const fraction = (nearest.index / SAMPLE_COUNT - section[0]) /
              (section[1] - section[0]);
            const zigzag = TrackLayout.zigzagAt(fraction);
            const tangent = directions[nearest.index];
            const side = sides[nearest.index], center = positions[nearest.index];
            const slope = zigzag.slope / (trackLength * (section[1] - section[0]));
            const guidedYaw = Math.atan2(
              -(tangent.x + side.x * slope), -(tangent.z + side.z * slope));
            const error = Math.atan2(Math.sin(guidedYaw - driver.yaw),
              Math.cos(guidedYaw - driver.yaw));
            driver.yaw += error * (1 - Math.exp(-10 * dt));
            const lateral = (driver.x - center.x) * side.x +
              (driver.z - center.z) * side.z;
            const correction = (zigzag.offset - lateral) * (1 - Math.exp(-11 * dt));
            driver.x += side.x * correction;
            driver.z += side.z * correction;
          }
        }
      }

      if (flow.mode === "race" && raceState) {
        const wasRacing = raceState.phase === "racing";
        const previousLapCount = raceState.playerLapTimes?.length || 0;
        raceState = Race.advance(raceState, dt, raceMotion || 0);
        flow.advanceRace(raceState.phase);
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
        driver, fall: flow.falling ? fall : null, dt, brakePressed,
        jumpVelocity, steerInput: steeringAnimation,
      });
      visualEffects.update(dt, driver, flow.falling ? 0 : mudSkidIntensity,
        flow.falling ? null : barrierSparkContact);
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
