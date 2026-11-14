"use strict";
// Declarative, deterministic generator for OPEN courses.
//
// Author a route with straight and turn sections, then attach features to
// straights. All distances are metres, turn angles are degrees, and the
// returned shape uses the track-layout/world-3d contracts unchanged.
// A seed modifies only explicitly marked variations; it never depends on
// Math.random(), frame timing, device, or external assets.
const GcvTrackGenerator = (() => {
  const VERSION = 1;
  const RAD = Math.PI / 180;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const rounded = (x) => Math.round(x * 1e6) / 1e6;
  const freezePoint = ([x, z]) => Object.freeze([rounded(x), rounded(z)]);
  function rng(seed) {
    let state = (Number(seed) >>> 0) || 1;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }
  function vary(value, variance, random) {
    return value + (variance ? (random() * 2 - 1) * variance : 0);
  }
  function finitePositive(value, name) {
    if (!Number.isFinite(value) || value <= 0)
      throw new RangeError(name + " must be a positive finite number");
    return value;
  }

  // Positions are linearly interpolated by accumulated centreline distance.
  // Markers are always generated from the same points as the road.
  function pointAtDistance(points, distances, distance) {
    const target = clamp(distance, 0, distances[distances.length - 1]);
    let lo = 0, hi = distances.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (distances[mid] < target) lo = mid + 1; else hi = mid;
    }
    if (lo === 0) return Object.freeze({ x: points[0][0], z: points[0][1] });
    const i = lo - 1;
    const span = distances[i + 1] - distances[i];
    const t = span > 0 ? (target - distances[i]) / span : 0;
    return Object.freeze({
      x: rounded(points[i][0] + (points[i + 1][0] - points[i][0]) * t),
      z: rounded(points[i][1] + (points[i + 1][1] - points[i][1]) * t),
    });
  }

  function build(template, seed = 1) {
    if (!template || !Array.isArray(template.sections) ||
        template.sections.length < 2)
      throw new TypeError("A circuit needs at least two sections");
    const random = rng(seed);
    const points = [freezePoint(template.origin || [0, 90])];
    const distances = [0];
    const sections = [];
    let x = points[0][0], z = points[0][1];
    let heading = (template.heading || 0) * RAD;
    let metres = 0;

    function append(step) {
      x += Math.sin(heading) * step;
      z -= Math.cos(heading) * step;
      const point = freezePoint([x, z]);
      const last = points[points.length - 1];
      const distance = Math.hypot(point[0] - last[0], point[1] - last[1]);
      if (distance < 1e-8) return;
      points.push(point);
      metres += distance;
      distances.push(metres);
    }

    for (const [i, instruction] of template.sections.entries()) {
      if (!instruction || !["straight", "turn"].includes(instruction.type))
        throw new TypeError("Unknown circuit section " + i);
      if (instruction.hump && instruction.rainbow)
        throw new RangeError("A hump and the rainbow zone need separate straights");
      const start = metres;
      const startHeading = heading;
      if (instruction.type === "straight") {
        const length = finitePositive(vary(instruction.length,
          instruction.lengthVariance || 0, random), "straight length");
        // An even distribution gives Catmull-Rom straight tangents as well
        // as accurate kilometre markers, without additional render meshes.
        const n = Math.ceil(length / 28);
        for (let j = 0; j < n; j++) append(length / n);
      } else {
        if (instruction.hump || instruction.rainbow)
          throw new RangeError("Place features on straights, not turns");
        const radius = finitePositive(vary(instruction.radius,
          instruction.radiusVariance || 0, random), "turn radius");
        const angle = vary(instruction.angle,
          instruction.angleVariance || 0, random);
        if (!Number.isFinite(angle) || Math.abs(angle) < 1 ||
            Math.abs(angle) > 100)
          throw new RangeError("Turn angle must be between 1 and 100 degrees");
        const arc = radius * Math.abs(angle) * RAD;
        const n = Math.ceil(arc / 15);
        const stepHeading = angle * RAD / n;
        const chord = 2 * radius * Math.sin(Math.abs(stepHeading) / 2);
        for (let j = 0; j < n; j++) {
          heading += stepHeading / 2;
          append(chord);
          heading += stepHeading / 2;
        }
      }
      // These templates progress broadly forwards; no lane-on-lane loops.
      if (Math.abs(heading) > 72 * RAD || Math.abs(startHeading) > 72 * RAD)
        throw new RangeError("Open-route heading exceeds the safe forward corridor");
      sections.push(Object.freeze({
        type: instruction.type, startMetres: start, endMetres: metres,
        length: metres - start, startHeading: startHeading / RAD,
        endHeading: heading / RAD,
        hump: instruction.hump || null,
        rainbow: Boolean(instruction.rainbow),
      }));
    }

    const totalLength = metres;
    const hills = [];
    let rainbow = null;
    for (const section of sections) {
      if (section.hump) {
        const hill = section.hump;
        const widthMetres = finitePositive(hill.widthMetres || 90, "hump width");
        const crownWidth = finitePositive(
          hill.crownWidthMetres || 34, "hump crown width");
        const height = finitePositive(hill.height, "hump height");
        const crown = finitePositive(hill.crown || 1, "hump crown height");
        if (crown >= height || crownWidth >= widthMetres ||
            section.length / 2 < widthMetres * 1.8 ||
            section.length / 2 < crownWidth * 3)
          throw new RangeError("A hump needs a longer straight clearance");
        const centerMetres = section.startMetres + section.length *
          (Number.isFinite(hill.position) ? clamp(hill.position, 0.25, 0.75) : 0.5);
        if (Math.min(centerMetres - section.startMetres,
          section.endMetres - centerMetres) < widthMetres * 1.8)
          throw new RangeError("Hump overlaps the turn transition");
        hills.push(Object.freeze({
          at: centerMetres / totalLength,
          height, width: widthMetres / totalLength,
          crown, crownWidth: crownWidth / totalLength,
          centerMetres, sectionStart: section.startMetres,
          sectionEnd: section.endMetres,
        }));
      }
      if (section.rainbow) {
        if (rainbow) throw new RangeError("Only one rainbow zone per circuit");
        const padding = 8;
        if (section.length <= padding * 2 + 55)
          throw new RangeError("Rainbow straight is too short");
        rainbow = Object.freeze([
          (section.startMetres + padding) / totalLength,
          (section.endMetres - padding) / totalLength,
        ]);
      }
    }

    const startMetres = template.startMetres ?? 70;
    const spawnMetres = template.spawnMetres ?? 20;
    const finishMetres = totalLength - (template.finishMargin ?? 45);
    if (spawnMetres < 5 || startMetres - spawnMetres < 20 ||
        startMetres >= finishMetres - 120 || finishMetres > totalLength - 15)
      throw new RangeError("Invalid start, spawn, or finish position");
    // Start and finish are both embedded in straight sections, safely clear
    // of the end caps and of the preceding turn.
    function onStraight(metres) {
      return sections.some(s => s.type === "straight" &&
        metres > s.startMetres + 15 && metres < s.endMetres - 15);
    }
    if (![spawnMetres, startMetres, finishMetres].every(onStraight))
      throw new RangeError("Grid and finish lines must be on straights");

    const heightAt = (fraction) => hills.reduce((result, hump) => {
      const delta = fraction - hump.at;
      return result +
        (hump.height - hump.crown) *
          Math.exp(-Math.pow(delta / hump.width, 2)) +
        hump.crown * Math.exp(-Math.pow(delta / hump.crownWidth, 2));
    }, 0);
    const result = {
      SEED: Number(seed) >>> 0,
      GENERATOR_VERSION: VERSION,
      WAYPOINTS: Object.freeze(points),
      SECTIONS: Object.freeze(sections),
      LENGTH_METRES: totalLength,
      START: pointAtDistance(points, distances, startMetres),
      SPAWN: pointAtDistance(points, distances, spawnMetres),
      FINISH: pointAtDistance(points, distances, finishMetres),
      RAINBOW: rainbow,
      HUMP_PROFILES: Object.freeze(hills),
      HUMPS: Object.freeze(hills.map(hump => hump.at)),
      heightAt,
    };
    return Object.freeze(result);
  }

  return Object.freeze({ VERSION, build });
})();
if (typeof window !== "undefined") window.GcvTrackGenerator = GcvTrackGenerator;
if (typeof module !== "undefined" && module.exports)
  module.exports = GcvTrackGenerator;
