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

  function relocate(state, nearestIndex) {
    // Respawn is not extra travel around the circuit.
    return { ...state, index: nearestIndex };
  }

  return Object.freeze({ create, advance, nearestSample, relocate, syncFinish, nearNextFinish });
})();

if (typeof window !== "undefined") window.GcvTrackProgress = GcvTrackProgress;
if (typeof module !== "undefined" && module.exports) module.exports = GcvTrackProgress;
