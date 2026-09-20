import test from 'node:test';
import assert from 'node:assert/strict';
import { G, EARTH_MASS, AU_KM, TAU, keplerState, orbitalElements, seededRandom } from '@orbitarium/math';
import { BodyStore, CommandHistory } from '@orbitarium/core';
import { directAcceleration, BarnesHutTree, CPUSolver, invariants, stableStep } from '@orbitarium/gravity';
import { mergeBodies, fragmentBody, sweptHit, CollisionEngine } from '@orbitarium/collisions';
import { equilibriumTemperature, materialRadius, ThermalEngine } from '@orbitarium/thermal';
import { createScenario, getTemplate, addOrbit } from '@orbitarium/celestial';
import { parseProject, validateProject, stringifyProject } from '@orbitarium/persistence';
import { Simulation } from '@orbitarium/simulation';
const close = (a, b, tol = 1e-10) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} ± ${tol}`);
const twoBody = () => { const s = new BodyStore(); s.add({ ...getTemplate('sun'), position: [0, 0, 0], velocity: [0, 0, 0] }); const b = getTemplate('earth'); addOrbit(s, b, 1, { radius: 1 }); return s; };
test('dense SoA grows, preserves stable identity, and swap-removes', () => { const s = new BodyStore(1); const a = s.add({ name: 'a' }), b = s.add({ name: 'b', position: [1, 2, 3] }), c = s.add({ name: 'c', position: [4, 5, 6] }); assert.equal(s.capacity, 4); s.remove(b); assert.equal(s.count, 2); assert.equal(s.index(c), 1); assert.deepEqual(s.body(c).position, [4, 5, 6]); assert.equal(s.index(a), 0); });
test('updates are validated before mutating state', () => { const s = twoBody(); const old = s.body(2); assert.throws(() => s.update(2, { mass: NaN })); assert.deepEqual(s.body(2), old); assert.throws(() => s.add({ ...old })); });
test('rejects malformed positions, invalid material fractions, and infinite radii', () => { const s = new BodyStore(); assert.throws(() => s.add({ position: [1, 2] })); assert.throws(() => s.add({ radius: Infinity })); assert.throws(() => s.add({ composition: { iron: -1 } })); });
test('Kepler initial state reconstructs specified a, e and inclination', () => { const p = keplerState({ a: 2.5, e: .36, inclination: .23, anomaly: .85, node: .4 }); const e = orbitalElements(p.position, p.velocity, G); close(e.semiMajor, 2.5); close(e.eccentricity, .36); close(e.inclination, .23 * 180 / Math.PI); });
test('direct gravitational force obeys Newton third law', () => { const s = twoBody(); directAcceleration(s); for (let k = 0; k < 3; k++)
    close(s.acceleration[k] * s.mass[0] + s.acceleration[k + 3] * s.mass[1], 0, 1e-20); });
test('direct acceleration includes softening and does not self-accelerate', () => { const s = new BodyStore(); s.add({ mass: 1 }); directAcceleration(s); assert.deepEqual(Array.from(s.acceleration.slice(0, 3)), [0, 0, 0]); s.add({ mass: 1 }); directAcceleration(s); assert.ok(Array.from(s.acceleration).every(Number.isFinite)); });
test('leapfrog conserves mechanical energy over one circular orbital period', () => { const s = twoBody(), solver = new CPUSolver({ mode: 'direct' }), start = invariants(s), period = TAU / Math.sqrt(G * (1 + EARTH_MASS)), steps = 6000; for (let i = 0; i < steps; i++)
    solver.step(s, period / steps); const end = invariants(s); assert.ok(Math.abs((end.energy - start.energy) / start.energy) < 1e-9); assert.ok(Math.abs(s.position[3] - 1) < .0001); for (let k = 0; k < 3; k++)
    close(end.momentum[k], start.momentum[k], 1e-16); });
test('leapfrog is reversible without dissipative interactions', () => { const s = twoBody(), before = s.toJSON(), solver = new CPUSolver(); for (let i = 0; i < 100; i++)
    solver.step(s, .1); for (let i = 0; i < 100; i++)
    solver.step(s, -.1); for (let i = 0; i < 2; i++)
    for (let k = 0; k < 3; k++) {
        close(s.position[i * 3 + k], before[i].position[k], 1e-12);
        close(s.velocity[i * 3 + k], before[i].velocity[k], 1e-12);
    } });
test('Barnes–Hut agrees with the direct reference within a controlled tolerance', () => { const s = new BodyStore(), rng = seededRandom(7); for (let i = 0; i < 300; i++)
    s.add({ mass: 1e-5 + rng() * .01, position: [rng() * 8 - 4, rng() * 8 - 4, rng() * 8 - 4] }); const direct = new Float64Array(s.count * 3); directAcceleration(s, direct); const tree = new BarnesHutTree(s), approx = tree.acceleration(new Float64Array(s.count * 3), G, 1e-7, .4); let error = 0, mag = 0; for (let i = 0; i < direct.length; i++) {
    error += (approx[i] - direct[i]) ** 2;
    mag += direct[i] ** 2;
} assert.ok(Math.sqrt(error / mag) < .015); });
test('Barnes–Hut handles coincident positions with bounded depth', () => { const s = new BodyStore(); for (let i = 0; i < 80; i++)
    s.add({ mass: 1e-9, position: [0, 0, 0] }); const tree = new BarnesHutTree(s); assert.ok(tree.nodes < 50); assert.ok(Array.from(tree.acceleration()).every(Number.isFinite)); });
test('merger conserves mass, linear momentum, center of mass and volume', () => { const s = new BodyStore(); const a = s.add({ mass: 3, radius: .2, position: [-1, 0, 0], velocity: [1, 2, 0] }), b = s.add({ mass: 2, radius: .1, position: [1, 0, 0], velocity: [-2, 1, 0] }); const before = invariants(s); const event = mergeBodies(s, a, b), after = invariants(s); assert.equal(s.count, 1); close(after.mass, before.mass); for (let k = 0; k < 3; k++) {
    close(after.momentum[k], before.momentum[k]);
    close(after.barycenter[k], before.barycenter[k]);
} close(s.radius[0] ** 3, .2 ** 3 + .1 ** 3); assert.equal(event.removed, b); assert.ok(s.temperature[0] > 288); });
test('fragmentation conserves mass, momentum and center of mass', () => { const s = new BodyStore(), id = s.add({ mass: EARTH_MASS, radius: 6371 / AU_KM, position: [1, 2, 3], velocity: [.01, .02, .03] }); const before = invariants(s); const ids = fragmentBody(s, id, { count: 40, seed: 77, remnant: .2 }); assert.equal(ids.length, 40); const after = invariants(s); close(after.mass, before.mass, 1e-18); for (let k = 0; k < 3; k++) {
    close(after.momentum[k], before.momentum[k], 1e-18);
    close(after.barycenter[k], before.barycenter[k], 1e-13);
} });
test('swept collision catches bodies that pass between endpoints', () => { assert.equal(sweptHit([-1, 0, 0], [1, 0, 0], [1, 0, 0], [-1, 0, 0], .2), true); assert.equal(sweptHit([-1, 1, 0], [1, 1, 0], [1, 0, 0], [-1, 0, 0], .2), false); });
test('collision broad phase detects swept merger and ignores pass-through mode', () => { const s = new BodyStore(); const a = s.add({ mass: 1e-9, radius: .1, position: [1, 0, 0] }), b = s.add({ mass: 2e-9, radius: .1, position: [-1, 0, 0] }); const before = new Map([[a, [-1, 0, 0]], [b, [1, 0, 0]]]), engine = new CollisionEngine(); assert.equal(engine.resolve(s, before, { mode: 'off' }).length, 0); assert.equal(s.count, 2); assert.equal(engine.resolve(s, before, { mode: 'merge' }).length, 1); assert.equal(s.count, 1); });
test('elastic collision conserves kinetic energy and momentum', () => { const s = new BodyStore(); const a = s.add({ mass: 1, radius: 1, position: [-.8, 0, 0], velocity: [1, 0, 0] }), b = s.add({ mass: 2, radius: 1, position: [.8, 0, 0], velocity: [-1, 0, 0] }); const before = invariants(s); new CollisionEngine().resolve(s, new Map([[a, [-1, 0, 0]], [b, [1, 0, 0]]]), { mode: 'elastic' }); const after = invariants(s); close(after.kinetic, before.kinetic); close(after.momentum[0], before.momentum[0]); assert.equal(s.count, 2); });
test('radiative model gives approximately 255 K for Earth without greenhouse offset', () => { const earth = { ...getTemplate('earth'), id: 2, position: [1, 0, 0], greenhouse: 0 }, sun = { ...getTemplate('sun'), id: 1, position: [0, 0, 0] }; const temp = equilibriumTemperature(earth, [sun]); assert.ok(temp > 253 && temp < 256); const warm = equilibriumTemperature({ ...earth, greenhouse: 33 }, [sun]); close(warm - temp, 33); });
test('thermal relaxation stays bounded even with extremely long timesteps', () => { const s = twoBody(); s.update(2, { temperature: 10000 }); const engine = new ThermalEngine(); engine.step(s, 1e12); assert.ok(s.temperature[1] > 285 && s.temperature[1] < 290); });
test('material radius scales as cube root of mass', () => { const c = { iron: .32, rock: .68, water: 0, hydrogen: 0 }; close(materialRadius(8 * EARTH_MASS, c) / materialRadius(EARTH_MASS, c), 2); });
test('all eight scenario factories create finite stable IDs and reference frames', () => { for (const key of ['solar', 'binary', 'impact', 'saturn', 'chaos', 'galaxy', 'rogue', 'empty']) {
    const scene = createScenario(key), s = scene.store;
    assert.equal(new Set(s.meta.map(b => b.id)).size, s.count);
    assert.ok(Array.from(s.position.subarray(0, s.count * 3)).every(Number.isFinite));
    assert.ok(Array.from(s.velocity.subarray(0, s.count * 3)).every(Number.isFinite));
    const d = invariants(s);
    for (const component of d.momentum)
        assert.ok(Math.abs(component) < 1e-9);
    assert.ok(stableStep(s) > 0);
} });
test('JSON project round-trips without changing physical values', () => { const scene = createScenario('solar'), sim = new Simulation(scene.store), project = { ...sim.snapshot(), metadata: { title: 'Test', speed: 10, selected: 4 }, camera: { span: 7, target: [0, 0, 0], yaw: 0, pitch: .6 } }; const parsed = parseProject(stringifyProject(project)); assert.deepEqual(parsed.bodies, project.bodies); assert.equal(parsed.metadata.title, 'Test'); });
test('import validation rejects unsupported units, settings, duplicates and malformed bodies', () => { const sim = new Simulation(twoBody()), p = sim.snapshot(); assert.throws(() => validateProject({ ...p, version: 9 })); assert.throws(() => validateProject({ ...p, time: NaN })); assert.throws(() => validateProject({ ...p, units: { length: 'km' } })); assert.throws(() => validateProject({ ...p, settings: { gravity: -1 } })); assert.throws(() => validateProject({ ...p, bodies: [p.bodies[0], p.bodies[0]] })); assert.throws(() => parseProject('{broken')); });
test('undo/redo preserves edit snapshots and clears divergent future', () => { const h = new CommandHistory(2); h.record('one', { v: 1 }, { v: 2 }); h.record('two', { v: 2 }, { v: 3 }); assert.deepEqual(h.undo(), { v: 2 }); assert.deepEqual(h.redo(), { v: 3 }); h.undo(); h.record('other', { v: 2 }, { v: 4 }); assert.equal(h.redo(), null); });
test('simulation reports actual advanced time when accuracy limits requested rate', async () => { const scene = createScenario('impact'), sim = new Simulation(scene.store); sim.settings.maxSubsteps = 2; const actual = await sim.advance(10000); assert.ok(actual > 0 && actual < 10000); assert.equal(sim.time, actual); assert.equal(sim.last.capped, true); });
test('impact scenario produces a real collision through integration', async () => { const scene = createScenario('impact'), sim = new Simulation(scene.store); sim.settings.softening = 1e-9; let collisions = 0; sim.events.subscribe(e => { if (e.type === 'collision')
    collisions++; }); for (let i = 0; i < 1000 && sim.store.count > 1; i++)
    await sim.advance(.005); assert.equal(sim.store.count, 1); assert.ok(collisions > 0); });
test('invalid storage capacities reject before allocation', () => { for (const capacity of [NaN, Infinity, 0, -1, 1.5, 4097])
    assert.throws(() => new BodyStore(capacity)); });
test('invalid fragmentation is atomic, including bodies below fragment mass floor', () => { for (const body of [{ mass: 1e-20 }, { mass: 1, radius: 1e-12 }]) {
    const s = new BodyStore(), id = s.add(body), before = s.toJSON();
    assert.throws(() => fragmentBody(s, id));
    assert.deepEqual(s.toJSON(), before);
} const s = twoBody(), before = s.toJSON(); for (const options of [{ remnant: 0 }, { remnant: 1 }, { count: NaN }, { speed: Infinity }, { speed: -1 }]) {
    assert.throws(() => fragmentBody(s, 2, options));
    assert.deepEqual(s.toJSON(), before);
} });
test('fast ring particles constrain timestep even around a single major body', () => { const s = createScenario('saturn').store; const h = stableStep(s, G, 100, 1e-9); assert.ok(h > 0 && h < .01); });
test('arbitrary finite orbital phase wraps its procedural seed without altering physical validity', () => { const s = twoBody(); for (const angle of [-10000, 10000]) {
    const id = addOrbit(s, getTemplate('earth'), 1, { angle });
    assert.ok(s.body(id).seed >= 0);
    assert.ok(s.body(id).position.every(Number.isFinite));
} assert.throws(() => keplerState({ a: Infinity })); assert.throws(() => keplerState({ anomaly: NaN })); });
test('fractional imported substep counts are rejected', () => { const p = new Simulation(twoBody()).snapshot(); assert.throws(() => validateProject({ ...p, settings: { ...p.settings, maxSubsteps: 1.5 } })); });

test('standalone simulation restore rejects invalid metadata atomically',()=>{const sim=new Simulation(twoBody()),before=sim.snapshot();assert.throws(()=>sim.restore({...before,time:NaN}));assert.deepEqual(sim.snapshot(),before);});
test('nonfinite requested time is rejected without modifying state',async()=>{const sim=new Simulation(twoBody());await assert.rejects(sim.advance(Infinity));assert.equal(sim.time,0);});

test('swept elastic collision reflects fast spheres after a complete endpoint crossing',()=>{const s=new BodyStore(),a=s.add({mass:1,radius:.1,position:[1,0,0],velocity:[2,0,0]}),b=s.add({mass:1,radius:.1,position:[-1,0,0],velocity:[-2,0,0]});const before=invariants(s);new CollisionEngine().resolve(s,new Map([[a,[-1,0,0]],[b,[1,0,0]]]),{mode:'elastic'});assert.ok(s.body(a).position[0]<s.body(b).position[0]);close(s.body(a).velocity[0],-2);close(s.body(b).velocity[0],2);const after=invariants(s);close(after.kinetic,before.kinetic);close(after.momentum[0],before.momentum[0]);close(after.barycenter[0],before.barycenter[0]);});
