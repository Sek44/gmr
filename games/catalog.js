"use strict;"
// Register a game here once games/<id>/index.html is playable.
window.GmrCatalog = Object.freeze({
  games: Object.freeze([
    Object.freeze({
      id: "gcv",
      saveRevision: 9,
      // Loaded in order by the shared Scores page only, never by other games.
      scoreScripts: Object.freeze([
        "./games/gcv/track-layout.js",
        "./games/gcv/lap-times.js",
        "./games/gcv/scores-adapter.js",
      ]),
      title: "Grande Course Voiture",
      description: "Pilote la voiture n° 9 sur un circuit 3D. 3 tours contre 9 concurrents, ou essais libres.",
      icon: "🏎",
    }),
  ]),
});
