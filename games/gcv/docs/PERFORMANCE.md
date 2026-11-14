# Super Kart (GCV) — rendering performance review

Status: **source review, not a measured performance diagnosis**. Updated 2026-11-14. No FPS, GPU-time or memory-budget claims are made without measurements on real devices.

## Scope

Reviewed `rendering.js`, `vehicles.js`, `world-3d.js`, `visual-effects.js`, `game.js`, `hud.js`, `mini-map.js`, `track-layout.js`, `scenery.js`, `game.css` and the repository file inventory. The game uses Three.js **0.180.0**, loaded as an ES module, with a WebGL renderer. There are **no external GCV PNG/WebP/SVG/OBJ/glTF/GLB asset files**; vehicles, circuits, scenery and most textures are generated at runtime. UI icons are inline SVG.

## Existing good practices

- The road, shoulders, safety barriers and cliff geometry are combined into large indexed meshes.
- Guardrail posts, pebbles, mud patches and puddles are already instanced.
- Mud and spark effects use small batched `THREE.Points` buffers (240 and 48 particles respectively).
- The road sample density (840 classic, 720 open course) is moderate and is also used by gameplay and collisions: do not lower it blindly.
- Only one player vehicle model is visible at a time; there is no post-processing or realtime shadow mapping.
- The open course already has an MSAA/framebuffer budget to protect older mobile GPUs; the renderer skips drawing while the menu covers the stage.
- Scenes, materials, geometries and WebGL contexts are explicitly disposed when a circuit changes.

## Opportunities, ordered by priority

| Priority | Finding | Location | Suggested change | Validation |
| --- | --- | --- | --- | --- |
| P1 | Nine AI cars are built from ~12 individual meshes each (approximately **108 mesh draws** when visible), counting body, four wheels and five number plates. | `vehicles.js` | Merge static parts by material, share wheel geometry, consider instancing shared parts and a number atlas. | Compare race draw calls and p95 frame time; keep car colors/numbers visible. |
| P1 | Classic track uses DPR up to **1.7**; open track caps DPR at **1.15** and **750,000 pixels**. | `rendering.js` | Define a mobile-friendly resolution budget for *both* circuits; consider adaptive scaling after measurements. | Compare sharpness, p95 frame time, and framebuffer dimensions on each device/orientation. |
| P1 | HUD values are assigned repeatedly; the chrono is refreshed in both `updateCar()` and the outer frame. | `game.js`, `hud.js` | Remove the duplicate refresh, cache unchanged values, throttle noncritical text. | Measure main-thread frame cost; verify lap/timer/rank transitions. |
| P2 | One checkered line creates **24 separate tile meshes**; open track has two lines (48). | `world-3d.js` | Use two instanced meshes (one per color) for all tiles. | Compare draw calls, check tile orientation and finish timing gate visuals. |
| P2 | Each motorcycle wheel consists of many individual spoke/rim/hub meshes (about 15 per wheel). | `vehicles.js` | Merge rigid parts without removing the rotating wheel pivots or changing silhouette. | Compare moto draw calls and visible spokes. |
| P2 | Several flat transparent meshes use `DoubleSide`; depending on material/render state, this may double rendering passes. | `world-3d.js`, `rendering.js` | Verify triangle winding; use front-side rendering on surfaces only seen from above, and consider instancing ground-shadow decals. | Confirm no surfaces disappear and blending remains correct. |
| P2 | Two animated brake `PointLight` objects are present even though emissive brake meshes exist. | `vehicles.js` | Try emissive/cheap glow only; profile impact before removing lights. | Compare night/day appearance and GPU frame time. |
| P3 | Changing circuits tears down and recreates the renderer, vehicle geometry, scene, shaders and textures. | `game.js`, `rendering.js` | Consider a persistent renderer with scene-scoped disposal after profiling initialization time and context reliability. | Test repeated circuit switching and Android memory stability. |
| P3 | Opponent synchronization searches entries and evaluates curve points/tangents per AI each frame. | `rendering.js` | Consider indexing AI by id and/or interpolating precalculated track samples. | Check CPU profile and avoid motion discontinuity. |
| P3 | Particle arrays and GPU attributes are fully touched every frame, including when effects are inactive. | `visual-effects.js` | Defer uploads for idle systems if profiling indicates meaningful savings. | Confirm particles appear immediately on landing or collision. |
| P3 | CSS uses `backdrop-filter: blur(...)` over live rendering. | `game.css` | Profile compositor overhead on older Android devices before changing. | Compare paint/composite times. |

