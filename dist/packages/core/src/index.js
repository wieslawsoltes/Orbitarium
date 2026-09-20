import { finiteNumber } from '@orbitarium/math';
export const MAX_BODIES = 4096;
export const KINDS = ['star', 'rocky', 'earth', 'gas', 'ice', 'moon', 'asteroid', 'comet', 'blackhole', 'fragment'];
const vector = (a, name) => { if (!Array.isArray(a) || a.length !== 3)
    throw new TypeError(`${name} must have three components`); return a.map((n, i) => finiteNumber(n, `${name}[${i}]`, -1e12, 1e12)); };
export function validateBody(body) {
    if (!body || typeof body !== 'object')
        throw new TypeError('Invalid body');
    const kind = KINDS.includes(body.kind) ? body.kind : 'rocky';
    const color = typeof body.color === 'string' && /^#[0-9a-f]{6}$/i.test(body.color) ? body.color : '#b8c9e4';
    const composition = { iron: 0.32, rock: 0.67, water: 0.01, hydrogen: 0, ...body.composition };
    for (const key of Object.keys(composition))
        if (!['iron', 'rock', 'water', 'hydrogen'].includes(key))
            delete composition[key];
    let sum = 0;
    for (const [key, val] of Object.entries(composition))
        sum += finiteNumber(val, `composition.${key}`, 0, 1);
    if (!(sum > 0))
        throw new RangeError('Composition cannot be empty');
    for (const k of Object.keys(composition))
        composition[k] /= sum;
    return { id: Number.isSafeInteger(body.id) && body.id > 0 ? body.id : 0, name: String(body.name || 'Untitled body').slice(0, 100), kind, color,
        mass: finiteNumber(body.mass ?? 0.000003, 'mass', 1e-20, 1e12), radius: finiteNumber(body.radius ?? 0.00004, 'radius', 1e-12, 1e8),
        position: vector(body.position ?? [0, 0, 0], 'position'), velocity: vector(body.velocity ?? [0, 0, 0], 'velocity'),
        temperature: finiteNumber(body.temperature ?? 288, 'temperature', 0, 1e9), luminosity: finiteNumber(body.luminosity ?? 0, 'luminosity', 0, 1e12),
        albedo: finiteNumber(body.albedo ?? 0.3, 'albedo', 0, 1), greenhouse: finiteNumber(body.greenhouse ?? 0, 'greenhouse', 0, 2000),
        heatCapacity: finiteNumber(body.heatCapacity ?? 1000, 'heat capacity', 1, 1e7), thermalDays: finiteNumber(body.thermalDays ?? 30, 'thermal response days', 0.001, 1e8),
        spin: finiteNumber(body.spin ?? 1, 'spin', -10000, 10000), rings: !!body.rings, visible: body.visible !== false, tracer: !!body.tracer,
        composition, seed: finiteNumber(body.seed ?? 42, 'seed', 0, 1e9) };
}
/** Dense SoA numerical storage; metadata indexed by stable identity, not array slot. */
export class BodyStore {
    constructor(capacity = 32) { if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_BODIES)
        throw new RangeError(`Capacity must be an integer in [1, ${MAX_BODIES}]`); this.capacity = capacity; this.count = 0; this.nextId = 1; this.version = 0; this.meta = []; this.indices = new Map(); this.allocate(this.capacity); }
    allocate(n) { for (const key of ['position', 'velocity', 'acceleration']) {
        const a = new Float64Array(n * 3);
        if (this[key])
            a.set(this[key].subarray(0, this.count * 3));
        this[key] = a;
    } for (const key of ['mass', 'radius', 'temperature']) {
        const a = new Float64Array(n);
        if (this[key])
            a.set(this[key].subarray(0, this.count));
        this[key] = a;
    } }
    reserve(n) { if (n > MAX_BODIES)
        throw new RangeError(`Maximum ${MAX_BODIES} bodies`); if (n <= this.capacity)
        return; this.capacity = Math.min(MAX_BODIES, Math.max(n, this.capacity * 2)); this.allocate(this.capacity); }
    add(input) { if (this.count >= MAX_BODIES)
        throw new RangeError(`Maximum ${MAX_BODIES} bodies`); const b = validateBody(input); if (b.id && this.indices.has(b.id))
        throw new Error(`Duplicate body ID ${b.id}`); b.id ||= this.nextId++; this.nextId = Math.max(this.nextId, b.id + 1); this.reserve(this.count + 1); const i = this.count++; this.meta[i] = b; this.indices.set(b.id, i); this.write(i, b); this.version++; return b.id; }
    write(i, b) { this.position.set(b.position, i * 3); this.velocity.set(b.velocity, i * 3); this.mass[i] = b.mass; this.radius[i] = b.radius; this.temperature[i] = b.temperature; this.meta[i] = b; }
    index(id) { return this.indices.get(id) ?? -1; }
    body(id) { const i = this.index(id); return i < 0 ? null : this.at(i); }
    at(i) { if (i < 0 || i >= this.count)
        return null; return { ...this.meta[i], composition: { ...this.meta[i].composition }, position: Array.from(this.position.subarray(i * 3, i * 3 + 3)), velocity: Array.from(this.velocity.subarray(i * 3, i * 3 + 3)), mass: this.mass[i], radius: this.radius[i], temperature: this.temperature[i] }; }
    update(id, patch) { const i = this.index(id); if (i < 0)
        throw new Error('Body no longer exists'); const b = validateBody({ ...this.at(i), ...patch, id }); this.write(i, b); this.version++; }
    remove(id) { const i = this.index(id); if (i < 0)
        return false; const last = --this.count; this.indices.delete(id); if (i !== last) {
        for (const key of ['position', 'velocity', 'acceleration'])
            this[key].copyWithin(i * 3, last * 3, last * 3 + 3);
        for (const key of ['mass', 'radius', 'temperature'])
            this[key][i] = this[key][last];
        this.meta[i] = this.meta[last];
        this.indices.set(this.meta[i].id, i);
    } this.meta.pop(); this.version++; return true; }
    clear() { this.count = 0; this.nextId = 1; this.meta = []; this.indices.clear(); this.version++; }
    toJSON() { return Array.from({ length: this.count }, (_, i) => this.at(i)); }
    static fromJSON(bodies) { if (!Array.isArray(bodies) || bodies.length > MAX_BODIES)
        throw new RangeError('Invalid body array'); const s = new BodyStore(bodies.length || 1); for (const b of bodies)
        s.add(b); return s; }
}
export class Signal {
    #listeners = new Set();
    subscribe(callback) { this.#listeners.add(callback); return () => this.#listeners.delete(callback); }
    emit(value) { for (const fn of this.#listeners)
        fn(value); }
    clear() { this.#listeners.clear(); }
}
export class CommandHistory {
    constructor(limit = 32) { this.undoStack = []; this.redoStack = []; this.limit = limit; }
    record(label, before, after) { this.undoStack.push({ label, before, after }); if (this.undoStack.length > this.limit)
        this.undoStack.shift(); this.redoStack = []; }
    undo() { const c = this.undoStack.pop(); if (!c)
        return null; this.redoStack.push(c); return c.before; }
    redo() { const c = this.redoStack.pop(); if (!c)
        return null; this.undoStack.push(c); return c.after; }
    clear() { this.undoStack = []; this.redoStack = []; }
}
