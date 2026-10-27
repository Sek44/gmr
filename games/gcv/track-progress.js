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
    if (Math.abs(delta) > 12) return { ...state, index: nextIndex };
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

  function relocate(state, nearestIndex) {
    // Respawn is not extra travel around the circuit.
    return { ...state, index: nearestIndex };
  }

  return Object.freeze({ create, advance, relocate, syncFinish, nearNextFinish });
})();

if (typeof window !== "undefined") window.GcvTrackProgress = GcvTrackProgress;
if (typeof module !== "undefined" && module.exports) module.exports = GcvTrackProgress;