**Important:** These are investigation/optimization candidates, not validated bottlenecks. Geometry merging and resolution changes should preserve the current visual detail and motorcycle animation.

## Assets and memory

- World and vehicle meshes are procedurally generated; no external 3D model download or decoding cost exists.
- Race numbers are generated as 256×128 canvas textures, one per car number, reused across that vehicle's decals. Ten RGBA base-level textures would account for approximately 1.25 MiB **before** mipmaps and implementation overhead. An atlas is optional; draw-call reduction matters more.
- The player and opponent shadows reuse a tiny 64×64 radial alpha canvas texture.
- Pebbles, water decals, muddy patches and posts are instances; retaining those structures is preferable to premature refactoring.

## How to measure

Open the dedicated **[mobile benchmark](../benchmark.html)** on the device being evaluated. It executes deterministic, **rendering-focused** camera/vehicle passes without modifying game credit, scores or preferences. Version `gcv-render-v2` automatically performs **seven passes** (1.5 s warmup + 8 s measurement each):

1. Classic solo; classic race with nine AI cars; motorcycle solo (three baseline workloads).
2. The **same classic race** at 75% and 55% of its normal rendering pixel ratio.
3. Classic race at **100% again** on the same renderer, to detect warm-up/thermal/order drift.
4. Rainbow race at its existing capped pixel ratio (fourth baseline workload).

The final report has **three manually navigable screenshot pages**: (1) FPS and frame-tail stability, (2) main-thread JavaScript phase timings, (3) controlled resolution experiment, hardware and initialization. Take one screenshot per page or use **Copy JSON** for complete numerical data. The resolution sweep tests *the same* scene and camera at different framebuffer sizes; do not compare Classic and Rainbow as a controlled resolution experiment.

Measurements include:
- delivered FPS, frame-interval P50/P95/P99/max, and the fractions above 20, 33.34 and 50 ms;
- Three.js draw calls and triangles per rendered frame, and reported geometry/texture counts (not GPU bytes);
- JavaScript time around curve/path, AI synchronization, vehicle update, effects, camera, and `renderer.render()` submission; total JS work P95/P99 and mean;
- framebuffer dimensions, effective pixel ratio, viewport, browser/device information, test version and component-level initialization times.

**Interpretation:** `requestAnimationFrame` intervals include refresh-rate pacing and the whole browser frame. `performance.now()` around JavaScript stages measures elapsed main-thread time, **not hardware CPU utilization**; `renderer.render()` can contain GPU-driver waits and is **not a GPU timer**. The benchmark does not measure true GPU time, RAM/VRAM usage, thermal state, the full HUD/gameplay/physics loop, or browser compositor overhead. A Chrome performance trace or GPU profiler is required for deeper root-cause diagnosis.

For comparisons, repeat on each device with unchanged orientation, brightness, refresh-rate and power settings; keep the tab in the foreground. FPS near a display's 60 Hz cap cannot show additional headroom; inspect JS timings and the lower-resolution passes and, if still capped, run a heavier workload. Comparing `gcv-render-v1` and `v2` values directly is discouraged because added timing probes affect work slightly.

## Implementation sequence

1. Collect baseline mobile/tablet results with the benchmark (backlog `GCV10`).
2. Apply minimal low-risk changes (redundant HUD writes, finish-line instancing, transparency audit).
3. Re-measure; then target AI mesh batching, motorcycle geometry and common pixel-budget policy.
4. Consider renderer lifecycle or more complex dynamic quality only after identifying a measurable benefit.

See [ARCHITECTURE.md](ARCHITECTURE.md) for currently implemented behavior and [BACKLOG.md](BACKLOG.md) for open tasks. This report records source-review findings, not a change history.
