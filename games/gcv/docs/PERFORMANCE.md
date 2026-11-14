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
| Addressed (validate on device) | Classic DPR cap **1.7** and open-track DPR cap **1.15** / **750,000 pixels** remain as maximum quality. | `rendering.js`, `adaptive-resolution.js`, `game.js` | Adaptive multiplier **1.0–0.55** now adjusts the active game's internal resolution based on sustained frame pacing, with hysteresis and a guarded quality-recovery probe. No game-state changes. | Re-run on phone/tablet, both orientations and fullscreen; check actual framebuffer dimensions, sharpness, FPS, and repeated viewport/menu transitions. |
| Addressed (validate on device) | HUD values were assigned every frame; chrono was refreshed in both `updateCar()` and the outer frame. | `game.js`, `hud.js` | The regular frame now refreshes the chrono only once, and the HUD skips identical text, class, visibility and attribute writes without throttling the visible timer. | Verify timer, hold and ranking display across game modes; profile DOM/compositor before/after. |
| Addressed (validate on device) | Each timing line previously created 24 separate tile meshes; the open track has two lines (48). | `world-3d.js` | One shared box geometry and two instanced meshes per line (12 tiles per color): 2 submitted meshes on classic, 4 on the open route. | Verify both start/finish colors, geometry and placement; re-run identical benchmark passes for draw-call and frame-time comparisons. |
| Addressed (validate on device) | The motorcycle's two wheels previously had 15 separate mesh objects each. | `vehicles.js` | Rims (two instances) and spokes (ten instances) now use one draw each per wheel, alongside tyre, hub and brake: **15 → 5 draws/wheel** when visible, five geometries shared across both wheels. | Verify wheel appearance/spin in both camera views; compare moto scenario draw calls and P95 at matched resolution. |
| Addressed (validate on device) | Flat transparent mud/puddles and shadows used `DoubleSide`, and each AI shadow was its own transparent mesh. | `world-3d.js`, `rendering.js`, `vehicles.js` | Upward-facing mud, water, reflection and shadow planes use `FrontSide`; the motorcycle's two-sided translucent windscreen uses `forceSinglePass`. Opponent shadows use a single moving `InstancedMesh` (nine instances); the player shadow remains independent for jump opacity. | Check road decals, reflections, moving AI shadows, jumping fade, cockpit windscreen on real devices. Compare race draw calls at equal resolution. |
| P2 | Two animated brake `PointLight` objects are present even though emissive brake meshes exist. | `vehicles.js` | Try emissive/cheap glow only; profile impact before removing lights. | Compare night/day appearance and GPU frame time. |
| P3 | Changing circuits tears down and recreates the renderer, vehicle geometry, scene, shaders and textures. | `game.js`, `rendering.js` | Consider a persistent renderer with scene-scoped disposal after profiling initialization time and context reliability. | Test repeated circuit switching and Android memory stability. |
| P3 | Opponent synchronization searches entries and evaluates curve points/tangents per AI each frame. | `rendering.js` | Consider indexing AI by id and/or interpolating precalculated track samples. | Check CPU profile and avoid motion discontinuity. |
| P3 | Particle arrays and GPU attributes are fully touched every frame, including when effects are inactive. | `visual-effects.js` | Defer uploads for idle systems if profiling indicates meaningful savings. | Confirm particles appear immediately on landing or collision. |
| P3 | CSS uses `backdrop-filter: blur(...)` over live rendering. | `game.css` | Profile compositor overhead on older Android devices before changing. | Compare paint/composite times. |

**Important:** These are investigation/optimization candidates, not validated bottlenecks. Geometry merging and resolution changes should preserve the current visual detail and motorcycle animation.

## Assets and memory

- World and vehicle meshes are procedurally generated; no external 3D model download or decoding cost exists.
- Race numbers are generated as 256×128 canvas textures, one per car number, reused across that vehicle's decals. Ten RGBA base-level textures would account for approximately 1.25 MiB **before** mipmaps and implementation overhead. An atlas is optional; draw-call reduction matters more.
- The player and opponent shadows reuse a tiny 64×64 radial alpha canvas texture. A standalone fading player plane and a single instanced opponent batch share the plane geometry; both materials are front-facing.
- Pebbles, water decals, muddy patches and posts are instances; retaining those structures is preferable to premature refactoring.

