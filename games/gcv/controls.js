"use strict";

// Keyboard, analog pointer steering and multi-touch pedals.
const GcvControls = (() => {
  function create({ window, document, stage, pad, knob, gasButton, brakeButton }) {
    const keys = new Set();
    let steerPointer = null, touchSteer = 0;
    const gasPointers = new Set(), brakePointers = new Set();

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    function refreshPad() {
      const steering = steerPointer === null
        ? ((keys.has("arrowright") || keys.has("d") ? 1 : 0) -
            (keys.has("arrowleft") || keys.has("a") ? 1 : 0))
        : touchSteer;
      knob.style.left = (50 + clamp(steering, -1, 1) * 43) + "%";
      pad.setAttribute("aria-valuenow", String(Math.round(steering * 100)));
      pad.setAttribute("aria-valuetext", steering < -0.1 ? "Gauche" : steering > 0.1 ? "Droite" : "Tout droit");
      return steering;
    }
    function updateSteering(event) {
      const rect = pad.getBoundingClientRect();
      touchSteer = clamp(2 * (event.clientX - rect.left) / rect.width - 1, -1, 1);
      if (Math.abs(touchSteer) < 0.08) touchSteer = 0;
      refreshPad();
    }
    pad.addEventListener("pointerdown", (event) => {
      if (steerPointer !== null || (event.pointerType === "mouse" && event.button !== 0)) return;
      event.preventDefault();
      steerPointer = event.pointerId;
      pad.setPointerCapture(event.pointerId);
      updateSteering(event);
    });
    pad.addEventListener("pointermove", (event) => {
      if (event.pointerId === steerPointer) updateSteering(event);
    });
    function finishSteer(event) {
      if (event.pointerId !== steerPointer) return;
      steerPointer = null;
      touchSteer = 0;
      refreshPad();
    }
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      pad.addEventListener(type, finishSteer);
    }

    function bindPedal(button, pointerSet) {
      function sync() { button.classList.toggle("is-active", pointerSet.size !== 0); }
      button.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        event.preventDefault();
        pointerSet.add(event.pointerId);
        button.setPointerCapture(event.pointerId);
        sync();
      });
      function release(event) {
        pointerSet.delete(event.pointerId);
        sync();
      }
      for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
        button.addEventListener(type, release);
      }
    }
    bindPedal(gasButton, gasPointers);
    bindPedal(brakeButton, brakePointers);

    const drivingKeys = new Set(["arrowleft", "arrowright", "arrowup", "arrowdown", "a", "d", "w", "s"]);
    window.addEventListener("keydown", (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const key = event.key.toLowerCase();
      if (!drivingKeys.has(key)) return;
      event.preventDefault();
      keys.add(key);
      refreshPad();
    });
    window.addEventListener("keyup", (event) => {
      const key = event.key.toLowerCase();
      if (!drivingKeys.has(key)) return;
      keys.delete(key);
      refreshPad();
    });
    function clearControls() {
      keys.clear();
      gasPointers.clear();
      brakePointers.clear();
      steerPointer = null;
      touchSteer = 0;
      gasButton.classList.remove("is-active");
      brakeButton.classList.remove("is-active");
      refreshPad();
    }
    window.addEventListener("blur", clearControls);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) clearControls();
    });
    // Prevent a context menu from appearing after long touches.
    stage.addEventListener("contextmenu", (event) => event.preventDefault());
    return {
      read() {
        return {
          steer: refreshPad(),
          accelerate: gasPointers.size > 0 || keys.has("arrowup") || keys.has("w"),
          brake: brakePointers.size > 0 || keys.has("arrowdown") || keys.has("s"),
        };
      },
      isBraking() {
        return brakePointers.size > 0 || keys.has("arrowdown") || keys.has("s");
      },
      clear: clearControls,
    };
  }

  return { create };
})();

if (typeof window !== "undefined") window.GcvControls = GcvControls;
if (typeof module !== "undefined" && module.exports) module.exports = GcvControls;
