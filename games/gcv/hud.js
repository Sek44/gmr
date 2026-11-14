"use strict";

// Visual dashboard for free driving and races. The simulation owns all state.
const GcvHud = (() => {
  function create({ document, LapTimes, Race, layout = { CLOSED: true } }) {
    const closed = layout.CLOSED !== false;
    // DOM reads are cheap compared with invalidating layout/paint every RAF.
    // Only mutate text, attributes and CSS state when the displayed value
    // actually changes; timing and race state stay owned by the simulation.
    function setText(node, value) {
      const text = String(value);
      if (node.textContent !== text) node.textContent = text;
    }
    function setHidden(node, hidden) {
      if (node.hidden !== hidden) node.hidden = hidden;
    }
    function setClass(node, name, enabled) {
      if (node.classList.contains(name) !== enabled)
        node.classList.toggle(name, enabled);
    }
    function setAttribute(node, name, value) {
      if (node.getAttribute(name) !== value) node.setAttribute(name, value);
    }
    function setTitle(node, value) {
      if (node.title !== value) node.title = value;
    }
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
    const bestsTitle = document.querySelector?.(".gcv-bests-title");
    if (!closed && bestsTitle) setText(bestsTitle, "Meilleurs parcours");
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
        setText(label, records[index] ? LapTimes.format(records[index].ms) : "—");
      });
    }
    function refreshChrono(lapTimer, lapHold) {
      setClass(chronoBox, "is-lap-hold", Boolean(lapHold));
      setText(chronoLabel, lapHold
        ? LapTimes.format(lapHold.ms)
        : lapTimer.running || lapTimer.finished ? LapTimes.format(lapTimer.elapsedMs) : "—");
      setText(chronoTitle, lapHold
        ? (closed ? "TOUR TERMINÉ" : "PARCOURS TERMINÉ")
        : (closed ? "TOUR EN COURS" : "PARCOURS EN COURS"));
      setText(chronoRank, lapHold?.rank
        ? ["", "1er meilleur temps", "2e meilleur temps", "3e meilleur temps"][lapHold.rank]
        : "");
      setHidden(chronoRank, !lapHold?.rank);
      const delta = lapTimer.delta;
      setText(deltaValue, LapTimes.formatDelta(delta));
      setText(splitLabel, "S" + (lapTimer.splitNumber || 1));
      setClass(deltaLabel, "is-faster", delta !== null && delta < -10);
      setClass(deltaLabel, "is-slower", delta !== null && delta > 10);
      setClass(deltaLabel, "is-even", delta !== null && Math.abs(delta) <= 10);
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
      setText(raceResultsStatus, count === Race.GRID_COUNT
        ? "Les 10 voitures ont terminé." : count + " / 10 voitures à l’arrivée · les autres poursuivent la course.");
    }
    function syncRace({ gameMode, raceState, lapCount, lapHold, refreshResults }) {
      let didRefreshResults = false;
      const racing = gameMode === "race" && raceState !== null;
      setClass(freeModeButton, "is-selected", !racing);
      setClass(raceModeButton, "is-selected", racing);
      setAttribute(freeModeButton, "aria-pressed", String(!racing));
      setAttribute(raceModeButton, "aria-pressed", String(racing));
      setHidden(racePositionBox, !racing);
      setText(sessionModeLabel, racing ? "Course · 10 voitures" : "Essais libres · N° 9");
      setText(lapCountLabel.firstChild, closed
        ? (racing ? "Tours en course : " : "Tours chronométrés : ")
        : "Parcours terminés : ");
      // Do not replace the SVG icon with text when the game mode changes.
      const restartDescription = racing ? "Rejouer la course" : "Repartir dix mètres avant la ligne d’arrivée";
      setAttribute(restartButton, "aria-label", restartDescription);
      setTitle(restartButton, restartDescription);
      if (!racing) {
        setHidden(raceOverlay, true);
        return false;
      }
      setText(racePositionValue, String(Race.position(raceState)) + "ᵉ");
      setText(raceLapLabel, !closed
        ? (raceState.phase === "finished" ? "Parcours terminé" : "Départ → Arrivée")
        : raceState.phase === "finished"
          ? Race.LAPS + " tours terminés" : "Tour " + Race.currentLap(raceState) + "/" + Race.LAPS);
      // Display validated physical lap crossings, not rounded estimated
      // distance (which can lag the finish when the samples jitter).
      setText(lapLabel, String(lapCount));
      const phase = raceState.phase;
      setClass(raceOverlay, "is-results", phase === "finished");
      setHidden(raceOverlay, phase === "racing" ||
        (phase === "finished" && lapHold !== null));
      setHidden(raceOverlayActions, phase !== "finished");
      setHidden(raceResults, phase !== "finished");
      if (phase === "finished" && refreshResults) {
        refreshClassification(raceState);
        didRefreshResults = true;
      }
      if (phase === "staging") {
        setText(raceOverlayTitle, "Prépare-toi !");
        setText(raceOverlaySubtitle, "Les voitures se mettent en place…");
      } else if (phase === "countdown") {
        setText(raceOverlayTitle, String(Math.max(1, Math.ceil(raceState.countdown))));
        setText(raceOverlaySubtitle, "Départ dans " +
          String(Math.max(1, Math.ceil(raceState.countdown))) + "…");
      } else if (phase === "finished") {
        setText(raceOverlayTitle, "Arrivée !");
        setText(raceOverlaySubtitle,
          "Position : " + Race.position(raceState) + " / 10 · " +
          LapTimes.format(raceState.raceTime * 1000));
      }
      return didRefreshResults;
    }
    function setLapCount(laps) {
      setText(lapLabel, String(laps));
    }
    function setSpeed(metresPerSecond) {
      setText(speedLabel, String(Math.round(Math.abs(metresPerSecond) * 3.6)));
      setText(gearLabel, metresPerSecond < -0.02 ? "R" : "");
    }
    return { refreshBests, refreshChrono, syncRace, setLapCount, setSpeed };
  }

  return { create };
})();

if (typeof window !== "undefined") window.GcvHud = GcvHud;
if (typeof module !== "undefined" && module.exports) module.exports = GcvHud;
