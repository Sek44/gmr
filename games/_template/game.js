"use strict";
(() => {
  // When copying the template, replace "game-id" with the new directory name.
  const gameId = "game-id";
  const store = GameState.create(gameId);
  const points = document.getElementById("points");
  const add = document.getElementById("add-point");
  const finish = document.getElementById("finish");
  const again = document.getElementById("again");
  const message = document.getElementById("message");
  let score = 0;

  function draw() { points.textContent = String(score); }
  const autosave = store.bind({
    snapshot: () => ({ score }),
    restore: (saved) => {
      if (saved && Number.isSafeInteger(saved.score) && saved.score >= 0) score = saved.score;
    },
  });
  draw();

  // Visiting scores preserves this exact DOM/game state.
  ScoreView.bind({ suspend: () => autosave.saveNow() });

  add.addEventListener("click", () => {
    score += 1;
    draw();
    autosave.changed();
  });

  finish.addEventListener("click", () => {
    autosave.stop({ discard: true });
    const stored = score === 0 || GameScores.save({ gameId, score });
    add.disabled = true;
    finish.hidden = true;
    again.hidden = false;
    message.textContent = stored
      ? "Partie terminée !"
      : "Impossible d'enregistrer le score. Vérifie l'espace de stockage.";
  });

  again.addEventListener("click", () => location.reload());
})();
