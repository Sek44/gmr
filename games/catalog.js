"use strict;"
// Register a game here once games/<id>/index.html is playable.
window.GmrCatalog = Object.freeze({
  games: Object.freeze([
    Object.freeze({
      id: "gcv",
      saveRevision: 10,
      // Loaded in order by the shared Scores page only, never by other games.
      scoreScripts: Object.freeze([
        "./games/gcv/track-layout.js",
        "./games/gcv/lap-times.js",
        "./games/gcv/scores-adapter.js",
      ]),
      title: "Super Kart",
      description: "Pilote la voiture n° 9 sur deux circuits 3D : trois tours ou sprint Arc-en-ciel, contre neuf concurrents.",
      icon: "🏎",
    }),
  ]),
});
