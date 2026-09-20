import { validateBody, MAX_BODIES } from '@orbitarium/core';
import { G, AU_KM, DAY_S, seededRandom, TAU } from '@orbitarium/math';
/** Closest approach of relative linear segments over a completed integration interval. */
export function sweptHit(a0, a1, b0, b1, r) { let n = 0, d = 0; const q = [], v = []; for (let k = 0; k < 3; k++) {
    q[k] = a0[k] - b0[k];
    v[k] = (a1[k] - a0[k]) - (b1[k] - b0[k]);
    n += q[k] * v[k];
    d += v[k] * v[k];
} const t = d ? Math.max(0, Math.min(1, -n / d)) : 0; return Math.hypot(...q.map((x, k) => x + v[k] * t)) <= r; }
export function mergeBodies(s, idA, idB) {
    const a = s.body(idA), b = s.body(idB);
    if (!a || !b || a.id === b.id)
        return null;
    const winner = a.mass >= b.mass ? a : b, loser = winner === a ? b : a, m = a.mass + b.mass;
    const position = a.position.map((v, k) => (v * a.mass + b.position[k] * b.mass) / m), velocity = a.velocity.map((v, k) => (v * a.mass + b.velocity[k] * b.mass) / m);
    const rel2 = a.velocity.reduce((sum, v, k) => sum + (v - b.velocity[k]) ** 2, 0), energy = 0.5 * a.mass * b.mass / m * rel2;
    const cp = (a.heatCapacity * a.mass + b.heatCapacity * b.mass) / m, heat = energy / m * (AU_KM * 1000 / DAY_S) ** 2 / cp;
    const composition = Object.fromEntries(Object.keys(a.composition).map(k => [k, (a.composition[k] * a.mass + b.composition[k] * b.mass) / m]));
    s.update(winner.id, { mass: m, radius: Math.cbrt(a.radius ** 3 + b.radius ** 3), position, velocity, temperature: Math.min(1e9, (a.temperature * a.mass + b.temperature * b.mass) / m + heat), composition, heatCapacity: cp, luminosity: a.luminosity + b.luminosity, name: winner.name });
    s.remove(loser.id);
    return { type: 'collision', survivor: winner.id, removed: loser.id, names: [a.name, b.name], position, energy, radius: Math.cbrt(a.radius ** 3 + b.radius ** 3), color: winner.color };
}
/** Explosion is an explicit sandbox operation, not a stellar-evolution or SPH model. */
export function fragmentBody(s, id, { count = 32, speed, remnant = 0.3, seed = 42 } = {}) {
    const body = s.body(id);
    if (!body)
        return [];
    if (!Number.isFinite(count) || !Number.isFinite(remnant) || remnant <= 0 || remnant >= 1)
        throw new RangeError('Fragment count and remnant fraction must be finite; remnant must be between 0 and 1');
    count = Math.min(128, Math.max(2, Math.floor(count)), MAX_BODIES - s.count);
    if (count < 2)
        return [];
    const rng = seededRandom(seed), ejectMass = body.mass * (1 - remnant), partMass = ejectMass / count, partRadius = body.radius * Math.cbrt((1 - remnant) / count) * 0.65;
    speed ??= Math.sqrt(2 * G * body.mass / body.radius) * 1.2;
    if (!Number.isFinite(speed) || speed < 0)
        throw new RangeError('Ejection speed must be finite and nonnegative');
    const vectors = [], mean = [0, 0, 0];
    for (let i = 0; i < count; i++) {
        const z = 2 * rng() - 1, t = TAU * rng(), r = Math.sqrt(1 - z * z), u = [r * Math.cos(t), r * Math.sin(t), z];
        vectors.push(u);
        for (let k = 0; k < 3; k++)
            mean[k] += u[k] / count;
    }
    // Validate every resulting body before mutating the store: the operation is atomic on invalid input.
    const surviving = validateBody({ ...body, mass: body.mass * remnant, radius: body.radius * Math.cbrt(remnant), temperature: Math.min(1e9, body.temperature + 5000), luminosity: body.luminosity * remnant });
    const fragments = vectors.map((vector, i) => {
        const u = vector.map((v, k) => v - mean[k]);
        return validateBody({ ...body, id: 0, name: `${body.name} · fragment ${i + 1}`, kind: 'fragment', mass: partMass, radius: partRadius, position: body.position.map((v, k) => v + u[k] * body.radius * 4), velocity: body.velocity.map((v, k) => v + u[k] * speed), temperature: Math.min(1e9, body.temperature + 3000), luminosity: 0, rings: false, tracer: true, seed: i + seed });
    });
    s.reserve(s.count + fragments.length);
    s.update(id, surviving);
    return fragments.map(b => s.add(b));
}
export class CollisionEngine {
    constructor() { this.events = []; }
    resolve(s, previous, { mode = 'merge' } = {}) {
        this.events = [];
        if (mode === 'off')
            return this.events;
        // A sweep-and-prune broad phase over swept x extents; no static cell-size assumption.
        const extents = [];
        for (let i = 0; i < s.count; i++) {
            const b = s.at(i), old = previous.get(b.id) || b.position, r = b.radius;
            extents.push({ id: b.id, lo: Math.min(old[0], b.position[0]) - r, hi: Math.max(old[0], b.position[0]) + r, old });
        }
        extents.sort((a, b) => a.lo - b.lo);
        const handled = new Set();
        for (let a = 0; a < extents.length; a++) {
            const ea = extents[a];
            if (handled.has(ea.id))
                continue;
            for (let j = a + 1; j < extents.length && extents[j].lo <= ea.hi; j++) {
                const eb = extents[j];
                if (handled.has(eb.id))
                    continue;
                const ba = s.body(ea.id), bb = s.body(eb.id);
                if (!ba || !bb || ba.tracer && bb.tracer)
                    continue;
                if (!sweptHit(ea.old, ba.position, eb.old, bb.position, ba.radius + bb.radius))
                    continue;
                if (mode === 'elastic') {
                    // Use the entry contact normal, not the post-crossing separation normal.
                    // The latter has its sign reversed after a fast body tunnels through a sphere.
                    const da = ba.position.map((v,k)=>v-ea.old[k]);
                    const db = bb.position.map((v,k)=>v-eb.old[k]);
                    const q = ea.old.map((v,k)=>v-eb.old[k]);
                    const travel = da.map((v,k)=>v-db[k]);
                    const radius = ba.radius + bb.radius;
                    const aa = travel.reduce((n,v)=>n+v*v,0);
                    const ab = q.reduce((n,v,k)=>n+2*v*travel[k],0);
                    const ac = q.reduce((n,v)=>n+v*v,0)-radius*radius;
                    const discriminant = ab*ab-4*aa*ac;
                    const t = ac<=0 || aa===0 ? 0 : Math.max(0,Math.min(1,(-ab-Math.sqrt(Math.max(0,discriminant)))/(2*aa)));
                    const pa = ea.old.map((v,k)=>v+da[k]*t), pb = eb.old.map((v,k)=>v+db[k]*t);
                    let normal = pa.map((v,k)=>v-pb[k]);
                    const separation = Math.hypot(...normal);
                    normal = separation>1e-20 ? normal.map(v=>v/separation) : [1,0,0];
                    const inverseMass = 1/ba.mass+1/bb.mass;
                    const closing = ba.velocity.reduce((n,v,k)=>n+(v-bb.velocity[k])*normal[k],0);
                    const impulse = closing<0 ? -2*closing/inverseMass : 0;
                    const travelClosing = travel.reduce((n,v,k)=>n+v*normal[k],0);
                    const travelImpulse = travelClosing<0 ? -2*travelClosing/inverseMass : 0;
                    const overlap = Math.max(0,radius-separation)+1e-12;
                    const positionA = pa.map((v,k)=>v+(1-t)*(da[k]+travelImpulse*normal[k]/ba.mass)+normal[k]*overlap*bb.mass/(ba.mass+bb.mass));
                    const positionB = pb.map((v,k)=>v+(1-t)*(db[k]-travelImpulse*normal[k]/bb.mass)-normal[k]*overlap*ba.mass/(ba.mass+bb.mass));
                    const resultA = validateBody({...ba,position:positionA,velocity:ba.velocity.map((v,k)=>v+impulse*normal[k]/ba.mass)});
                    const resultB = validateBody({...bb,position:positionB,velocity:bb.velocity.map((v,k)=>v-impulse*normal[k]/bb.mass)});
                    s.update(ba.id,resultA);s.update(bb.id,resultB);
                    this.events.push({type:'bounce',names:[ba.name,bb.name],position:pa,radius,color:ba.color});
                    handled.add(ba.id);handled.add(bb.id);break;
                }
                const event = mergeBodies(s, ba.id, bb.id);
                if (event) {
                    this.events.push(event);
                    handled.add(ba.id);
                    handled.add(bb.id);
                }
                break;
            }
        }
        return this.events;
    }
}
