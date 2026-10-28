"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Flow = require("../games/gcv/flow.js");
const Navigation = require("../games/gcv/navigation.js");
const Session = require("../games/gcv/session.js");

function element() {
  const listeners = {};
  const classes = new Set();
  return {
    hidden: false, textContent: "", listeners, title: "", src: undefined,
    classList: {
      toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
    fire(name, event = {}) { for (const fn of listeners[name] || []) fn(event); },
    querySelector() { return this.label ||= element(); },
    setAttribute(name, value) { this[name] = value; },
    removeAttribute(name) { delete this[name]; },
  };
}

test("navigation: menu, session resume, score iframe, same-origin close and fullscreen", async () => {
  const win = element(), doc = element(), stage = element();
  const homePanel = element(), resumeButton = element(), scoresFrame = element();
  scoresFrame.contentWindow = {};
  const menuButton = element(), scoresButton = element();
  const menuScoresButton = element(), fullscreenButton = element();
  const menuFullscreenButton = element();
  const flow = Flow.create();
  let clearCount = 0, saved = 0, resumes = 0;
  const nav = Navigation.create({
    window: win, document: doc, location: { origin: "https://example.org" },
    stage, homePanel, resumeButton, menuButton, scoresButton,
    menuScoresButton, scoresFrame, fullscreenButton, menuFullscreenButton,
    clearControls: () => { clearCount++; },
    flow,
    onResume: () => { resumes++; }, changed: () => { saved++; }, announce() {},
  });
  nav.sync();
  assert.equal(nav.paused, true);
  assert.equal(resumeButton.hidden, true);
  resumeButton.fire("click");
  assert.equal(nav.paused, false);
  assert.equal(flow.hasSession, true);
  assert.equal(homePanel.hidden, true);
  assert.equal(saved, 1);
  flow.beginRace();
  menuButton.fire("click");
  assert.equal(nav.paused, true);
  assert.equal(resumeButton.textContent, "Reprendre la course");
  assert.equal(saved, 2);
  menuScoresButton.fire("click");
  assert.equal(scoresFrame.hidden, false);
  assert.equal(scoresFrame.src, "../../scores.html?game=gcv&from=gcv");
  win.fire("message", { origin: "https://attacker.org",
    source: scoresFrame.contentWindow, data: { type: "gmr-scores-back" } });
  assert.equal(nav.scoresOpen, true);
  win.fire("message", { origin: "https://example.org",
    source: {}, data: { type: "gmr-scores-back" } });
  assert.equal(nav.scoresOpen, true);
  win.fire("message", { origin: "https://example.org",
    source: scoresFrame.contentWindow, data: { type: "gmr-scores-back" } });
  assert.equal(nav.scoresOpen, false);
  assert.equal(nav.paused, true); // Still at the menu after closing scores.
  assert.equal(scoresFrame.src, undefined);
  assert.equal(resumes, 2);
  assert.equal(clearCount, 2);
  stage.requestFullscreen = async () => { doc.fullscreenElement = stage; doc.fire("fullscreenchange"); };
  doc.exitFullscreen = async () => { doc.fullscreenElement = null; doc.fire("fullscreenchange"); };
  await nav.closeScores();
  fullscreenButton.fire("click");
  await Promise.resolve();
  assert.equal(fullscreenButton["aria-label"], "Quitter le plein écran");
  menuFullscreenButton.fire("click");
  await Promise.resolve();
  assert.equal(menuFullscreenButton["aria-label"], "Passer en plein écran");
});

function vector(x, z) {
  return {
    x, z, clone() { return vector(this.x, this.z); },
    addScaledVector(v, s) { this.x += v.x * s; this.z += v.z * s; return this; },
  };
}

function fixture(previous = null) {
  const state = {
    driver: { x: 5, z: 0, yaw: 0, speed: 4, reverseHold: 0 },
    cameraMode: "outside",
    lapTracker: { progress: 5, laps: 1, index: 0 },
    lapTimer: { elapsedMs: 1200 }, raceState: null,
    freeSession: null, fall: null, respawnIndex: 0,
  };
  const flow = Flow.create();
  let stored = previous, clears = 0, writes = 0, renders = 0, resumes = 0;
  const store = {
    load: () => stored,
    clear() { clears++; stored = null; },
    bind({ snapshot, restore }) {
      if (stored) restore(stored);
      return { changed() { stored = snapshot(); writes++; } };
    },
  };
  const s = Session.create({
    window: { GameState: { create: (id) => {
      assert.equal(id, "gcv"); return store;
    } } }, state, flow, revision: 9, circuitKey: "layout",
    layoutVersion: 1, positions: [vector(0, 0)],
    directions: [vector(1, 0)], startIndex: 0,
    startCenter: vector(0, 0), startSide: vector(0, 1), startYaw: 0,
    trackLength: 500, SAMPLE_COUNT: 100, OUTER_HALF_WIDTH: 12,
    Physics: { REVERSE_MAX_SPEED: 5, MAX_SPEED: 50, REVERSE_DELAY: 2 },
    TrackProgress: {
      relocate: (motion, index) => ({ ...motion, index }),
      createMotion: (trackLength, progress, index, prior) =>
        prior ? { ...prior, index } : { progress, index, laps: 0 },
    },
    LapTimes: {
      sameCircuitRoute: (a, b) => a === b,
      initial: () => ({ elapsedMs: 0 }),
      restore: (saved) => saved,
    },
    Race: {
      PLAYER_SLOT: 4, gridSlot: () => ({ distance: 12, lateral: 2 }),
      create: (length, random, motion) =>
        ({ phase: "staging", playerMotion: motion, opponents: [] }),
      restore: (saved) => saved,
    },
    progressSamples: (value) => value / 5,
    startOffset: () => 0, closestRoad: () => ({ index: 0, distanceSquared: 0 }),
    snapBack() {}, clearControls() {}, clearLapHold() {},
    resetResultsCooldown() {}, renderSession() { renders++; },
    setLapCount() {}, announce() {}, resume() { resumes++; flow.resume(); },
  });
  return { s, state, flow, store,
    counters: () => ({ clears, writes, renders, resumes }),
    stored: () => stored };
}

test("camera starts outside on first launch and restores the saved choice", () => {
  const dir = path.join(__dirname, "../games/gcv");
  const entry = fs.readFileSync(path.join(dir, "game.js"), "utf8");
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  assert.match(entry, /let cameraMode = "outside";/);
  assert.match(html, /id="camera-button" aria-label="Passer en vue intérieure"/);
  assert.match(html, /Caméra : extérieure/);

  const fresh = fixture();
  fresh.s.bind();
  assert.equal(fresh.state.cameraMode, "outside");
  fresh.s.startRace();
  fresh.s.changed();
  assert.equal(fresh.stored().camera, "outside");

  fresh.state.cameraMode = "inside";
  fresh.s.changed();
  const resumed = fixture(fresh.stored());
  resumed.s.bind();
  assert.equal(resumed.state.cameraMode, "inside");
});

test("session switches free -> race -> previous free trial, and restarts", () => {
  const { s, state, flow, counters, stored } = fixture();
  s.bind();
  s.startRace();
  assert.equal(flow.mode, "race");
  assert.equal(state.freeSession.motion.progress, 5);
  assert.equal(state.raceState.phase, "staging");
  assert.equal(state.lapTracker.progress, -12);
  s.changed();
  assert.equal(stored().mode, "race");
  state.driver.x = -40;
  s.chooseFree();
  assert.equal(flow.mode, "free");
  assert.equal(state.raceState, null);
  assert.equal(state.lapTracker.progress, 5);
  assert.equal(state.driver.x, 5);
  s.restartNearFinish();
  assert.equal(state.driver.x, -10);
  assert.equal(state.lapTimer.elapsedMs, 0);
  assert.equal(counters().renders >= 3, true);
  assert.equal(counters().resumes, 2);
  assert.equal(counters().writes >= 2, true);
  s.tickAutosave(1.6);
  assert.equal(counters().writes >= 3, true);
});

test("fall snapshots respawn safely without losing stopwatch or race progress", () => {
  const { s, state, flow } = fixture();
  flow.beginRace();
  flow.advanceRace("countdown");
  flow.advanceRace("racing");
  flow.beginFall();
  state.driver.x = 100;
  state.lapTimer.elapsedMs = 9000;
  state.raceState = { playerProgress: 20, playerMotion: state.lapTracker };
  const snap = s.snapshot();
  assert.equal(snap.x, 0);
  assert.equal(snap.speed, 0);
  assert.equal(snap.lapTimer.elapsedMs, 9000);
  assert.equal(snap.race.playerMotion.index, 0);
  assert.equal(snap.race.playerProgress, snap.motion.progress);
});

test("older session revisions are canceled without touching record stores", () => {
  const { s, counters, state, flow } = fixture({ saveRevision: 8, x: 99 });
  s.bind();
  assert.equal(counters().clears, 1);
  assert.equal(flow.hasSession, false);
  const cat = fs.readFileSync(path.join(__dirname, "../games/catalog.js"), "utf8");
  const game = fs.readFileSync(path.join(__dirname, "../games/gcv/game.js"), "utf8");
  assert.match(cat, /saveRevision:\s*9/);
  assert.match(game, /SAVE_REVISION = 9/);
});

test("navigation and session modules are valid globals loaded before the GCV entry", () => {
  const dir = path.join(__dirname, "../games/gcv");
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  const entry = html.indexOf('src="./game.js"');
  const flowScript = html.indexOf('src="./flow.js"');
  const nav = html.indexOf('src="./navigation.js"');
  const sessions = html.indexOf('src="./session.js"');
  assert.ok(flowScript >= 0 && nav > flowScript && sessions > nav && entry > sessions);
  const sandbox = { window: {} };
  for (const file of ["flow.js", "navigation.js", "session.js"]) {
    const source = fs.readFileSync(path.join(dir, file), "utf8");
    assert.doesNotThrow(() => new vm.Script(source));
    vm.runInNewContext(source, sandbox);
  }
  assert.equal(typeof sandbox.window.GcvFlow.create, "function");
  assert.equal(typeof sandbox.window.GcvNavigation.create, "function");
  assert.equal(typeof sandbox.window.GcvSession.create, "function");
  const game = fs.readFileSync(path.join(dir, "game.js"), "utf8");
  assert.doesNotThrow(() => new vm.Script(game));
  assert.match(game, /Flow\.create\(/);
  assert.match(game, /Navigation\.create\(/);
  assert.match(game, /Session\.create\(/);
  assert.doesNotMatch(game, /function snapshot\(/);
  assert.doesNotMatch(game, /function openScores\(/);
});
