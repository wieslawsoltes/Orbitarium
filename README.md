# Orbitarium

**A playable, editable universe laboratory in plain HTML, JavaScript and WGSL.**

Orbitarium 0.1.0 is an original, clean-room gravity sandbox inspired by the category of software exemplified by Universe Sandbox. It is a running simulation and editor, not a screenshot mockup. The current release implements the core gravity-sandbox workflow; it does **not** claim feature-for-feature parity with Universe Sandbox. Its model boundaries are explicit below and in `docs/SCIENCE.md`.

There are no external runtime libraries, CDN requests, downloaded textures, tracking scripts, accounts, or cloud services. All 12 reusable packages are implemented in this repository. The browser application imports those packages rather than embedding separate copies of their algorithms.

## Run

Requires Node.js 20 or newer for the included development server. No installation or compilation is needed to open the app through that server:

```sh
cd Orbitarium
npm start
# Open http://localhost:4173
```

`orbitarium-standalone.html` contains the application, all modules, all WGSL kernels, the stylesheet, and the icon in a single file. It can also be served from any static host. A browser's handling of files, storage, and WebGPU varies with origin and security settings; localhost or HTTPS is the intended execution environment. Do not open the modular `index.html` directly through a `file:` URL.

For package development and numerical tests:

```sh
npm install --ignore-scripts --no-audit --no-fund
npm run check
npm test
npm run build
```

`npm run build` creates `dist/`, suitable for a static host, and regenerates the standalone HTML. Browser imports use an import map; there is no bundler or transpiler dependency. `node scripts/bootstrap.mjs` is an optional offline workspace-link and manifest generator.

## GitHub Pages

The Pages workflow validates, builds, and deploys on pushes to `main` and manual
workflow dispatch. The full static distribution and all twelve npm package
archives are intentionally tracked in Git for this complete delivery.

See [publishing instructions](docs/PUBLISHING.md) for the prepared Git bundle and
`node scripts/publish-github.mjs`, which pushes without force, enables Pages using
your local GitHub CLI login, and verifies the deployed commit. A workflow file or
this README does not by itself confirm that the repository has been published.

## The laboratory

Start with the Solar System: eight planets, the Moon, and 180 gravitationally simulated belt particles. Click a body to inspect and edit it. Change its mass or velocity and watch its trajectory respond. Add a moon in an automatically initialized Kepler orbit, drag-launch a comet, move a planet, duplicate an object, or explicitly fragment it into debris.

The inspector includes mass, radius, density, surface gravity, temperature, albedo, greenhouse offset, luminosity for stars, position, velocity, orbital elements, material fractions, color, rings, and rotation. Composition changes normalize remaining fractions; material-derived radius is a separate explicit operation. Display exaggeration is independent of actual collision radius.

The eight scenarios are **The Solar System**, **Two suns**, **Worlds collide**, **The ring laboratory** with 900 dynamic particles, **Three-body problem**, **Island universes** with two stylized stellar disks, **The visitor**, and **A blank universe**. These are initial conditions for real integration, not prerecorded animations.

The workspace includes a virtualized object explorer, searchable catalog, three inspector tabs, orbit and actual-trail overlays, decluttered labels, reference grid, illustrative habitable zones, velocity vectors, temperature visualization, exposure, a 3D camera, a two-point distance tool, diagnostics charts, an event log, command palette, keyboard controls, and responsive mobile drawers.

Playback supports pause, single-step, accuracy-limited time acceleration, reset, and up to 90 recorded snapshots. Scrubbing restores numerical state. Undo/redo restores edit snapshots, including their simulation time. Save/open uses local IndexedDB; JSON import/export works independently of that local library. Scene PNG and observation CSV exports are implemented.

## Engine packages

| Package | Responsibility |
| --- | --- |
| `@orbitarium/math` | Units, vectors, deterministic random numbers, Kepler states, osculating elements |
| `@orbitarium/core` | Validated bodies, dense Float64 structure-of-arrays storage, stable identities, events and edit history |
| `@orbitarium/gravity` | Symmetric direct forces, bounded-depth Barnes–Hut octree, kick–drift–kick integration, timestep limits and invariant diagnostics |
| `@orbitarium/collisions` | Swept broad/narrow phase, mergers, elastic sphere impacts and explicit fragmentation |
| `@orbitarium/thermal` | Lumped radiative equilibrium, time-dependent relaxation, mixture-density radius calculation |
| `@orbitarium/celestial` | Rounded body catalog, orbital initialization, belts and scenario factories |
| `@orbitarium/kernels` | Standalone WGSL source and loader: gravity, procedural celestial bodies, background |
| `@orbitarium/gpu` | Device acquisition, shader diagnostics, tiled N-body compute, buffer lifecycle and readback |
| `@orbitarium/renderer` | WebGPU instanced sphere impostors, Canvas fallback, camera, picking, trails and annotation overlays |
| `@orbitarium/ui` | DOM construction, icon library, virtualized lists, tabs, dialogs, notifications and command palette |
| `@orbitarium/persistence` | Validated project format, JSON serialization, browser downloads and IndexedDB library |
| `@orbitarium/simulation` | Integration/collision/thermal coordination, actual elapsed-time accounting, snapshots and telemetry |

