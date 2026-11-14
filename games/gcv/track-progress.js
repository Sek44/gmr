"use strict";
// Single authoritative progression by signed physical travel and validated line crossings.
const GcvTrackProgress = (() => {
  // On adjacent hairpin arms the globally closest road sample can belong
  // to a completely different part of the lap. While the vehicle is still
  // within its current track corridor, prefer samples near its last index.
  // The global search remains the fallback for respawns/off-track positions.
  function nearestSample(positions, sampleCount, x, z,
      hintIndex = null, halfSpan = 12, corridorHalfWidth = Infinity) {
    if (!Number.isSafeInteger(sampleCount) || sampleCount < 2 ||
        !positions || positions.length < sampleCount ||
        !Number.isFinite(x) || !Number.isFinite(z)) {
      return { index: 0, distanceSquared: Infinity };
    }
    const distanceAt = (index) => {
      const dx = x - positions[index].x;
      const dz = z - positions[index].z;
      return dx * dx + dz * dz;
    };
    if (Number.isSafeInteger(hintIndex) &&
        hintIndex >= 0 && hintIndex < sampleCount) {
      let localIndex = hintIndex;
      let localDistance = distanceAt(localIndex);
      for (let offset = -halfSpan; offset <= halfSpan; offset++) {
        const index = ((hintIndex + offset) % sampleCount + sampleCount) % sampleCount;
        const squared = distanceAt(index);
        if (squared < localDistance) {
          localIndex = index;
          localDistance = squared;
        }
      }
      if (localDistance <= corridorHalfWidth * corridorHalfWidth)
        return { index: localIndex, distanceSquared: localDistance };
    }
    let index = 0, distanceSquared = Infinity;
    for (let i = 0; i < sampleCount; i++) {
      const squared = distanceAt(i);
      if (squared < distanceSquared) {
        index = i;
        distanceSquared = squared;
      }
    }
    return { index, distanceSquared };
  }

  // Project the actual displacement on the forward tangent of the circuit.
  // This is a signed distance: reversing cancels the distance previously
  // traveled, and moving sideways or changing the closest sample does not
  // award free race progress.
  function alongTrackTravel(before, after, forward) {
    if (![before?.x, before?.z, after?.x, after?.z,
      forward?.x, forward?.z].every(Number.isFinite)) return 0;
    const length = Math.hypot(forward.x, forward.z);
    if (length < 1e-8) return 0;
    return ((after.x - before.x) * forward.x +
      (after.z - before.z) * forward.z) / length;
  }

  // Open tracks have no modulo seam: never confuse the end of the route with
  // its beginning while resolving hairpins or falling off the road.
  function nearestOpenSample(positions, sampleCount, x, z,
      hintIndex = null, halfSpan = 12, corridorHalfWidth = Infinity) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || sampleCount < 2)
      return { index: 0, distanceSquared: Infinity };
    function distance(i) {
      return (x - positions[i].x) ** 2 + (z - positions[i].z) ** 2;
    }
    if (Number.isInteger(hintIndex) && hintIndex >= 0 && hintIndex <= sampleCount) {
      let index = hintIndex, d = distance(index);
      for (let i = Math.max(0, hintIndex - halfSpan);
        i <= Math.min(sampleCount, hintIndex + halfSpan); i++) {
        if (distance(i) < d) { index = i; d = distance(i); }
      }
      if (d <= corridorHalfWidth ** 2) return { index, distanceSquared: d };
    }
    let index = 0, d = Infinity;
    for (let i = 0; i <= sampleCount; i++) {
      const value = distance(i);
      if (value < d) { index = i; d = value; }
    }
    return { index, distanceSquared: d };
  }


  // During a long jump, follow the road's *longitudinal* geometry rather than
  // flying off a bend. Steering changes only the bounded lateral offset.
  // Use actual travelled metres, not a sample-index jump, for race progress.
  function guideAirborne(positions, sampleCount, before, candidate,
      hintIndex, roadHalfWidth, steer = 0, dt = 0) {
    if (!positions || sampleCount < 2 || !Number.isInteger(hintIndex) ||
        ![before?.x, before?.z, candidate?.x, candidate?.z, roadHalfWidth]
          .every(Number.isFinite) || roadHalfWidth <= 2) return null;
    const limit = Math.min(sampleCount, positions.length - 1);
    // Locate the closest point on a *segment*, avoiding the stair-step and
    // sign changes produced by snapping to discrete sample centres.
    let best = null;
    for (let i = Math.max(0, hintIndex - 6);
      i < Math.min(limit, hintIndex + 7); i++) {
      const a = positions[i], b = positions[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const squared = dx * dx + dz * dz;
      if (squared < 1e-8) continue;
      const t = Math.max(0, Math.min(1,
        ((before.x - a.x) * dx + (before.z - a.z) * dz) / squared));
      const cx = a.x + t * dx, cz = a.z + t * dz;
      const error = (before.x - cx) ** 2 + (before.z - cz) ** 2;
      if (!best || error < best.error) best = { index: i, t, error };
    }
    if (!best) return null;
    let index = best.index, t = best.t;
    let a = positions[index], b = positions[index + 1];
    let dx = b.x - a.x, dz = b.z - a.z;
    let length = Math.hypot(dx, dz);
    const initialSideX = -dz / length, initialSideZ = dx / length;
    const previousLateral = (before.x - (a.x + t * dx)) * initialSideX +
      (before.z - (a.z + t * dz)) * initialSideZ;
    let remaining = Math.hypot(candidate.x - before.x, candidate.z - before.z);
    let travel = 0;
    // Arc-length walking is stable in sharp bends and through the final gate.
    // Do not award fictitious distance after reaching the end cap.
    while (remaining > 1e-8 && index < limit) {
      const available = (1 - t) * length;
      const advance = Math.min(available, remaining);
      remaining -= advance;
      travel += advance;
      t += advance / length;
      if (t >= 1 - 1e-8 && index + 1 < limit) {
        index++;
        t = 0;
        a = positions[index]; b = positions[index + 1];
        dx = b.x - a.x; dz = b.z - a.z;
        length = Math.hypot(dx, dz);
      } else if (t >= 1 - 1e-8) break;
    }
    const maxSide = roadHalfWidth - 1.8; // Whole vehicle stays inside the road.
    const sidewaysSpeed = Math.min(3.2, Math.max(0, Number(candidate.speed) || 0) * 0.075);
    const lateral = Math.max(-maxSide, Math.min(maxSide,
      previousLateral + Math.max(-1, Math.min(1, Number(steer) || 0)) *
      sidewaysSpeed * Math.max(0, dt)));
    const sideX = -dz / length, sideZ = dx / length;
    const targetYaw = Math.atan2(-dx, -dz);
    const yawError = Math.atan2(Math.sin(targetYaw - candidate.yaw),
      Math.cos(targetYaw - candidate.yaw));
    const blend = 1 - Math.exp(-7 * Math.max(0, dt));
    return {
      x: a.x + t * dx + sideX * lateral,
      z: a.z + t * dz + sideZ * lateral,
      yaw: candidate.yaw + yawError * blend,
      index, travel,
    };
  }

  function relocate(state, nearestIndex) {
    // Respawn is not extra travel around the circuit.
    return { ...state, index: nearestIndex };
  }

  // Authoritative player motion for free practice AND race. Progress is in metres,
  // measured by signed physical travel; the nearest road index is only a hint.
  // No sample-index wrap or HUD estimate can validate a lap.
  const MIN_LAP_FRACTION = 0.75;

  function createMotion(trackLength, initialProgress, index = null, saved = null) {
    if (!Number.isFinite(trackLength) || trackLength <= 0 ||
        !Number.isFinite(initialProgress)) throw new Error("Invalid lap motion");
    const restored = restoreMotion(saved, trackLength);
    return restored || {
      index, progress: initialProgress, laps: 0, started: false,
      lastFinishProgress: null,
    };
  }

  function restoreMotion(saved, trackLength) {
    if (!saved || !Number.isFinite(trackLength) || trackLength <= 0 ||
        !Number.isFinite(saved.progress) ||
        !Number.isSafeInteger(saved.laps) || saved.laps < 0 ||
        typeof saved.started !== "boolean" ||
        !(saved.lastFinishProgress === null ||
          Number.isFinite(saved.lastFinishProgress)) ||
        !(saved.index === null ||
          Number.isSafeInteger(saved.index) && saved.index >= 0) ||
        (saved.started && saved.lastFinishProgress === null) ||
        (!saved.started && (saved.laps !== 0 ||
          saved.lastFinishProgress !== null))) return null;
    return {
      index: saved.index, progress: saved.progress, laps: saved.laps,
      started: saved.started, lastFinishProgress: saved.lastFinishProgress,
    };
  }

  // A single gate validates start and completed laps. Both the race results
  // and lap timer consume these events; neither infers a lap from distance.
  function move(state, trackLength, signedDistance = 0, crossingFraction = null,
      nextIndex = null, sampleCount = null) {
    let distance = Number.isFinite(signedDistance) ? signedDistance : 0;
    let index = state.index;
    if (Number.isSafeInteger(nextIndex) && nextIndex >= 0) {
      if (Number.isSafeInteger(index) && Number.isSafeInteger(sampleCount) &&
          sampleCount > 1) {
        let jump = nextIndex - index;
        if (jump > sampleCount / 2) jump -= sampleCount;
        if (jump < -sampleCount / 2) jump += sampleCount;
        // A switch to another hairpin arm is not forward travel.
        if (Math.abs(jump) > 12) distance = 0;
        else index = nextIndex;
      } else {
        index = nextIndex;
      }
    }
    const rawProgress = state.progress + distance;
    const events = [];
    let progress = rawProgress, laps = state.laps;
    let started = state.started, lastFinishProgress = state.lastFinishProgress;
    const validCrossing = Number.isFinite(crossingFraction) &&
      crossingFraction >= 0 && crossingFraction <= 1;
    if (validCrossing) {
      if (!started) {
        started = true;
        // Discard the untimed approach to the FIRST crossing (which may
        // include almost an entire circuit in free mode). Retain only
        // forward travel after the line, without fabricating distance.
        progress = Math.max(0, Math.min(rawProgress,
          distance * (1 - crossingFraction)));
        lastFinishProgress = progress;
        events.push({ type: "start", fraction: crossingFraction, progress: 0 });
      } else if (rawProgress - lastFinishProgress >=
          trackLength * MIN_LAP_FRACTION) {
        laps++;
        progress = Math.max(progress, laps * trackLength);
        lastFinishProgress = progress;
        events.push({ type: "lap", lap: laps, fraction: crossingFraction,
          progress: laps * trackLength });
      }
    }
    // The next distance milestone cannot be reached without a line event.
    // Reverse movement stays signed; repeatedly crossing in a U-turn yields
    // no new lap because the physical travel threshold is not met.
    if (started) progress = Math.max(laps * trackLength,
      Math.min(progress, (laps + 1) * trackLength - 0.001));
    return {
      state: { index, progress, laps, started, lastFinishProgress },
      events, sectorProgress: rawProgress,
    };
  }

  // The open route has distinct start and finish gates. Its single completion
  // still uses the same signed travel + real geometric crossing authority.
  function moveOpen(state, routeLength, signedDistance = 0,
      startFraction = null, finishFraction = null, nextIndex = null,
      sampleCount = null) {
    let index = state.index;
    let distance = Number.isFinite(signedDistance) ? signedDistance : 0;
    if (Number.isInteger(nextIndex) && nextIndex >= 0) {
      if (Number.isInteger(index) && Math.abs(nextIndex - index) > 12)
        distance = 0;
      else index = nextIndex;
    }
    let progress = state.progress + distance;
    let started = state.started, laps = state.laps;
    const events = [];
    const crossing = (fraction) => Number.isFinite(fraction) &&
      fraction >= 0 && fraction <= 1;
    if (!started && crossing(startFraction) && distance > 0) {
      started = true;
      progress = Math.max(0, distance * (1 - startFraction));
      events.push({ type: "start", fraction: startFraction, progress: 0 });
    }
    if (started && !laps && crossing(finishFraction) &&
        distance > 0 && progress >= routeLength * MIN_LAP_FRACTION) {
      laps = 1;
      events.push({ type: "lap", lap: 1, fraction: finishFraction,
        progress: routeLength });
    }
    if (started) progress = Math.max(0, Math.min(progress,
      laps ? routeLength : routeLength - 0.001));
    return { state: { index, progress, laps, started,
      lastFinishProgress: started ? 0 : null }, events,
      sectorProgress: progress };
  }

  // Detect a true forward crossing of the VISIBLE line in world coordinates.
  // Sample indices alone may jump or skip the line at high speed, which used to
  // leave the stopwatch inactive despite the car passing the finish tiles.
  // Return the crossing fraction of the frame, or null.
  function finishCrossing(before, after, line, forward, halfWidth) {
    if (![before?.x, before?.z, after?.x, after?.z,
      line?.x, line?.z, forward?.x, forward?.z, halfWidth]
      .every(Number.isFinite) || halfWidth <= 0) return null;
    const length = Math.hypot(forward.x, forward.z);
    if (length < 1e-8) return null;
    const dx = forward.x / length, dz = forward.z / length;
    const previousDistance = (before.x - line.x) * dx + (before.z - line.z) * dz;
    const nextDistance = (after.x - line.x) * dx + (after.z - line.z) * dz;
    if (!(previousDistance <= 0 && nextDistance > 0)) return null;
    const fraction = -previousDistance / (nextDistance - previousDistance);
    const x = before.x + (after.x - before.x) * fraction - line.x;
    const z = before.z + (after.z - before.z) * fraction - line.z;
    const sideways = -dz * x + dx * z;
    return Math.abs(sideways) <= halfWidth ? fraction : null;
  }

  return Object.freeze({ nearestSample, nearestOpenSample, alongTrackTravel, guideAirborne, relocate,
    createMotion, restoreMotion, move, moveOpen, finishCrossing, MIN_LAP_FRACTION });
})();

if (typeof window !== "undefined") window.GcvTrackProgress = GcvTrackProgress;
if (typeof module !== "undefined" && module.exports) module.exports = GcvTrackProgress;
