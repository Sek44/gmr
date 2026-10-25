"use strict";
// Adapted from xfr1/game-ui.js: optional shared numeric controls.
window.GameUI = (() => {
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function editNumber(answer, command, maxLength) {
    if (command === "clear") return "";
    if (command === "erase") return answer.slice(0, -1);
    return /^\d$/.test(command) && answer.length < maxLength
      ? answer + command
      : answer;
  }

  function keypad(container, onInput, { clearLabel = "Effacer", disabled = false } = {}) {
    container.replaceChildren();
    for (const command of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "erase"]) {
      const editing = command === "clear" || command === "erase";
      const label = command === "clear" ? clearLabel : command === "erase" ? "⌫" : command;
      const button = element("button", editing ? "key-edit" : "", label);
      button.type = "button";
      button.disabled = disabled;
      if (editing) button.setAttribute("aria-label", command === "clear" ? "Tout effacer" : "Effacer le dernier chiffre");
      button.onclick = () => onInput(command);
      container.append(button);
    }
    return container;
  }

  return { element, editNumber, keypad };
})();