Each has its own `package.json`, explicit dependencies, MIT license and README. Ready-to-install npm archives are provided in `release/packages/`; these packages have not been published to a public registry. To consume the packaged set in another project, install all the local archives together so sibling dependencies resolve locally:

```sh
npm install /path/to/Orbitarium/release/packages/*.tgz
```

### Use the engine without the UI

```js
import { createScenario } from '@orbitarium/celestial';
import { Simulation } from '@orbitarium/simulation';

const { store } = createScenario('binary');
const simulation = new Simulation(store);
simulation.backend = 'direct'; // Float64 reference path
simulation.events.subscribe(event => console.log(event.type, event.names));

for (let i = 0; i < 100; i++) {
  const actualDays = await simulation.advance(0.1);
  console.log(actualDays, simulation.time);
}
console.log(simulation.diagnostics());
```

`examples/headless.mjs` runs an impact to merger and exports the resulting project. `examples/projects/` contains importable initial states for all eight scenarios.

## Rendering and solver selection

WebGPU rendering is selected when initialization succeeds. Rendering and integration backends are independent: the default physics path remains Float64, choosing direct gravity up to 256 bodies and Barnes–Hut above that threshold. Explicit **WebGPU tiled compute** selection uses Float32 physics. The GPU kernel has 64-lane shared-memory tiles, two kick/drift passes per substep, ping-pong storage buffers and one CPU readback after each batch. Padded invocations participate in all workgroup barriers.

The CPU store remains authoritative for editing, persistence, thermal response and collisions. GPU readback validates all numerical results before committing them to the store. This is not a fully GPU-resident simulation; its limits and precision trade-offs are documented in `docs/ARCHITECTURE.md`.

If GPU initialization is unavailable, a Canvas 2D renderer uses the same 3D camera, real physics state, controls, picking and export paths. It is a functional alternative renderer, not a placeholder image. Its surface appearance differs from the WGSL path.

## Controls

| Action | Control |
| --- | --- |
| Pause/play; focus selected; frame system | Space; F; H |
| Select/orbit camera; move body; measure | V; M; R |
| Orbit; pan; zoom | Drag; right-drag or Shift-drag; wheel or pinch |
| Add; fragment; remove | A; X; Delete |
| Undo; redo | Ctrl/Cmd+Z; Ctrl/Cmd+Shift+Z |
| Save; open; command palette | Ctrl/Cmd+S; Ctrl/Cmd+O; Ctrl/Cmd+K |
| Focus workspace; cancel interaction | Tab outside inputs; Escape |

## Verification and boundaries

The delivered evidence records **32 passing numerical tests** and **37 passing browser interaction checks**. The browser run exercised the actual generated standalone application at desktop and mobile dimensions through Chromium's offline content API. It also caught and led to fixes for command-palette Enter behavior and label crowding. Tests additionally cover atomic invalid edits/fragmentation, energy and momentum invariants, complete swept elastic crossings, ring-particle timestep limits, JSON validation and an integrated planetary merger.

**WebGPU execution was not tested in the build environment.** That browser could not navigate to an eligible localhost/HTTPS origin and its offline test context exposed no WebGPU device. **IndexedDB round-tripping on a normal origin was also not tested there.** They are explicitly recorded as `not-run`, not passing tests. The supplied browser runner tests them when supported; `--require-gpu` makes GPU availability mandatory. No external CI or deployment has been executed as part of this delivery.

This release has a 4,096-body storage limit. It uses point-mass Newtonian gravity, sphere collisions and a lumped temperature model. It does not implement spatial climate/oceans, pressure-dependent phase thermodynamics, hydrodynamics/SPH impact deformation, general relativity, stellar evolution, VR, measured planetary surface maps, dated NASA ephemerides, or Universe Sandbox file compatibility. Decorative ring geometry is separate from the individually integrated ring-scenario particles. The galaxy preset is a stylized Newtonian toy system, not a cosmological model. Read `docs/SCIENCE.md` before interpreting output scientifically.

See `docs/TESTING.md` for exact commands, `docs/API.md` for package contracts, `docs/ARCHITECTURE.md` for data flow and resource layout, and `docs/REFERENCES.md` for external reference material.

MIT licensed. Universe Sandbox is referenced solely to describe the requested product category; no affiliation or proprietary engine compatibility is implied.
