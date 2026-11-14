"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Flow = require("../games/gcv/flow.js");
const Navigation = require("../games/gcv/navigation.js");

function eventTarget() {
  const listeners = new Map();
  return {
    hidden: false,
    classList: { toggle() {} },
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
    setAttribute(name, value) { this[name] = value; },
    fire(type, event = {}) { listeners.get(type)?.(event); },
    textContent: "",
    title: "",
  };
}
function launchHost({ supportsFullscreen = true, rejectFullscreen = false } = {}) {
  const body = { append(el) { this.child = el; } };
  const document = {
    currentScript: { src: "https://sek44.github.io/gmr/shared/game-host.js" },
    body, fullscreenElement: null,
    ...eventTarget(),
    createElement(tag) {
      const element = {
        tag, attributes: {}, hidden: false,
        setAttribute(key, value) { this.attributes[key] = value; },
        removeAttribute(key) { delete this.attributes[key]; this.src = ""; },
        append(child) { this.child = child; },
      };
      if (tag === "div" && supportsFullscreen) {
        element.requestFullscreen = () => {
          document.fullscreenElement = rejectFullscreen ? null : element;
          return rejectFullscreen ? Promise.reject(new Error("denied")) : Promise.resolve();
        };
      }
      return element;
    },
    exitFullscreen() {
      document.fullscreenElement = null;
      this.fire("fullscreenchange");
      return Promise.resolve();
    },
  };
  const assigned = [];
  let reloads = 0;
  const window = {
    GmrCatalog: { games: [{ id: "gcv", title: "Super Kart", fullscreen: true }] },
    location: {
      assign(url) { assigned.push(url); },
      reload() { reloads++; },
    },
  };
  const source = fs.readFileSync(path.join(__dirname, "../shared/game-host.js"), "utf8");
  vm.runInNewContext(source, { document, window, URL, Promise, console });
  const host = body.child;
  const click = (href) => {
    let prevented = false;
    document.fire("click", {
      button: 0, target: { closest() { return { href, target: "" , hasAttribute() { return false; } }; } },
      preventDefault() { prevented = true; },
    });
    return prevented;
  };
  return { document, window, host, assigned, click, get reloads() { return reloads; } };
}

test("Home click enters fullscreen synchronously before loading GCV", async () => {
  const h = launchHost();
  assert.equal(h.click("https://sek44.github.io/gmr/games/gcv/"), true);
  assert.equal(h.document.fullscreenElement, h.host);
  assert.equal(h.host.child.src, "https://sek44.github.io/gmr/games/gcv/");
  assert.equal(h.host.hidden, false);
  assert.deepEqual(h.assigned, []);
  h.window.GmrGameHost.navigate("scores");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(h.assigned[0],
    "https://sek44.github.io/gmr/scores.html?game=gcv&from=gcv");
  assert.equal(h.reloads, 0); // Exit was intentional, not browser's Esc.
});

test("Scores back-to-game uses the same fullscreen launch; Esc restores launcher", () => {
  const h = launchHost();
  assert.equal(h.click("https://sek44.github.io/gmr/games/gcv/?track=rainbow"), true);
  h.document.fullscreenElement = null;
  h.document.fire("fullscreenchange");
  assert.equal(h.host.hidden, true);
  assert.equal(h.reloads, 1);
});

test("Denied fullscreen falls back to a standalone navigable game", async () => {
  const h = launchHost({ rejectFullscreen: true });
  assert.equal(h.click("https://sek44.github.io/gmr/games/gcv/"), true);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(h.assigned[0], "https://sek44.github.io/gmr/games/gcv/");
});

function navigationFixture(hosted) {
  const document = eventTarget();
  document.fullscreenElement = null;
  document.exitFullscreen = () => {
    document.fullscreenElement = null;
    return Promise.resolve();
  };
  let fullscreenCalls = 0;
  const stage = eventTarget();
  stage.requestFullscreen = () => {
    fullscreenCalls++;
    document.fullscreenElement = stage;
    return Promise.resolve();
  };
  const controls = ["resumeButton", "menuButton", "menuHomeButton",
    "scoresButton", "menuScoresButton"];
  const buttons = Object.fromEntries(controls.map((name) => [name, eventTarget()]));
  const pages = [], hostedPages = [];
  const window = { location: { assign(url) { pages.push(url); } } };
  window.parent = hosted ? { GmrGameHost: {
    fullscreen: true, navigate(page) { hostedPages.push(page); },
  } } : window;
  const flow = Flow.create();
  flow.beginFree();
  let saves = 0;
  const nav = Navigation.create({
    window, document, location: {
      href: "https://sek44.github.io/gmr/games/gcv/",
    }, stage, homePanel: eventTarget(),
    ...buttons, clearControls() {}, flow, onResume() {},
    changed() { saves++; }, announce() {},
  });
  return { nav, buttons, stage, pages, hostedPages, flow,
    get fullscreenCalls() { return fullscreenCalls; },
    get saves() { return saves; } };
}

test("Direct GCV start requests fullscreen, scores save and leave fullscreen", async () => {
  const f = navigationFixture(false);
  f.buttons.resumeButton.fire("click");
  assert.equal(f.fullscreenCalls, 1);
  assert.equal(f.flow.paused, false);
  f.buttons.scoresButton.fire("click");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(f.pages[0],
    "https://sek44.github.io/gmr/scores.html?game=gcv&from=gcv");
  assert.ok(f.saves >= 2);
  f.nav.dispose();
});


test("First direct-game selection requests fullscreen, but exit buttons do not", () => {
  const f = navigationFixture(false);
  f.stage.fire("click", { target: { closest() { return true; } } });
  assert.equal(f.fullscreenCalls, 0); // Home/Scores are not an entry gesture.
  f.stage.fire("click", { target: { closest() { return null; } } });
  assert.equal(f.fullscreenCalls, 1);
  f.nav.dispose();
});

test("Hosted GCV does not request nested fullscreen; Home delegates to host", () => {
  const f = navigationFixture(true);
  f.buttons.resumeButton.fire("click");
  assert.equal(f.fullscreenCalls, 0);
  f.buttons.menuHomeButton.fire("click");
  assert.deepEqual(f.hostedPages, ["home"]);
  assert.deepEqual(f.pages, []);
  assert.ok(f.saves >= 2);
  f.nav.dispose();
});

test("GCV controls show Scores then Home in menu and Scores then Menu while driving", () => {
  const html = fs.readFileSync(path.join(__dirname, "../games/gcv/index.html"), "utf8");
  const menuActions = html.match(/<div class="gcv-home-tools"[^>]*>([\s\S]*?)<\/div>/)?.[1];
  const raceActions = html.match(/<div class="gcv-actions">([\s\S]*?)<\/div>/)?.[1];
  assert.ok(menuActions && raceActions);
  const ids = (text) => [...text.matchAll(/id="([^"]+-button)"/g)].map((match) => match[1]);
  assert.deepEqual(ids(menuActions), ["menu-scores-button", "menu-home-button"]);
  assert.deepEqual(ids(raceActions),
    ["scores-button", "menu-button", "restart-button", "camera-button"]);
  assert.doesNotMatch(html, /id="(?:home-button|fullscreen-button|menu-fullscreen-button)"/);
  const css = fs.readFileSync(path.join(__dirname, "../games/gcv/game.css"), "utf8");
  assert.match(css, /\.gcv-actions #scores-button \{ grid-column: 1; grid-row: 1; \}/);
  assert.match(css, /\.gcv-actions #menu-button \{ grid-column: 2; grid-row: 1; \}/);
});
