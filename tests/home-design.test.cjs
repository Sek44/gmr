"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("home uses standalone SVG assets and a theme separate from layout", () => {
  const html = read("index.html");
  const layout = read("shared/styles/home.css");
  const theme = read("shared/themes/classic-play/home.css");
  const entry = read("shared/site.css");
  assert.match(html, /class="page home-page"/);
  assert.match(html, /id="game-grid"/);
  assert.match(html, /id="gmr-daily-summary"/);
  assert.match(entry, /themes\/classic-play\/theme\.css/);
  assert.match(entry, /themes\/classic-play\/home\.css/);
  assert.match(layout, /\.game-card/);
  assert.match(theme, /\.game-artwork/);
  assert.doesNotMatch(layout, /background-color:|#[a-fA-F0-9]{3,8}/);
  const assets = path.join(root, "shared/themes/classic-play/assets");
  const names = fs.readdirSync(assets);
  assert.ok(names.length >= 4);
  for (const name of names) {
    assert.match(name, /\.svg$/);
    const svg = read("shared/themes/classic-play/assets/" + name);
    assert.match(svg, /<svg /);
    assert.match(svg, /viewBox=/);
    assert.doesNotMatch(svg, /<image\b|data:image|(?:href|src)="https?:\/\//);
  }
  const imageRefs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)];
  assert.ok(imageRefs.length >= 3);
  for (const match of imageRefs) {
    assert.match(match[1], /\.svg$/);
    assert.ok(fs.existsSync(path.resolve(root, match[1])));
  }
});

test("catalog artwork belongs to its game and is a local SVG", () => {
  const context = { window: {} };
  vm.runInNewContext(read("games/catalog.js"), context);
  for (const game of context.window.GmrCatalog.games) {
    if (!game.artwork) continue;
    assert.match(game.artwork, /\.svg$/);
    assert.ok(game.artwork.startsWith("./games/" + game.id + "/assets/"));
    const filename = path.resolve(root, game.artwork);
    assert.ok(fs.existsSync(filename), "missing artwork " + filename);
    assert.match(fs.readFileSync(filename, "utf8"), /viewBox=/);
  }
});

test("home rendering retains playable links and session compatibility", () => {
  const nodes = {};
  const make = (tag) => ({
    tag, className: "", children: [], attributes: {}, textContent: "",
    append(...children) { this.children.push(...children); },
    setAttribute(key, value) { this.attributes[key] = value; },
  });
  nodes["game-grid"] = make("div");
  nodes["empty-games"] = make("p");
  nodes["gmr-daily-summary"] = make("div");
  const document = {
    getElementById(id) { return nodes[id]; },
    createElement: make,
  };
  const context = {
    document, window: {
      GmrPlayTime: { mountSummary(node) { assert.equal(node, nodes["gmr-daily-summary"]); } },
      GmrCatalog: { games: [
        { id: "first", title: "Premier", description: "Course", category: "Course", saveRevision: 3 },
        { id: "second", title: "Second", description: "Défi" },
      ] },
      GameState: { create(id) { return { load: () => id === "first" ? { saveRevision: 3 } : null }; } },
    },
    encodeURIComponent,
  };
  vm.runInNewContext(read("shared/home.js"), context);
  assert.equal(nodes["empty-games"].hidden, true);
  assert.equal(nodes["game-grid"].children.length, 2);
  const [first, second] = nodes["game-grid"].children;
  assert.equal(first.href, "./games/first/");
  assert.equal(second.href, "./games/second/");
  assert.equal(first.children[1].children[3].children[0].textContent, "Reprendre");
  assert.equal(second.children[1].children[3].children[0].textContent, "Jouer");
  assert.ok(second.children[0].children[0].src.endsWith("gamepad.svg"));
});
