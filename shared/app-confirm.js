"use strict";
// Adapted from xfr1/app-confirm.js: an accessible, in-app confirmation dialog.
window.AppConfirm = (() => {
  let active = false;
  function ask({ title, message, confirmText = "Confirmer", cancelText = "Annuler", theme = "light" }) {
    if (active) return Promise.resolve(false);
    active = true;
    return new Promise((resolve) => {
      const dialog = document.createElement("dialog");
      dialog.className = "app-confirm" + (theme === "dark" ? " app-confirm-dark" : "");
      const heading = document.createElement("h2");
      heading.id = "app-confirm-title";
      heading.textContent = title;
      const description = document.createElement("p");
      description.id = "app-confirm-message";
      description.textContent = message;
      dialog.setAttribute("aria-labelledby", heading.id);
      dialog.setAttribute("aria-describedby", description.id);
      const actions = document.createElement("div");
      actions.className = "confirm-actions";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.autofocus = true;
      cancel.textContent = cancelText;
      const accept = document.createElement("button");
      accept.type = "button";
      accept.className = "confirm-accept";
      accept.textContent = confirmText;
      cancel.addEventListener("click", () => dialog.close("cancel"));
      accept.addEventListener("click", () => dialog.close("confirm"));
      actions.append(cancel, accept);
      dialog.append(heading, description, actions);
      document.body.append(dialog);
      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        dialog.close("cancel");
      });
      dialog.addEventListener("close", () => {
        const confirmed = dialog.returnValue === "confirm";
        dialog.remove();
        active = false;
        resolve(confirmed);
      }, { once: true });
      try {
        dialog.showModal();
      } catch {
        dialog.remove();
        active = false;
        resolve(false);
      }
    });
  }
  return { ask };
})();
