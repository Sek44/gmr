"use strict;"
// Register a game here once games/<id>/index.html is playable.
window.GmrCatalog = Object.freeze({
  games: Object.freeze([
    Object.freeze({
      id: "gcv",
      saveRevision: 14,
      fullscreen: true,
      // Loaded in order by the shared Scores page only, never by other games.
      scoreScripts: Object.freeze([
        "./games/gcv/track-generator.js",
        "./games/gcv/track-layout.js",
        "./games/gcv/lap-times.js",
        "./games/gcv/scores-adapter.js",
      ]),
      title: "Super Kart",
      category: "Course 3D",
      artwork: "./games/gcv/assets/home-circuit.svg?v=20261114t",
    }),
  ]),
});
