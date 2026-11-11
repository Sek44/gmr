"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Preferences = require("../games/gcv/preferences.js");
const Layout = require("../games/gcv/track-layout.js");
const Vehicles = require("../games/gcv/vehicles.js");

function storage(initial) {
  const values = new Map(initial ? [[Preferences.KEY, initial]] : []);
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    saved: () => values.get(Preferences.KEY),
  };
}

test("menu preferences persist circuit, vehicle, mode and camera independently", () => {
  const store = storage();
  const first = Preferences.create(store);
  assert.deepEqual(first.get(), {
    track: "classic", vehicle: "classic", mode: "free", camera: "outside",
  });
  first.set({ vehicle: "moto", mode: "race", camera: "inside" });
  first.set({ track: "rainbow" });
  assert.deepEqual(Preferences.create(store).get(), {
    track: "rainbow", vehicle: "moto", mode: "race", camera: "inside",
  }, "changing the track must preserve every other selection");
  assert.deepEqual(JSON.parse(store.saved()), first.get());
});

test("unknown/corrupted preferences revert safely to defaults", () => {
  assert.deepEqual(Preferences.create(storage("{oops")).get(), Preferences.DEFAULTS);
  const values = storage(JSON.stringify({
    track: "bad", vehicle: "kart", mode: "bad", camera: 5,
  }));
  assert.deepEqual(Preferences.create(values).get(), {
    track: "classic", vehicle: "kart", mode: "free", camera: "outside",
  });
});

test("unavailable storage does not prevent local menu changes", () => {
  const prefs = Preferences.create({
    getItem() { throw Error("blocked"); },
    setItem() { throw Error("blocked"); },
  });
  prefs.set({ track: "rainbow", vehicle: "comet" });
  assert.equal(prefs.get().track, "rainbow");
  assert.equal(prefs.get().vehicle, "comet");
});

test("preference IDs match available circuits and vehicles", () => {
  for (const id of ["classic", "rainbow"])
    assert.ok(Layout.CIRCUITS.some(c => c.id === id));
  for (const id of ["classic", "moto", "kart", "buggy", "comet"])
    assert.ok(Vehicles.CHOICES.some(v => v.id === id));

  const root = path.join(__dirname, "../games/gcv");
  const entry = fs.readFileSync(path.join(root, "game.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "game.css"), "utf8");
  assert.match(html, /src="\.\/preferences\.js/);
  assert.match(entry, /if \(!navigation\.paused\) rendering\.render\(\)/);
  assert.match(css, /\.gcv-stage\.gcv-in-menu \.gcv-scene \{ visibility: hidden; \}/);
});
