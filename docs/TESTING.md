# Verification and reproduction

## Executed GitHub validation

The September 20, 2026 import ran remotely and passed **32 numerical tests and 38 real-origin Chromium interaction checks**. Evidence:

- `artifacts/github-import-numerical.tap`
- `artifacts/github-validation/browser-tests.json`
- `release/import-verification.json`
- https://github.com/wieslawsoltes/Orbitarium/actions/runs/35509271186

Browser checks cover pause/play/step, selection, mass and velocity editing, undo/redo, circularization, material editing, radius calculation, creation/duplication/deletion/fragmentation, solver settings, overlays, camera navigation, measurement, following, command execution, workspace focus, scenarios, JSON restore, timeline scrubbing, launch gestures, PNG generation, label layout, mobile UI and IndexedDB save/read/list/delete. They require zero uncaught browser or console errors.

**WebGPU execution was not run in the default headless browser**, which exposed no eligible adapter. No real-GPU throughput, physical touch-device, Safari/Firefox or full screen-reader validation is asserted. The GPU runner below explicitly fails rather than silently passing when an adapter is unavailable.

Original local logs under `artifacts/` record an earlier 37-check offline run and blocked normal-origin attempts. They are retained as historical evidence. Current captures under `artifacts/github-validation/` were produced by the real running application. Legacy PNG aliases were refreshed; see `artifacts/SCREENSHOT-PROVENANCE.md`. Screenshot FPS counters are observations, not benchmarks.

## Numerical tests

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm test
```

Tests cover storage validation/identity, force symmetry, orbital energy, reversibility, Barnes–Hut agreement, coincident-point termination, merger/fragmentation invariants, swept elastic crossings, thermal response, scenarios, atomic invalid operations, timestep limits, project validation, history and an integrated impact. The direct Float64 solver is the explicit approximation reference; tolerances are visible in `tests/physics.test.mjs`.

## Real-origin browser tests

Start the application with `npm start`. In another terminal:

```sh
python -m pip install -r tests/requirements.txt
python -m playwright install chromium
python tests/browser_smoke.py --artifacts artifacts/local-validation
```

The default URL is `http://127.0.0.1:4173`. Use `--url` for another deployment and `--chromium /path/to/chromium` for an existing executable. A distinct artifacts directory preserves previous evidence. The script exercises GPU paths whenever the initialized solver is available and tests IndexedDB on the real origin.

## Required WebGPU validation

```sh
python tests/browser_smoke.py --require-gpu --artifacts artifacts/gpu-validation
```

This mode requests unsafe WebGPU/software ANGLE flags for a headless test environment; those flags are not a recommendation for end users. It fails without a usable adapter. GPU checks include shader/pipeline initialization and three-substep comparisons at body counts 1, 2, 65 and 190, including padded workgroups. Float32 results are compared with the direct Float64 solver using explicit finite-error tolerances, not bitwise equality.

## Restricted offline reproduction

```sh
npm run build
python tests/browser_smoke.py --offline --artifacts artifacts/offline-validation
```

Offline mode uses the generated standalone HTML with the GPU process disabled. It cannot validate HTTP paths, IndexedDB on a normal origin or WebGPU; reports mark unavailable checks as not-run.

## CI and Pages

`.github/workflows/ci.yml` runs numerical, syntax, build, Pages-path and real-origin browser checks on pushes, pull requests and manual dispatch. It uploads fresh evidence even after failure. `.github/workflows/pages.yml` deploys only `main`, checks its live revision marker and fetches essential modules and shaders. See [PUBLISHING](PUBLISHING.md).

## Performance boundaries

Measure direct/tree crossover, octree allocation, snapshot memory, invariant sampling, GPU readback and Canvas rendering independently. The frame budget is checked between CPU substeps, not enforced through preemption. Do not extrapolate the 900-particle scenario to millions of bodies. High-dynamic-range Float32 encounters require Float64 reference runs and timestep-convergence studies.
