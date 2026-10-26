"use strict";
// Timed GCV laps. Local, circuit-specific top-three records and split deltas.
const GcvLapTimes = (() => {
  const STORAGE_KEY = "gmr:v1:gcv:lap-records";
  const SPLIT_FRACTIONS = Object.freeze([0.25, 0.50, 0.75]);

  function circuitKey(layout) {
    return JSON.stringify({
      version: layout.VERSION,
      waypoints: layout.WAYPOINTS,
      finish: layout.FINISH,
      spawn: layout.SPAWN,
      samples: layout.SAMPLE_COUNT,
      roadHalfWidth: layout.ROAD_HALF_WIDTH,
      shoulderWidth: layout.SHOULDER_WIDTH,
    });
  }

  function format(ms) {
    if (!Number.isFinite(ms) || ms < 0) return "—";
    const hundredths = Math.floor(ms / 10);
    const centiseconds = hundredths % 100;
    const seconds = Math.floor(hundredths / 100) % 60;
    const minutes = Math.floor(hundredths / 6000);
    return String(minutes).padStart(2, "0") + ":" +
      String(seconds).padStart(2, "0") + "." +
      String(centiseconds).padStart(2, "0");
  }

  function formatDelta(ms) {
    if (!Number.isFinite(ms)) return "—";
    return (ms > 0 ? "+" : ms < 0 ? "−" : "±") +
      (Math.abs(ms) / 1000).toFixed(2) + " s";
  }

  function validRecord(record) {
    return record && Number.isFinite(record.ms) && record.ms > 0 &&
      Array.isArray(record.splits) && record.splits.length === 3 &&
      record.splits.every((value, index) => Number.isFinite(value) &&
        value > 0 && value < record.ms &&
        (index === 0 || value > record.splits[index - 1]));
  }

  function createStore(layout, storage = typeof localStorage === "undefined" ? null : localStorage) {
    const key = circuitKey(layout);
    let records = [];
    if (storage) {
      try {
        const data = JSON.parse(storage.getItem(STORAGE_KEY));
        if (data && data.circuit === key && Array.isArray(data.records)) {
          records = data.records.filter(validRecord).slice().sort((a, b) => a.ms - b.ms).slice(0, 3);
        } else {
          // Every track change invalidates all previous lap records.
          storage.setItem(STORAGE_KEY, JSON.stringify({ circuit: key, records: [] }));
        }
      } catch {
        records = [];
      }
    }
    function top() { return records.map((record) => ({ ...record, splits: record.splits.slice() })); }
    function best() { return records[0] || null; }
    function record(ms, splits) {
      const candidate = {
        ms: Math.round(ms), splits: splits.map(Math.round),
        date: new Date().toISOString(),
      };
      if (!validRecord(candidate)) return false;
      records = [...records, candidate].sort((a, b) => a.ms - b.ms).slice(0, 3);
      if (storage) {
        try {
          storage.setItem(STORAGE_KEY, JSON.stringify({ circuit: key, records }));
        } catch { /* Record remains available until reload. */ }
      }
      return true;
    }
    return Object.freeze({ top, best, record });
  }

  function initial(sampleCount, progress) {
    return {
      running: false,
      startAt: (Math.floor(progress / sampleCount) + 1) * sampleCount,
      elapsedMs: 0,
      splits: [],
      delta: null,
      splitNumber: 0,
    };
  }

  function restore(saved, sampleCount, progress) {
    if (!saved || typeof saved !== "object" || !Number.isFinite(saved.startAt) ||
        !Number.isFinite(saved.elapsedMs) || saved.elapsedMs < 0 ||
        !Array.isArray(saved.splits)) return initial(sampleCount, progress);
    if (saved.running !== true) return initial(sampleCount, progress);
    if (saved.startAt > progress || saved.startAt + sampleCount < progress ||
        saved.splits.length > 3 || saved.splits.some((x) => !Number.isFinite(x) || x < 0))
      return initial(sampleCount, progress);
    return {
      running: true, startAt: saved.startAt, elapsedMs: saved.elapsedMs,
      splits: saved.splits.slice(), splitNumber: saved.splits.length,
      delta: Number.isFinite(saved.delta) ? saved.delta : null,
    };
  }

  // Progress is unwrapped around the track and comes from GcvTrackProgress.
  // A crossing interpolates the exact fraction of frame time.
  function advance(state, previousProgress, nextProgress, dtMs, sampleCount, best = null) {
    const stepMs = Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0;
    let result = { ...state, splits: state.splits.slice() };
    const events = [];
    if (nextProgress < previousProgress) {
      if (result.running) result.elapsedMs += stepMs;
      return { state: result, events };
    }
    const crossed = (target) => previousProgress < target && nextProgress >= target;
    const offset = (target) =>
      nextProgress === previousProgress ? 0 :
      Math.min(1, Math.max(0, (target - previousProgress) /
        (nextProgress - previousProgress)));

    if (!result.running) {
      if (crossed(result.startAt)) {
        result.running = true;
        result.elapsedMs = stepMs * (1 - offset(result.startAt));
        result.splits = [];
        result.delta = null;
        result.splitNumber = 0;
        events.push({ type: "start" });
      }
      return { state: result, events };
    }

    const beforeMs = result.elapsedMs;
    result.elapsedMs += stepMs;
    for (let i = result.splits.length; i < 3; i++) {
      const splitAt = result.startAt + Math.round(sampleCount * SPLIT_FRACTIONS[i]);
      if (!crossed(splitAt)) break;
      const splitMs = Math.max(0, beforeMs + stepMs * offset(splitAt));
      result.splits.push(splitMs);
      result.splitNumber = i + 1;
      result.delta = best && Number.isFinite(best.splits?.[i])
        ? splitMs - best.splits[i] : null;
      events.push({ type: "split", index: i, ms: splitMs, delta: result.delta });
    }

    const finishAt = result.startAt + sampleCount;
    if (crossed(finishAt)) {
      const lapMs = Math.max(0, beforeMs + stepMs * offset(finishAt));
      if (result.splits.length === 3 && lapMs > result.splits[2]) {
        events.push({ type: "lap", ms: lapMs, splits: result.splits.slice() });
      }
      // The next lap starts at the line, including remainder of this frame.
      result.startAt = finishAt;
      result.elapsedMs = stepMs * (1 - offset(finishAt));
      result.splits = [];
      result.delta = null;
      result.splitNumber = 0;
      result.running = true;
    }
    return { state: result, events };
  }

  return Object.freeze({ STORAGE_KEY, SPLIT_FRACTIONS, circuitKey,
    createStore, format, formatDelta, initial, restore, advance });
})();
if (typeof window !== "undefined") window.GcvLapTimes = GcvLapTimes;
if (typeof module !== "undefined" && module.exports) module.exports = GcvLapTimes;
