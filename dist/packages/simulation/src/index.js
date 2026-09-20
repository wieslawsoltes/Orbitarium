import {validateProject} from '@orbitarium/persistence';
import { G } from '@orbitarium/math';
import { BodyStore, Signal } from '@orbitarium/core';
import { CPUSolver, invariants, stableStep } from '@orbitarium/gravity';
import { CollisionEngine, fragmentBody } from '@orbitarium/collisions';
import { ThermalEngine } from '@orbitarium/thermal';
export class Simulation {
    constructor(store = new BodyStore()) {
        this.store = store;
        this.time = 0;
        this.cpu = new CPUSolver();
        this.gpu = null;
        this.backend = 'auto';
        this.collisions = new CollisionEngine();
        this.thermal = new ThermalEngine();
        this.events = new Signal();
        this.settings = { gravity: 1, softening: 1e-7, collisions: 'merge', thermal: true, maxStep: 1, maxSubsteps: 12, theta: 0.55 };
        this.last = { steps: 0, advanced: 0, capped: false, ms: 0, backend: 'CPU · Float64' };
        this.baseline = null;
        this.resetBaseline();
        this.running = false;
    }
    resetBaseline() { this.baseline = invariants(this.store, G * this.settings.gravity, this.settings.softening); }
    snapshot() { return { format: 'orbitarium', version: 1, units: { length: 'AU', time: 'day', mass: 'solar' }, time: this.time, settings: { ...this.settings }, bodies: this.store.toJSON() }; }
    restore(data) {
        const clean = validateProject(data);
        const candidate = BodyStore.fromJSON(clean.bodies);
        this.store = candidate;
        this.time = clean.time;
        this.settings = {...this.settings, ...clean.settings};
        this.resetBaseline();
    }
    async advance(requested) {
        if (!Number.isFinite(requested)) throw new RangeError("Requested duration must be finite");
        if (this.running || !(requested > 0) || !this.store.count)
            return 0;
        this.running = true;
        const start = performance.now();
        let steps = 0, advanced = 0;
        try {
            const s = this.store, g = G * this.settings.gravity, eps = this.settings.softening;
            const useGPU = this.backend === 'gpu' && this.gpu?.available;
            if (useGPU) {
                const h = stableStep(s, g, this.settings.maxStep, eps), count = Math.max(1, Math.min(this.settings.maxSubsteps, Math.ceil(requested / h))), dt = Math.min(h, requested / count), previous = new Map(s.meta.map((b, i) => [b.id, Array.from(s.position.subarray(i * 3, i * 3 + 3))]));
                await this.gpu.step(s, dt, count, g, eps);
                advanced = dt * count;
                steps = count;
                for (const event of this.collisions.resolve(s, previous, this.settings)) {
                    event.time = this.time + advanced;
                    this.events.emit(event);
                }
                if (this.settings.thermal)
                    this.thermal.step(s, advanced);
            }
            else {
                this.cpu.mode = this.backend === 'tree' ? 'tree' : this.backend === 'direct' ? 'direct' : 'auto';
                this.cpu.theta = this.settings.theta;
                while (advanced < requested - 1e-12 && steps < this.settings.maxSubsteps) {
                    const h = Math.min(requested - advanced, stableStep(s, g, this.settings.maxStep, eps));
                    const previous = new Map(s.meta.map((b, i) => [b.id, Array.from(s.position.subarray(i * 3, i * 3 + 3))]));
                    this.cpu.step(s, h, g, eps);
                    for (const event of this.collisions.resolve(s, previous, this.settings)) {
                        event.time = this.time + advanced + h;
                        this.events.emit(event);
                    }
                    if (this.settings.thermal)
                        this.thermal.step(s, h);
                    advanced += h;
                    steps++;
                    if (performance.now() - start > 12)
                        break;
                }
            }
            this.time += advanced;
            this.last = { steps, advanced, capped: advanced < requested * 0.98, ms: performance.now() - start, backend: useGPU ? 'WebGPU · Float32' : this.cpu.lastMode === 'tree' ? 'Barnes–Hut · Float64' : 'Direct · Float64' };
            return advanced;
        }
        finally {
            this.running = false;
        }
    }
    explode(id, options) { const b = this.store.body(id); if (!b)
        return []; const ids = fragmentBody(this.store, id, options); if (ids.length)
        this.events.emit({ type: 'explosion', names: [b.name], position: b.position, radius: b.radius, color: b.color, time: this.time }); this.resetBaseline(); return ids; }
    diagnostics() { const current = invariants(this.store, G * this.settings.gravity, this.settings.softening), base = this.baseline; return { ...current, relativeEnergyError: base?.energy ? (current.energy - base.energy) / Math.abs(base.energy) : 0 }; }
}
