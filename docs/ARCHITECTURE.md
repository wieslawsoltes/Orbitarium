# Orbitarium architecture

## Ownership and dependency direction

The DOM is not the simulation database. `BodyStore` owns authoritative arrays, while stable positive IDs bind selections, history, metadata and GPU-packed slots. Storage uses Float64 arrays for XYZ positions, velocities, accelerations, masses, collision radii and temperatures. Dense slots can change on deletion; public identities do not. `body(id)` and `at(index)` return copies rather than exposing mutable metadata. Numerical packages use array views to avoid copies in their inner loops.

The dependency graph is acyclic. Math and WGSL kernels form the bottom layer. Core depends on math; gravity and thermal operate on a structural store interface. Collision and celestial packages use core and math. Persistence validates through core. Simulation composes gravity, collisions, thermal and project validation. The renderer consumes math, kernels and GPU helpers. The UI package has no astronomy dependencies. `app/main.js` is the composition root.

## Frame and mutation protocol

Each animation frame draws the most recently committed state. When no integration batch is running, the app captures due diagnostics/history snapshots and starts the next advance. Only one advance can run at a time. Requested time is wall time multiplied by the user-selected rate; the returned time is the time actually integrated. Accuracy-limited simulation never silently jumps to the requested clock value.

An edit pauses scheduling, waits for an existing batch, records a complete pre-edit snapshot, applies validated changes, records the post-edit snapshot, resets trajectory/diagnostic references and resumes the previous playback state. Failed edits restore their pre-edit project. Imports validate before replacing the live store. Undo/redo is intentionally an edit-snapshot system, not reverse integration.

`Simulation.advance` also has a reentrancy guard. Low-level solver methods assume exclusive ownership while running. The synchronous CPU path checks a 12 ms soft budget between substeps; a single expensive substep can exceed that budget. It is not a hard real-time scheduler or worker-isolated physics engine.

## CPU numerical paths

Direct forces visit each unordered pair once and apply opposite mass-weighted acceleration contributions. This is the precision reference and preserves pairwise linear momentum up to roundoff. Barnes–Hut builds a bucket octree with explicit maximum depth, handles coincident positions, avoids approximating the node containing the target body, and uses a selectable opening angle. Its approximate forces are not pairwise symmetric.

Both use kick–drift–kick/velocity-Verlet integration. The timestep limiter considers major-major and tracer-major distances, relative crossing times and pair dynamical times. Tracer-tracer encounters do not constrain the timestep. Tracers still contribute gravity, but tracer-tracer collisions are skipped. A storage-level tracer is therefore a rendering/collision/accuracy class, not a massless particle.

## WebGPU compute resource contract

`gravity.wgsl` declares an array of 32-byte records:

| Offset | Type | Meaning |
| --- | --- | --- |
| 0 | vec4f | XYZ position, solar mass |
| 16 | vec4f | XYZ velocity, physical radius |

A separate 16-byte uniform block contains `count: u32`, `dt: f32`, `g: f32`, and `epsilon2: f32`. The host writes it through little-endian DataView fields. Storage capacity grows in powers of two. Array bounds use the active count, not capacity.

Each workgroup has 64 invocations and a 64-element vec4f shared tile. Each invocation loads one source body, all lanes synchronize, every target accumulates its acceleration from the tile, and all lanes synchronize before reusing shared memory. Out-of-range destination lanes never write results but still execute every barrier. There are no atomics or unordered global force reductions.

The first pass reads A, applies the first half kick and full drift, and writes B. The second reads B, applies the last half kick, and writes A. A batch may encode several pairs of passes. Only final A is copied to a staging buffer. The host maps that buffer once, validates every returned position/velocity for finiteness, commits all results and unmaps in a `finally` block. Simultaneous readback calls are rejected.

Finite Float32 values are not necessarily accurate values: large world offsets can erase small separations. The default Float64 path exists precisely for this dynamic-range trade-off. No claim of bitwise CPU/GPU or cross-driver reproducibility is made.

Collision and thermal processing occur after every CPU substep, but only at the boundary of an entire GPU batch. Swept segments reduce endpoint tunneling but do not reconstruct curved substep trajectories. Set small maximum steps and few substeps for impact-focused experiments; use the Float64 path for reference comparisons.

## Rendering

The renderer uses an orthographic 3D camera, not a 2D physical model. The simulation remains fully three-dimensional. GPU rendering projects sphere centers on the CPU and issues one instanced billboard draw after a fullscreen procedural background draw. Each 80-byte body record consists of five vec4f fields: screen geometry, color/kind, lighting/temperature, seed/rings/spin/selection, and surface-rotation/view options.

WGSL reconstructs a visible sphere normal analytically from billboard coordinates. Procedural noise produces rocky surfaces, stylized terrestrial terrain/clouds, banded gas giants, stellar granulation/glow, rings and illustrative accretion disks. These are sphere impostors, not tessellated displacement meshes. Projected depth ordering is approximate for overlapping large spheres and translucent rings.

A transparent Canvas overlay draws measured trajectories, osculating orbit curves, vectors, labels, interaction feedback and scale/axis annotations. Labels use a selected-first, mass-prioritized greedy placement that avoids body silhouettes and previously placed labels. Ring-preset particles are real bodies; a planet's decorative ring flag does not create mass.

Canvas fallback uses the same projection and selection infrastructure with simpler procedural shading. Exposure is composited once across the final image rather than applying costly per-primitive software filters. PNG export composites the celestial and overlay canvases at their physical backing dimensions.

## UI and persistence

The explorer is a fixed-row-height virtual list with overscan and keyboard selection. Dialogs use native modal semantics, tabs support keyboard arrows, and transient messages use an aria-live region. Controls that edit numerical state enter the shared transaction path. Layout adapts to mobile through explorer/inspector drawers. A full assistive-technology/device audit has not been performed.

Project JSON schema version 1 stores explicit AU/day/solar units, all bodies, simulation time/settings, camera and UI metadata. Import rejects unsupported units, duplicate identities, nonfinite state, invalid fractions and out-of-range settings. The file picker enforces 20 MB in bytes; the string parser separately bounds string length. Local IndexedDB stores named projects and an autosave entry. Storage failure does not disable JSON import/export.

History is capped at 90 complete snapshots; edit history at 24 transactions; observations at 1,200 samples; trails at 420 samples per major body. These are bounded but not compressed histories. At 4,096 bodies, full snapshots and exact O(N²) diagnostics can be significant; measured performance should guide higher-scale optimizations.

## Build and distribution

The modular application uses standard ES modules with an import map. The zero-dependency build script copies static assets and constructs a second distribution with modules encoded as data-URL imports, shader strings embedded in a kernel module, and inline HTML/CSS. No service worker or remote resource is required. A static source tree, standalone HTML, package archives, numerical tests and browser test runner are all supplied.
