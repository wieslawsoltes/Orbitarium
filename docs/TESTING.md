# Verification and reproduction

## Delivered result

`artifacts/node-tests.txt` records **32 passing Node tests**. They exercise storage validation/identity, pairwise force symmetry, a fixed-step orbital energy test, reversibility, Barnes–Hut agreement, coincident-point termination, merger/fragmentation invariants, swept elastic crossings, thermal response, scenario validity, atomic invalid operations, timestep limits, project validation, history and the actual integrated impact scenario.

`artifacts/browser-tests.json` records **37 passing browser checks** against the generated standalone HTML. Tested controls include pause/play/step, search/selection, mass and velocity editing, keyboard undo/redo, orbit circularization, material editing, radius derivation, object creation/duplication/deletion/fragmentation, solver settings, overlays, camera navigation, measurement, following, command execution, workspace focus, scenario loading, JSON restore, timeline scrubbing, drag-launch, PNG generation, label layout, and mobile drawers/dialog bounds. The run requires zero uncaught browser or console errors.

The delivered browser evidence used Chromium in a restricted environment with offline `page.set_content`, the CPU/Canvas path and no eligible origin-based storage. **Two checks are explicitly `not-run`: WebGPU execution and IndexedDB round-trip on an eligible origin.** No shader-compilation, real-GPU throughput, physical touch device, Safari/Firefox, or full screen-reader validation is asserted. The supplied GitHub workflows have not been executed remotely as part of this delivery.

Screenshots in `artifacts/` are captured from the running app, not generated concept illustrations. Device FPS counters in screenshots are observations of that environment, not published benchmarks.

## Numerical tests

```sh
npm install --ignore-scripts --no-audit --no-fund
npm run check
npm test
```

No third-party numerical test framework or reference solver is required. The direct Float64 implementation is the explicit approximation reference for Barnes–Hut tests. Assertions and tolerances are visible in `tests/physics.test.mjs`.

## Real-origin browser tests

In one terminal:

```sh
npm start
```

In another:

```sh
python -m pip install -r tests/requirements.txt
python -m playwright install chromium
python tests/browser_smoke.py
```

The default URL is `http://127.0.0.1:4173`. `--url` selects another deployment. `--chromium /path/to/chromium` selects an existing browser executable. The script tests GPU paths whenever an initialized GPU solver is available, then performs IndexedDB CRUD on the real origin.

To make WebGPU availability mandatory:

```sh
python tests/browser_smoke.py --require-gpu
```

That mode requests unsafe WebGPU/software ANGLE flags for an automated headless environment. It is a test configuration, not a requirement or recommendation for end users. A driver/browser configuration that cannot supply an adapter will fail the test rather than report a GPU pass. GPU checks include shader/pipeline initialization and comparison of three integrated substeps at counts 1, 2, 65 and 190, including non-multiple-of-64 workgroups. These compare Float32 output with direct Float64 results using explicit finite-error tolerances, not bitwise equality.

## Restricted offline reproduction

```sh
npm run build
python tests/browser_smoke.py --offline --chromium /usr/bin/chromium
```

This loads the standalone file contents into an offline browser document and deliberately disables the GPU process. It is the mode used for the delivered evidence. It cannot validate origin-dependent capabilities; the report makes that distinction machine-readable.

## CI and deployment

`.github/workflows/ci.yml` installs local workspace dependencies, syntax-checks, runs numerical tests, builds the application, starts a static test origin, and runs the browser checks. Test screenshots and reports upload even on failure. `.github/workflows/pages.yml` validates, builds, and deploys on pushes to `main` or manual dispatch. It requires Pages configured to use GitHub Actions. `scripts/publish-github.mjs` performs that setup using the operator's local GitHub CLI login and verifies the published commit marker. The source package alone does not enable Pages or establish a live deployment; see `docs/PUBLISHING.md`.

## Performance work still worth measuring

Measure CPU direct/tree crossover, octree allocation cost, full snapshot memory, exact invariant sampling cost, GPU readback latency and Canvas fallbacks separately. The current frame budget is checked between CPU substeps, not enforced through preemption. Avoid extrapolating the 900-particle demo to millions of bodies. The Float32 GPU solver is batched but not GPU-resident end-to-end. High dynamic-range encounters require Float64 reference runs and explicit timestep convergence studies.
