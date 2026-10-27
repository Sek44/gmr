"use strict";
// Follow course order (not distance to the start line) to count complete laps.
const GcvTrackProgress = (() => {
  function create(sampleCount, startIndex, currentIndex, saved = null) {
    const normalized = ((currentIndex % sampleCount) + sampleCount) % sampleCount;
    const initial = (normalized - startIndex + sampleCount) % sampleCount;
    return {
      index: normalized,
      progress: Number.isFinite(saved?.progress) ? saved.progress : initial,
      laps: Number.isSafeInteger(saved?.laps) && saved.laps >= 0 ? saved.laps : 0,
    };
  }

  function advance(state, nextIndex, sampleCount) {
    let delta = nextIndex - state.index;
    if (delta > sampleCount / 2) delta -= sampleCount;
    if (delta < -sampleCount / 2) delta += sampleCount;
    // Ignore implausible track-index jumps from another section of the circuit.
    // Keep the last reliable index: adopting a distant branch without its
    // distance would corrupt every subsequent delta (and thus the standings).
    if (Math.abs(delta) > 12) return state;
    const progress = state.progress + delta;
    const laps = Math.max(state.laps, Math.floor(progress / sampleCount), 0);
    return { index: nextIndex, progress, laps };
  }

  // Re-align the logical lap position to an actual physical line crossing.
  // This repairs missed sample-index crossings without inventing distance.
  function syncFinish(state, finishProgress, nearestIndex, sampleCount) {
    if (!Number.isFinite(finishProgress) ||
        !Number.isSafeInteger(nearestIndex) ||
        !Number.isSafeInteger(sampleCount) || sampleCount < 2) return state;
    return {
      index: ((nearestIndex % sampleCount) + sampleCount) % sampleCount,
      progress: finishProgress,
      laps: Math.max(state.laps, Math.floor(finishProgress / sampleCount)),
    };
  }

  // A forward crossing near the start line is only a full lap after the
  // car has actually progressed around nearly the entire route. Without
  // this guard, a forward crossing after a tiny U-turn can snap progress
  // ahead by one complete circuit.
  function nearNextFinish(state, lapStartProgress, sampleCount) {
    return Number.isFinite(state?.progress) &&
      Number.isFinite(lapStartProgress) &&
      Number.isSafeInteger(sampleCount) && sampleCount > 0 &&
      state.progress >= lapStartProgress + 0.9 * sampleCount;
  }

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
      const atLine = state.progress + distance * crossingFraction;
      if (!started) {
        started = true;
        progress = Math.max(0, progress);
        lastFinishProgress = Math.max(0, atLine);
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


  return Object.freeze({ create, advance, nearestSample, alongTrackTravel,
    relocate, syncFinish, nearNextFinish, createMotion, restoreMotion, move,
    finishCrossing, MIN_LAP_FRACTION });
})();

if (typeof window !== "undefined") window.GcvTrackProgress = GcvTrackProgress;
if (typeof module !== "undefined" && module.exports) module.exports = GcvTrackProgress;
