"use strict";

// Visual dashboard for free driving and races. The simulation owns all state.
const GcvHud = (() => {
  function create({ document, LapTimes, Race }) {
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
    const freeModeButton = document.getElementById("free-mode-button");
    const raceModeButton = document.getElementById("race-mode-button");
    const restartButton = document.getElementById("restart-button");
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

    function refreshBests(records) {
      bestLabels.forEach((label, index) => {
        label.textContent = records[index] ? LapTimes.format(records[index].ms) : "—";
      });
    }
    function refreshChrono(lapTimer, lapHold) {
      chronoBox.classList.toggle("is-lap-hold", Boolean(lapHold));
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
    function refreshClassification(raceState) {
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
    function syncRace({ gameMode, raceState, lapCount, lapHold, refreshResults }) {
      let didRefreshResults = false;
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
        return false;
      }
      racePositionValue.textContent = String(Race.position(raceState)) + "ᵉ";
      raceLapLabel.textContent = raceState.phase === "finished"
        ? Race.LAPS + " tours terminés" : "Tour " + Race.currentLap(raceState) + "/" + Race.LAPS;
      // Display validated physical lap crossings, not rounded estimated
      // distance (which can lag the finish when the samples jitter).
      lapLabel.textContent = String(lapCount);
      const phase = raceState.phase;
      raceOverlay.classList.toggle("is-results", phase === "finished");
      raceOverlay.hidden = phase === "racing" ||
        (phase === "finished" && lapHold !== null);
      raceOverlayActions.hidden = phase !== "finished";
      raceResults.hidden = phase !== "finished";
      if (phase === "finished" && refreshResults) {
        refreshClassification(raceState);
        didRefreshResults = true;
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
      return didRefreshResults;
    }
    function setLapCount(laps) {
      lapLabel.textContent = String(laps);
    }
    function setSpeed(metresPerSecond) {
      speedLabel.textContent = String(Math.round(Math.abs(metresPerSecond) * 3.6));
      gearLabel.textContent = metresPerSecond < -0.02 ? "R" : "";
    }
    return { refreshBests, refreshChrono, syncRace, setLapCount, setSpeed };
  }

  return { create };
})();

if (typeof window !== "undefined") window.GcvHud = GcvHud;
if (typeof module !== "undefined" && module.exports) module.exports = GcvHud;
