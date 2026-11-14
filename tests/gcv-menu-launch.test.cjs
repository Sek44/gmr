"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Flow = require("../games/gcv/flow.js");
const Navigation = require("../games/gcv/navigation.js");

const file = (name) => fs.readFileSync(path.join(__dirname, "../games/gcv", name), "utf8");

test("launcher has distinct resume and start actions after its options", () => {
  const html = file("index.html");
  assert.match(html, /<h2>SUPER KART<\/h2>/);
  for (const id of ["resume-card", "resume-button", "resume-details",
    "start-button", "start-summary", "free-mode-button", "race-mode-button"]) {
    assert.equal((html.match(new RegExp('id="' + id + '"', "g")) || []).length, 1);
  }
  assert.ok(html.indexOf('id="gcv-track-title"') < html.indexOf('id="start-button"'));
  assert.ok(html.indexOf('id="gcv-vehicle-title"') < html.indexOf('id="start-button"'));
  assert.ok(html.indexOf('id="gcv-mode-title"') < html.indexOf('id="start-button"'));
});

test("choosing options does not start or delete an in-progress race", () => {
  const js = file("game.js");
  const choices = js.slice(js.indexOf('function syncMenuSelections()'), js.indexOf('function launchNewGame()'));
  assert.match(choices, /preferences\.set\(\{ track: button\.dataset\.gcvTrack \}\)/);
  assert.match(choices, /preferences\.set\(\{ vehicle: button\.dataset\.gcvVehicle \}\)/);
  assert.match(choices, /preferences\.set\(\{ mode: "race" \}\)/);
  assert.doesNotMatch(choices, /session\.(startRace|startFree|chooseFree)|disposeGame|GameState\.create|history\.replaceState/);
  assert.match(js, /startButton\.addEventListener\("click", launchNewGame/);
  assert.match(js, /session\.startRace\(\{ fresh: true \}\)/);
  assert.match(js, /session\.startFree\(\)/);
  assert.match(js, /resumableTrack/);
  assert.match(file("session.js"), /function startFree\(\)/);
});

function eventTarget() {
  const handlers = new Map();
  return {
    hidden: false, textContent: "",
    addEventListener(name, handler) { handlers.set(name, handler); },
    removeEventListener(name, handler) {
      if (handlers.get(name) === handler) handlers.delete(name);
    },
    fire(name = "click") { handlers.get(name)?.({ target: { closest: () => null } }); },
  };
}

test("menu resume presents the stored run and resumes without replacing it", () => {
  const flow = Flow.create();
  const stage = eventTarget();
  stage.classList = { toggle() {} };
  const doc = { fullscreenElement: stage };
  const w = { location: { href: "https://example.test/games/gcv/" } };
  w.parent = w;
  const resumeButton = eventTarget();
  const resumeCard = eventTarget();
  const resumeDetails = eventTarget();
  const menuButton = eventTarget();
  let resumed = 0;
  const nav = Navigation.create({
    window: w, document: doc, location: w.location, stage,
    homePanel: eventTarget(), resumeButton, resumeCard, resumeDetails,
    describeSession: () => "Route Arc-en-ciel · Moto Turbo",
    menuButton, menuHomeButton: eventTarget(), scoresButton: eventTarget(),
    menuScoresButton: eventTarget(), clearControls() {}, flow,
    onResume() { resumed++; }, changed() {}, announce() {},
  });
  nav.sync();
  assert.equal(resumeCard.hidden, true);
  flow.beginRace();
  nav.sync();
  assert.equal(resumeCard.hidden, false);
  assert.equal(resumeButton.textContent, "Reprendre la course");
  assert.equal(resumeDetails.textContent, "Route Arc-en-ciel · Moto Turbo");
  resumeButton.fire();
  assert.equal(flow.screen, "play");
  assert.equal(flow.activity, "staging");
  assert.equal(resumed, 1);
  menuButton.fire();
  assert.equal(flow.screen, "menu");
  assert.equal(resumeCard.hidden, false);
  flow.advanceRace("countdown");
  flow.advanceRace("racing");
  flow.advanceRace("finished");
  nav.sync();
  assert.equal(resumeButton.textContent, "Voir les résultats");
  nav.dispose();
});