## Current rendering strategy

- Transparent decals parallel to the road and their procedural alpha shadows are rendered front-facing only, to avoid a redundant second transparency pass. The bike windshield is still visible from both sides but rendered with a single transparent draw pass.
- The nine AI shadows are transformed into a single instanced mesh per active race. The number of visible shadow instances follows the active opponents and is zero in free mode; culling of the moving batch is disabled so its stale initial bounds do not hide shadows. The player shadow remains separate for individual in-flight opacity.
- The motorcycle wheels share rigid geometries and use instances for five spokes on either side and two rim rings per wheel. This preserves wheel rotation, brake ring, hub and open spoke silhouette.

**These are expected draw-call reductions, not measured FPS gains.** Compare the benchmark's original and updated motorcycle/race draw counts only with the same viewport, orientation, circuit, resolution scale and device. Since past captures may use different framebuffer dimensions or Three.js resource states, absolute draw counts can vary with camera visibility.

## How to measure

Open the dedicated **[mobile benchmark](../benchmark.html)** on the device being evaluated. It executes deterministic, **rendering-focused** camera/vehicle passes without modifying game credit, scores or preferences. Version `gcv-render-v4` automatically performs **seven passes** (1.5 s warmup + 8 s measurement each):

1. Classic solo; classic race with nine AI cars; motorcycle solo (three baseline workloads).
2. The **same classic race** at 75% and 55% of its normal rendering pixel ratio.
3. Classic race at **100% again** on the same renderer, to detect warm-up/thermal/order drift.
4. Rainbow race at its existing capped pixel ratio (fourth baseline workload).

The test **requests fullscreen from the initial Start tap** for a more repeatable screen area. Since mobile browsers may deny or lack the Fullscreen API, an explicit **Sans plein écran** option remains available; the report and JSON record the **actual display mode**, orientation, viewport and DPR. Exiting fullscreen during a run invalidates the measurements. Fullscreen is recommended but does not standardize pixel counts across devices: always compare the reported framebuffer sizes. The final report has **three manually navigable screenshot pages**: (1) FPS and frame-tail stability, (2) main-thread JavaScript phase timings, (3) controlled resolution experiment, hardware and initialization. Take one screenshot per page or use **Copy JSON** for complete numerical data. The resolution sweep tests *the same* scene and camera at different framebuffer sizes; do not compare Classic and Rainbow as a controlled resolution experiment.

Measurements include:
- delivered FPS, frame-interval P50/P95/P99/max, and the fractions above 20, 33.34 and 50 ms;
- Three.js draw calls and triangles per rendered frame, and reported geometry/texture counts (not GPU bytes);
- JavaScript time around curve/path, AI synchronization, vehicle update, effects, camera, and `renderer.render()` submission; total JS work P95/P99 and mean;
- framebuffer dimensions, effective pixel ratio, viewport, browser/device information, test version and component-level initialization times.

**Interpretation:** `requestAnimationFrame` intervals include refresh-rate pacing and the whole browser frame. `performance.now()` around JavaScript stages measures elapsed main-thread time, **not hardware CPU utilization**; `renderer.render()` can contain GPU-driver waits and is **not a GPU timer**. The benchmark does not measure true GPU time, RAM/VRAM usage, thermal state, the full HUD/gameplay/physics loop, or browser compositor overhead. A Chrome performance trace or GPU profiler is required for deeper root-cause diagnosis.

For comparisons, repeat on each device with unchanged orientation, brightness, refresh-rate and power settings; keep the tab in the foreground. FPS near a display's 60 Hz cap cannot show additional headroom; inspect JS timings and the lower-resolution passes and, if still capped, run a heavier workload. Comparing benchmark versions `v1`–`v4` without controlling rendering resolution and display mode is discouraged: v2 added timing probes, v3 recommends fullscreen, and v4 changes 3D geometry/draw-call batching.


## Real-device baseline — Android 14 tablet (2026-11-14, v2, windowed)

Observed directly from the supplied portrait and landscape screenshots. These are **field measurements**, not an independently captured browser trace.

