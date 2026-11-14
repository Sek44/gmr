"use strict";

// Adaptive 3D resolution for the active game only. No gameplay clock, save
// data, HUD or benchmark state is affected. Decisions use actual RAF frame
// intervals (not JS/GPU execution time) and change the framebuffer infrequently.
const GcvAdaptiveResolution = (() => {
  const LEVELS = Object.freeze([1, 0.9, 0.8, 0.7, 0.6, 0.55]);
  const WINDOW_MS = 1500;
  const SETTLE_MS = 1200;
  const LOW_FPS = 56;
  const FAST_DROP_FPS = 46;
  const RECOVERY_FPS = 58.5;
  const RECOVERY_MS = 18000;
  const FAILED_UPGRADE_HOLD_MS = 45000;
  const MAX_FRAME_MS = 250;
  const SLOW_FRAME_MS = 25;

  function create({ setScale }) {
    if (typeof setScale !== "function") {
      throw new TypeError("Adaptive resolution requires setScale");
    }
    let level = 0;
    let lastTimestamp = null;
    let windowDuration = 0;
    let frames = 0;
    let slowFrames = 0;
    let consecutiveSlow = 0;
    let stableDuration = 0;
    let settlingRemaining = SETTLE_MS;
    let retryRemaining = 0;
    let upgradeFrom = null;
    let lastFps = null;

    function resetWindow() {
      windowDuration = 0;
      frames = 0;
      slowFrames = 0;
    }

    function reset() {
      lastTimestamp = null;
      resetWindow();
      consecutiveSlow = 0;
      stableDuration = 0;
      settlingRemaining = SETTLE_MS;
      // A menu or resize should not keep a speculative quality upgrade active.
      // Let the normal active-frame evaluation decide whether it is suitable.
      upgradeFrom = null;
    }

    function changeLevel(index) {
      if (index === level) return;
      setScale(LEVELS[index]);
      level = index;
      settlingRemaining = SETTLE_MS;
      resetWindow();
      consecutiveSlow = 0;
      stableDuration = 0;
    }

    function observe(timestamp, active = true) {
      if (!active || !Number.isFinite(timestamp)) {
        reset();
        return;
      }
      if (lastTimestamp === null) {
        lastTimestamp = timestamp;
        return;
      }
      const elapsed = timestamp - lastTimestamp;
      lastTimestamp = timestamp;
      // Background resume, debugger pause and invalid timestamps must not
      // cause a false downgrade or generate huge sample windows.
      if (!(elapsed > 0) || elapsed > MAX_FRAME_MS) {
        reset();
        lastTimestamp = timestamp;
        return;
      }
      retryRemaining = Math.max(0, retryRemaining - elapsed);
      if (settlingRemaining > 0) {
        settlingRemaining = Math.max(0, settlingRemaining - elapsed);
        return;
      }
      windowDuration += elapsed;
      frames++;
      if (elapsed > SLOW_FRAME_MS) slowFrames++;
      if (windowDuration < WINDOW_MS) return;

      const fps = frames * 1000 / windowDuration;
      const slowFraction = slowFrames / frames;
      const measuredMs = windowDuration;
      lastFps = fps;
      resetWindow();

      if (fps < LOW_FPS) {
        consecutiveSlow++;
        stableDuration = 0;
        if (fps < FAST_DROP_FPS || consecutiveSlow >= 2) {
          if (upgradeFrom !== null) {
            // The last increase failed; restore the proven lower scale and
            // avoid oscillating back up on the next good 60 FPS samples.
            const fallback = upgradeFrom;
            upgradeFrom = null;
            retryRemaining = FAILED_UPGRADE_HOLD_MS;
            changeLevel(fallback);
          } else if (level < LEVELS.length - 1) {
            changeLevel(level + 1);
          }
        }
        return;
      }
      consecutiveSlow = 0;
      if (fps < RECOVERY_FPS || slowFraction > 0.08) {
        stableDuration = 0;
        return;
      }
      if (upgradeFrom !== null) {
        // The trial upgrade is stable over two complete measurement windows.
        stableDuration += measuredMs;
        if (stableDuration >= WINDOW_MS * 2) {
          upgradeFrom = null;
          stableDuration = 0;
        }
        return;
      }
      if (level > 0 && retryRemaining === 0) {
        stableDuration += measuredMs;
        if (stableDuration >= RECOVERY_MS) {
          upgradeFrom = level;
          changeLevel(level - 1);
        }
      }
    }

    return Object.freeze({
      observe, reset,
      get scale() { return LEVELS[level]; },
      get lastFps() { return lastFps; },
      get evaluatingUpgrade() { return upgradeFrom !== null; },
    });
  }

  return Object.freeze({ create, LEVELS });
})();

if (typeof window !== "undefined") window.GcvAdaptiveResolution = GcvAdaptiveResolution;
if (typeof module !== "undefined" && module.exports)
  module.exports = GcvAdaptiveResolution;
