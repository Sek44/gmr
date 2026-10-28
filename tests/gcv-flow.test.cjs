"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Flow = require("../games/gcv/flow.js");

test("GCV flow starts on the menu without an active session", () => {
  const flow = Flow.create();
  assert.equal(flow.screen, "menu");
  assert.equal(flow.activity, "empty");
  assert.equal(flow.hasSession, false);
  assert.equal(flow.paused, true);
  assert.equal(flow.canDrive, false);
  flow.beginFree();
  assert.equal(flow.mode, "free");
  assert.equal(flow.hasSession, true);
  assert.equal(flow.canDrive, true);
  flow.resume();
  assert.equal(flow.screen, "play");
  assert.equal(flow.paused, false);
});

test("GCV flow scores return to their prior screen without changing the session", () => {
  const flow = Flow.create();
  assert.equal(flow.openScores(), true);
  assert.equal(flow.openScores(), false);
  assert.equal(flow.paused, true);
  assert.equal(flow.closeScores(), true);
  assert.equal(flow.screen, "menu");
  assert.equal(flow.closeScores(), false);

  flow.beginRace();
  flow.resume();
  flow.advanceRace("countdown");
  flow.advanceRace("racing");
  flow.beginFall();
  assert.equal(flow.openScores(), true);
  assert.equal(flow.scoresOpen, true);
  assert.equal(flow.canDrive, false);
  assert.equal(flow.closeScores(), true);
  assert.equal(flow.screen, "play");
  assert.equal(flow.paused, false);
  assert.equal(flow.mode, "race");
  assert.equal(flow.falling, true);
  flow.openMenu();
  assert.equal(flow.paused, true);
  flow.resume();
  assert.equal(flow.falling, true); // Resuming does not cancel a fall.
  flow.land();
  assert.equal(flow.canDrive, true);
});

test("GCV flow validates staging -> countdown -> racing -> finished", () => {
  const flow = Flow.create();
  assert.throws(() => flow.advanceRace("racing"), /Invalid GCV race transition/);
  flow.beginRace();
  assert.equal(flow.activity, "staging");
  assert.equal(flow.canDrive, false);
  assert.equal(flow.beginFall(), false);
  assert.throws(() => flow.advanceRace("finished"), /Invalid GCV race transition/);
  flow.advanceRace("staging");
  flow.advanceRace("countdown");
  assert.equal(flow.canDrive, false);
  flow.advanceRace("racing");
  assert.equal(flow.canDrive, true);
  assert.equal(flow.beginFall(), true);
  assert.equal(flow.beginFall(), false);
  assert.equal(flow.canDrive, false);
  flow.land();
  flow.advanceRace("finished");
  assert.equal(flow.canDrive, false);
  assert.equal(flow.mode, "race");
  assert.throws(() => flow.advanceRace("racing"), /Invalid GCV race transition/);
  flow.beginRace();
  assert.equal(flow.activity, "staging");
  assert.equal(flow.falling, false);
  flow.beginFree();
  assert.equal(flow.activity, "free");
  assert.equal(flow.canDrive, true);
});

test("GCV flow restores any valid race phase to the menu and on-track", () => {
  for (const phase of ["staging", "countdown", "racing", "finished"]) {
    const flow = Flow.create();
    flow.beginFree();
    flow.resume();
    flow.beginFall();
    flow.restore("race", phase);
    assert.equal(flow.activity, phase);
    assert.equal(flow.mode, "race");
    assert.equal(flow.hasSession, true);
    assert.equal(flow.falling, false);
    assert.equal(flow.screen, "play"); // Restore does not navigate implicitly.
    assert.equal(flow.canDrive, phase === "racing");
  }
  assert.throws(() => Flow.create().restore("race", "bogus"), /Invalid saved/);
  assert.throws(() => Flow.create().restore("unknown"), /Invalid saved/);
});