| Same classic-race scene | Portrait (800×1112 CSS px) | Landscape (1280×632 CSS px) |
| --- | --- | --- |
| 100% rendering resolution | 33.5 FPS, 800×1112 framebuffer | 35.6 FPS, 1280×632 framebuffer |
| 75% resolution | 48.3 FPS, 600×834 framebuffer | 49.8 FPS, 960×474 framebuffer |
| 55% resolution | 60.3 FPS, 440×611 framebuffer | 60.4 FPS, 704×347 framebuffer |
| 100% repeat | 33.3 FPS (−0.6% vs first pass) | 35.5 FPS (−0.4% vs first pass) |

Reference scenario FPS: portrait 33.9 classic solo / 33.5 classic race / 54.3 motorcycle / 47.7 rainbow; landscape 36.2 / 35.6 / 58.1 / 47.3 respectively. JavaScript wall-clock averages for the classic race were approximately **6.95 ms** portrait and **6.63 ms** landscape, dominated by the `renderer.render()` call (6.22 / 5.99 ms). These numbers **do not directly measure GPU execution time**.

**Interpretation:** Resolution scaling has a much larger impact than the extra 72 draw calls between classic solo and classic race on this tablet. This strongly supports investigating pixel-related / WebGL work before prioritizing vehicle mesh consolidation. The 55% run is at the roughly 60 FPS browser cap, not proof of unused headroom. Fullscreen runs are a separate baseline and should not be directly compared with the windowed numbers unless framebuffer sizes match.

## Implemented — adaptive resolution (2026-11-14)

The active GCV game now lowers the WebGL framebuffer pixel ratio, without changing UI element sizes or simulation timing, if rendered-frame intervals indicate sustained slow performance. Scale levels: 100%, 90%, 80%, 70%, 60% and 55% of the circuit's existing DPR ceiling. Resolution reductions react to persistently sub-56 FPS or quickly to especially slow samples; restoring quality requires approximately 18 seconds of stable near-60 FPS data and a probation period. An unsuccessful quality increase is reverted and the next attempt is delayed. Sampling occurs only after **actual active game WebGL frames**, excluding menus, score iframe, background/resume and viewport changes.

The adaptive module does **not** change physics, collisions, save revisions, race results, touch controls or the independent benchmark. It is device-responsive and not persisted between sessions or circuit rebuilds. The current benchmark remains a fixed-resolution measurement tool for controlled comparisons; it does not activate automatic adjustment.

The observed v2 tablet comparison (33–36 FPS full resolution vs ~60 FPS at 55% scale) motivated the policy. **These are not post-optimization results**. Validate the actual game on both devices in portrait and landscape (ideally fullscreen), with quality changes and occasional camera/menu transitions, before concluding the improvement is sufficient.

## Implemented — batched timing lines and HUD changes (2026-11-14)

Two conservative improvements now apply to the normal game and benchmark without changing gameplay rules:

- **Start/finish line batching** (`world-3d.js`): each 24-tile checkerboard or colored start line uses two `THREE.InstancedMesh` draws instead of 24 independent meshes. Both colors, exact 24 tile placements, orientation, height and size are retained. Classic timing line: **24 → 2** scene objects; open route start + finish lines: **48 → 4**. Frustum culling means these are theoretical *maximum visible* draw-call reductions (22 classic / 44 open), not a verified per-frame GPU reduction. Browser benchmarking remains necessary.
- **HUD change detection** (`hud.js`, `game.js`): text, class, visibility and attribute updates now occur only if their displayed values differ. The regular frame removes the second chrono refresh, while session transitions retain immediate refresh paths. Race start/countdown/lap hold/final results should still update normally. There is **no timing throttling** that would reduce displayed stopwatch accuracy.

Regression tests verify tile count/color/locations and HUD updates during countdown, best laps, delta/hold and finished race. Neither change affects save format, the physics loop, camera, controls or the adaptive-resolution policy.

## Implementation sequence

1. Collect baseline mobile/tablet results with the benchmark (backlog `GCV10`).
2. Validate the implemented HUD write reduction and timing-line instancing on device; audit transparent materials separately.
3. Re-measure; then target AI mesh batching, motorcycle geometry and common pixel-budget policy.
4. Consider renderer lifecycle or more complex dynamic quality only after identifying a measurable benefit.

See [ARCHITECTURE.md](ARCHITECTURE.md) for currently implemented behavior and [BACKLOG.md](BACKLOG.md) for open tasks. This report records source-review findings, not a change history.
