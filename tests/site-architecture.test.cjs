"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const file = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("shared site styles have one stable entry and focused owners", () => {
  const entry = file("shared/site.css");
  for (const name of ["base", "components", "home", "scores", "play-time"]) {
    assert.match(entry, new RegExp('@import[^;]*styles/' + name + '\\.css'));
    assert.ok(fs.existsSync(path.join(root, "shared/styles", name + ".css")));
  }
  assert.match(file("shared/styles/home.css"), /\.game-card/);
  assert.match(file("shared/styles/scores.css"), /\.history-table/);
  assert.match(file("shared/styles/play-time.css"), /\.gmr-play-lock/);
  assert.doesNotMatch(file("shared/site.css"), /\.game-card\s*\{/);
});

test("catalog entries have independent game directories and documentation", () => {
  const context = { window: {} };
  vm.runInNewContext(file("games/catalog.js"), context);
  const games = context.window.GmrCatalog.games;
  const seen = new Set();
  for (const game of games) {
    assert.match(game.id, /^[a-z0-9][a-z0-9-]*$/);
    assert.ok(!seen.has(game.id), "duplicate game identifier: " + game.id);
    seen.add(game.id);
    const index = file("games/" + game.id + "/index.html");
    assert.match(index, /\.\.\/\.\.\/shared\/site\.css/);
    for (const doc of ["SPECIFICATIONS.md", "ARCHITECTURE.md", "BACKLOG.md"]) {
      assert.ok(fs.existsSync(path.join(root, "games", game.id, "docs", doc)));
    }
  }
});

test("game-specific score renderers are registered without importing games into shared code", () => {
  const shared = file("shared/scores.js");
  assert.doesNotMatch(shared, /GcvLapTimes|GcvTrackLayout/);
  const html = file("scores.html");
  assert.doesNotMatch(html, /games\/gcv\//);
  assert.match(file("shared/scores-page.js"), /game\.scoreScripts/);
  const catalogContext = { window: {} };
  vm.runInNewContext(file("games/catalog.js"), catalogContext);
  const gcv = catalogContext.window.GmrCatalog.games.find((game) => game.id === "gcv");
  assert.deepEqual(Array.from(gcv.scoreScripts), [
    "./games/gcv/track-layout.js",
    "./games/gcv/lap-times.js",
    "./games/gcv/scores-adapter.js",
  ]);
  const document = {
    createElement(tag) {
      return {
        tag, children: [], textContent: "", className: "",
        append(...items) { this.children.push(...items); },
        replaceChildren(...items) { this.children = items; },
      };
    },
  };
  const context = {
    window: {}, document, localStorage: { getItem: () => null },
  };
  vm.runInNewContext(shared, context);
  const scores = context.window.GameScores;
  let calls = 0;
  scores.registerRenderer("gcv", () => { calls++; });
  assert.throws(() => scores.registerRenderer("../gcv", () => {}), /Invalid score renderer/);
  const target = document.createElement("section");
  scores.render(target, "gcv");
  scores.render(target);
  assert.equal(calls, 2);
});
