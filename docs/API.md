# Public package contracts

Every package is an ES module with exports from `src/index.js`. Each package README names its principal exports. All lengths are AU, masses nominal solar masses, velocities AU/day, time days and temperatures kelvin unless explicitly named otherwise. UI conversion to km, km/s and Earth masses occurs at the boundary.

## `BodyStore`

`new BodyStore(capacity = 32)` allocates dense arrays, with a maximum of 4,096 bodies. `add(body)` validates and returns a stable ID. Explicit positive IDs are accepted if unique; `id: 0` requests allocation. `update(id, patch)` validates a complete merged body before mutation. `remove(id)` swap-removes a dense slot while retaining all other identities. `body(id)` returns a detached copy or null; `at(index)` is an indexed copy; `index(id)` returns a dense slot or -1. `toJSON()` returns body data, and `BodyStore.fromJSON(array)` validates and constructs a candidate store.

A body has `id`, `name`, `kind`, `color`, `mass`, `radius`, `position[3]`, `velocity[3]`, `temperature`, `luminosity`, `albedo`, `greenhouse`, `heatCapacity`, `thermalDays`, `spin`, `rings`, `visible`, `tracer`, `composition` and `seed`. Defaults are centralized in `validateBody`. Composition has iron/rock/water/hydrogen fractions and is normalized after validation. Body data does not contain a rendering-space coordinate or screen radius.

The public numerical arrays are intended for exclusive solver access. Arbitrary direct array mutation bypasses validation; prefer `update` for user input. References to dense array slots must not be retained across add/remove/reserve operations.

## Gravity and integration

`directAcceleration(store, out = store.acceleration, g = G, epsilon = 1e-7)` computes symmetric exact pairwise acceleration. `new BarnesHutTree(store).acceleration(out, g, epsilon, theta)` builds/traverses the approximation. `new CPUSolver({mode, theta})` supports `auto`, `direct` and `tree`; `step(store, dt, g, epsilon)` updates state synchronously. Negative dt is supported by the low-level solver for controlled numerical reversibility tests, not by application playback.

`stableStep(store, g, maxStep, epsilon)` supplies the heuristic step bound. `invariants(store, g, epsilon)` returns mass, kinetic energy, potential energy, total mechanical energy, linear momentum, orbital angular momentum and barycenter. It is an O(N²) diagnostic and is not intended to run on every frame for large systems.

## Simulation

`new Simulation(store)` composes the engines. `backend` can be `auto`, `direct`, `tree` or `gpu`. Assign an initialized `GPUGravity` instance to `simulation.gpu` before choosing `gpu`. `settings` includes `gravity`, `softening`, `collisions`, `thermal`, `maxStep`, `maxSubsteps` and `theta`. Validate external settings using `validateProject`; they are not arbitrary executable configuration.

`await simulation.advance(requestedDays)` returns the actual number of simulated days. Nonfinite input rejects, nonpositive input is a no-op, and reentrant advances are no-ops. `last` reports backend, number of steps, advanced days, capped status and wall-clock milliseconds. `snapshot()` produces a versioned physical project; `restore(project)` validates before replacing state. `resetBaseline()` starts a new mechanical energy reference; `diagnostics()` adds relative energy change to invariants.

`events.subscribe(callback)` returns an unsubscribe function. Collision events contain type, names, position, radius, time and survivor/removed identities where applicable. `explode(id, options)` is an explicit state-changing operation and returns newly created fragment IDs. Hosts are responsible for serializing edits with pending `advance` calls, as the application does.

## GPU

`await createGPUDevice()` returns a device/adapter pair or an unavailable reason. `checkedModule(device, source, label)` creates a shader module and rejects reported compilation errors. `await new GPUGravity(device).init()` creates compute pipelines; `available` reports readiness. `await gravity.step(store, dt, steps, g, epsilon)` executes and reads back a batch. It does not run collisions or thermal response; `Simulation` supplies that coordination. Do not issue concurrent batches on one instance. `destroy()` releases owned buffers and marks the solver unavailable; the caller owns the GPUDevice.

`@orbitarium/kernels` exports `kernelURL(name)` and `loadKernel(name)` for names `gravity`, `bodies` and `background`. The package also exports raw `.wgsl` assets. Shader record offsets are documented in ARCHITECTURE.md.

## Rendering and UI

`new UniverseRenderer(baseCanvas, overlayCanvas, {device})` owns display resources but not physical state. `await renderer.init()` chooses GPU or Canvas rendering. `renderer.render(store, time, selectedId)` draws the committed state. Set `renderer.gravity` to the current gravity multiplier for analytical orbit overlays. `options` controls overlays and visual scale. `camera` owns target, span, yaw, pitch, follow ID and coordinate conversions. `pick(x,y)` takes CSS-pixel coordinates relative to the overlay canvas and returns a body copy or null.

`focus(body, {close})`, `reset()`, `burst(event)`, `screenshot()` and `destroy()` manage visualization. `screenshot()` returns a PNG Blob. Camera state uses `toJSON()` and `restore()`. Physics remains independent of camera scale.

The UI package exports `el`, `$`, `$$`, `icon`, `hydrateIcons`, `number`, `toast`, `openDialog`, `bindTabs`, `VirtualList` and `CommandPalette`. `VirtualList` receives a DOM container and `{rowHeight, renderRow, onSelect}`, then `setItems(items, selectedId)`. Dispose it through `destroy()` when its host is removed. Render metadata with textContent or `el(..., {text})`, not untrusted HTML.

## Persistence

`validateProject(project)` returns a cleaned version-1 project or throws. `parseProject(text)` applies parsing and validation; `stringifyProject(project)` validates and serializes. `ProjectLibrary` exposes asynchronous `open`, `save(project,id)`, `get(id)`, `list`, `remove(id)`, and synchronous `close`. It requires IndexedDB access in the hosting context. `downloadBlob` requests a browser download; browser policies remain authoritative.

## App-level integration

After initialization, `window.orbitarium` exposes read access to simulation, renderer, selected ID, paused state, observations, records, ready state and rendered frame count. It also exposes `loadScenario`, `select`, `openAdd`, `exportProject`, `importProject`, `edit`, `undo`, `redo`, `saveProject`, `library`, `pause` and `step`. This is the supported browser-test/embedding surface. Hosts should use these transaction-aware operations instead of racing arbitrary changes against the frame loop.
