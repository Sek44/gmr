"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function source(relative) {
  return fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
}

function renderHeadAssets(file, key = "new-page") {
  const html = source(file);
  const match = html.match(/<script>\s*(\/\/ (?:The host refresh key|The homepage refresh token)[\s\S]*?)<\/script>/);
  assert.ok(match, file + " must declare the shared per-load asset scheme");
  const written = [];
  const location = {
    href: "https://example.test/gmr/" + file + "?gmr-refresh=" + key,
    search: "?gmr-refresh=" + key,
  };
  vm.runInNewContext(match[1], {
    URL, URLSearchParams, location,
    document: { write(tag) { written.push(tag); } },
    Date,
  });
  return written;
}

test("refresh of a game URL makes its HTML and all JS/CSS entry assets fresh", () => {
  for (const [file, minimum] of [
    ["games/gcv/index.html", 24],
    ["games/gcv/benchmark.html", 14],
    ["games/_template/index.html", 7],
  ]) {
    const written = renderHeadAssets(file, "home-refresh-101");
    assert.ok(written.length >= minimum);
    assert.ok(written.some(tag => tag.startsWith('<link rel="stylesheet"')));
    assert.ok(written.some(tag => tag.startsWith('<script defer')));
    if (!file.includes("_template"))
      assert.ok(written.some(tag => tag.startsWith('<script type="module"')));
    for (const tag of written)
      assert.match(tag, /[?&]gmr-refresh=home-refresh-101/);
    assert.ok(written.every(tag => !tag.includes("gmr-refresh=old")));
  }
});

function runHost({ fullscreen = true } = {}) {
  const handlers = new Map();
  let iframe = null;
  let host = null;
  let fallback = null;
  const doc = {
    currentScript: { src: "https://example.test/gmr/shared/game-host.js?v=current" },
    fullscreenElement: null,
    body: { append(node) { host = node; } },
    createElement(tag) {
      if (tag === "iframe") {
        iframe = {
          setAttribute() {},
          removeAttribute() {},
          src: "",
        };
        return iframe;
      }
      assert.equal(tag, "div");
      return {
        hidden: false,
        append() {},
        requestFullscreen: fullscreen
          ? function () { doc.fullscreenElement = this; return Promise.resolve(); }
          : undefined,
      };
    },
    addEventListener(type, fn) { handlers.set(type, fn); },
  };
  const win = {
    GmrCatalog: {
      games: [{ id: "gcv", title: "Super Kart", fullscreen: true }],
    },
    location: {
      assign(value) { fallback = value; },
      reload() {},
    },
  };
  const fixedDate = { now: () => 123456789 };
  vm.runInNewContext(source("shared/game-host.js"), {
    URL, document: doc, window: win, Date: fixedDate, console,
  });
  const link = {
    href: "https://example.test/gmr/games/gcv/?track=rainbow",
    hasAttribute: () => false,
    target: "",
  };
  const event = {
    defaultPrevented: false,
    button: 0,
    ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
    target: { closest: () => link },
    preventDefault() { this.defaultPrevented = true; },
  };
  handlers.get("click")(event);
  assert.equal(event.defaultPrevented, true);
  return { url: iframe?.src || fallback, host, fallback };
}

test("fullscreen host gives each game iframe a fresh URL without losing options", () => {
  const { url } = runHost();
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("gmr-refresh"), "123456789");
  assert.equal(parsed.searchParams.get("track"), "rainbow");
});

test("fallback navigation also refreshes the standalone game URL", () => {
  const { url, fallback } = runHost({ fullscreen: false });
  assert.equal(url, fallback);
  assert.equal(new URL(fallback).searchParams.get("gmr-refresh"), "123456789");
});

test("home and scores links refresh games even if they do not use fullscreen", () => {
  const home = source("shared/home.js");
  const scores = source("shared/scores-page.js");
  assert.match(home, /gameUrl\.searchParams\.set\("gmr-refresh", refreshKey\)/);
  assert.match(scores, /gameUrl\.searchParams\.set\("gmr-refresh", String\(Date\.now\(\)\)\)/);
});
