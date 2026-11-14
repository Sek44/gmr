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
  assert.match(html, /<section class="gcv-menu-main" aria-labelledby="gcv-new-game-title">/);
  assert.match(html, /<h3 id="gcv-new-game-title">Nouvelle partie<\/h3>/);
  const title = html.indexOf('<header class="gcv-menu-heading">');
  const resume = html.indexOf('<section id="resume-card"');
  const newGame = html.indexOf('<section class="gcv-menu-main"');
  const start = html.indexOf('id="start-button"');
  assert.ok(title > -1 && title < resume && resume < newGame && newGame < start,
    "title and resume must precede the grouped new-game card");
  const beforeNewGame = html.slice(title, newGame);
  assert.ok(beforeNewGame.includes('</header>'));
  assert.ok(beforeNewGame.includes('</section>'));
  const grouped = html.slice(newGame, html.indexOf('</section>', html.indexOf('id="start-button"')));
  assert.match(grouped, /class="gcv-menu-options"/);
  assert.match(grouped, /class="gcv-menu-launch"/);
  assert.match(grouped, /id="start-button"/);
  const css = file("game.css");
  assert.match(css, /\.gcv-new-game-content\s*\{/);
  assert.match(css, /@media \(orientation: portrait\) and \(max-width: 700px\)/);
});

test("GMR and GCV share the official Super Kart title and circuit artwork", () => {
  const html = file("index.html");
  const css = file("game.css");
  const artwork = file("assets/home-circuit.svg");
  const catalog = fs.readFileSync(path.join(__dirname, "../games/catalog.js"), "utf8");
  const home = fs.readFileSync(path.join(__dirname, "../shared/home.js"), "utf8");
  const headingStart = html.indexOf('<header class="gcv-menu-heading">');
  const heading = html.slice(headingStart, html.indexOf("</header>", headingStart));
  assert.ok(heading.includes("<h2>SUPER KART</h2>"));
  assert.ok(catalog.includes('title: "Super Kart"'));
  assert.ok(catalog.includes('artwork: "./games/gcv/assets/home-circuit.svg?v=20261114t"'));
  assert.ok(heading.includes('class="gcv-title-artwork" src="./assets/home-circuit.svg?v=20261114t"'));
  assert.ok(!heading.includes('class="gcv-title-kart"'));
  assert.ok(artwork.includes('viewBox="0 0 480 330"'));
  assert.ok(artwork.includes('id="circuit"'));
  assert.ok(artwork.includes('id="finish-flag"'));
  assert.ok(home.includes('new URL(game.artwork || assetRoot'));
  const rule = css.slice(css.indexOf(".gcv-menu-heading {"),
    css.indexOf("}", css.indexOf(".gcv-menu-heading {")));
  assert.ok(rule.includes("background: none; border: 0;"));
  assert.ok(css.includes(".gcv-title-artwork {"));
  assert.ok(css.includes("font-size: clamp(2.3rem, 10.5vw, 3.4rem)"));
  assert.ok(html.includes("game.css?v=20261114t"));
});
test("top-aligned menu keeps the three sections ordered and has SVG mode icons", () => {
  const html = file("index.html");
  const css = file("game.css");
  const menu = html.slice(html.indexOf('class="gcv-home-panel"'), html.indexOf('class="gcv-hud-left"'));
  for (const id of ["free-mode-button", "race-mode-button"]) {
    const button = menu.match(new RegExp('<button[^>]+id="' + id + '"[\\s\\S]*?<\\/button>'))?.[0];
    assert.ok(button, id + " must exist");
    assert.match(button, /<svg class="gcv-mode-icon"[^>]+aria-hidden="true">/);
    assert.match(button, /<span class="gcv-mode-content"><strong>/);
    assert.match(button, /<small>/);
  }
  const cssPanel = css.slice(css.indexOf(".gcv-home-panel {"), css.indexOf(".gcv-menu-heading {"));
  assert.ok(cssPanel.includes("margin: 0;"), "the menu must not center vertically");
  assert.ok(!cssPanel.includes("margin-block: auto"));
  assert.ok(css.includes(".gcv-mode-content small { display: none; }"));
  assert.ok(css.includes(".gcv-mode-icon {"));
  assert.ok(html.includes('["style", "./game.css?v='));
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
