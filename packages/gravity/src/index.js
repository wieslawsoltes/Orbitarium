import { G } from '@orbitarium/math';
/** Pairwise symmetric forces. The reference path preserves pairwise momentum to roundoff. */
export function directAcceleration(s, out = s.acceleration, g = G, epsilon = 1e-7) {
    const n = s.count, p = s.position, m = s.mass, e2 = epsilon * epsilon;
    out.fill(0, 0, n * 3);
    for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
            const a = i * 3, b = j * 3, dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2], r2 = dx * dx + dy * dy + dz * dz + e2;
            if (r2 === 0)
                continue;
            const f = g / (r2 * Math.sqrt(r2)), fi = f * m[j], fj = f * m[i];
            out[a] += dx * fi;
            out[a + 1] += dy * fi;
            out[a + 2] += dz * fi;
            out[b] -= dx * fj;
            out[b + 1] -= dy * fj;
            out[b + 2] -= dz * fj;
        }
    return out;
}
/** Bounded-depth bucket octree; coincident positions terminate safely instead of recursing forever. */
export class BarnesHutTree {
    constructor(s) { this.s = s; this.root = null; this.nodes = 0; this.build(); }
    build() { const s = this.s; if (!s.count)
        return; const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < s.count; i++)
        for (let k = 0; k < 3; k++) {
            const x = s.position[i * 3 + k];
            min[k] = Math.min(min[k], x);
            max[k] = Math.max(max[k], x);
        } const c = min.map((x, k) => (x + max[k]) / 2), h = Math.max(...max.map((v, k) => v - min[k])) / 2 + 1e-10; this.root = this.make(Array.from({ length: s.count }, (_, i) => i), c, h, 0); }
    make(indices, c, h, depth) {
        this.nodes++;
        const s = this.s;
        let mass = 0, com = [0, 0, 0];
        for (const i of indices) {
            mass += s.mass[i];
            for (let k = 0; k < 3; k++)
                com[k] += s.position[i * 3 + k] * s.mass[i];
        }
        com = com.map(x => x / (mass || 1));
        const node = { c, h, mass, com, children: null, indices: null };
        if (indices.length <= 4 || depth >= 40 || h < 1e-14) {
            node.indices = indices;
            return node;
        }
        const groups = Array.from({ length: 8 }, () => []);
        for (const i of indices) {
            const p = i * 3;
            groups[(s.position[p] >= c[0] ? 1 : 0) | (s.position[p + 1] >= c[1] ? 2 : 0) | (s.position[p + 2] >= c[2] ? 4 : 0)].push(i);
        }
        node.children = [];
        for (let k = 0; k < 8; k++)
            if (groups[k].length)
                node.children.push(this.make(groups[k], c.map((v, a) => v + ((k >> a & 1) ? 1 : -1) * h / 2), h / 2, depth + 1));
        return node;
    }
    acceleration(out = this.s.acceleration, g = G, epsilon = 1e-7, theta = 0.55) {
        const s = this.s, e2 = epsilon * epsilon;
        out.fill(0, 0, s.count * 3);
        if (!this.root)
            return out;
        for (let i = 0; i < s.count; i++) {
            const pi = i * 3, px = s.position[pi], py = s.position[pi + 1], pz = s.position[pi + 2], stack = [this.root];
            while (stack.length) {
                const node = stack.pop();
                if (node.indices) {
                    for (const j of node.indices) {
                        if (j === i)
                            continue;
                        const q = j * 3, dx = s.position[q] - px, dy = s.position[q + 1] - py, dz = s.position[q + 2] - pz, r2 = dx * dx + dy * dy + dz * dz + e2;
                        if (!r2)
                            continue;
                        const f = g * s.mass[j] / (r2 * Math.sqrt(r2));
                        out[pi] += dx * f;
                        out[pi + 1] += dy * f;
                        out[pi + 2] += dz * f;
                    }
                }
                else {
                    const dx = node.com[0] - px, dy = node.com[1] - py, dz = node.com[2] - pz, r2 = dx * dx + dy * dy + dz * dz + e2;
                    const contains = Math.abs(px - node.c[0]) <= node.h && Math.abs(py - node.c[1]) <= node.h && Math.abs(pz - node.c[2]) <= node.h;
                    if (!contains && 4 * node.h * node.h < theta * theta * r2) {
                        const f = g * node.mass / (r2 * Math.sqrt(r2));
                        out[pi] += dx * f;
                        out[pi + 1] += dy * f;
                        out[pi + 2] += dz * f;
                    }
                    else
                        stack.push(...node.children);
                }
            }
        }
        return out;
    }
}
export class CPUSolver {
    constructor({ mode = 'auto', theta = 0.55 } = {}) { this.mode = mode; this.theta = theta; this.lastMode = 'direct'; }
    forces(s, g, epsilon) { this.lastMode = this.mode === 'tree' || (this.mode === 'auto' && s.count > 256) ? 'tree' : 'direct'; return this.lastMode === 'tree' ? new BarnesHutTree(s).acceleration(s.acceleration, g, epsilon, this.theta) : directAcceleration(s, s.acceleration, g, epsilon); }
    step(s, dt, g = G, epsilon = 1e-7) { this.forces(s, g, epsilon); for (let k = 0; k < s.count * 3; k++) {
        s.velocity[k] += s.acceleration[k] * dt / 2;
        s.position[k] += s.velocity[k] * dt;
    } this.forces(s, g, epsilon); for (let k = 0; k < s.count * 3; k++)
        s.velocity[k] += s.acceleration[k] * dt / 2; }
}
export function invariants(s, g = G, epsilon = 1e-7) {
    let mass = 0, kinetic = 0, potential = 0;
    const momentum = [0, 0, 0], center = [0, 0, 0], angular = [0, 0, 0];
    for (let i = 0; i < s.count; i++) {
        const m = s.mass[i], p = i * 3, x = s.position[p], y = s.position[p + 1], z = s.position[p + 2], vx = s.velocity[p], vy = s.velocity[p + 1], vz = s.velocity[p + 2];
        mass += m;
        kinetic += m * (vx * vx + vy * vy + vz * vz) / 2;
        for (let k = 0; k < 3; k++) {
            momentum[k] += m * s.velocity[p + k];
            center[k] += m * s.position[p + k];
        }
        angular[0] += m * (y * vz - z * vy);
        angular[1] += m * (z * vx - x * vz);
        angular[2] += m * (x * vy - y * vx);
        for (let j = i + 1; j < s.count; j++) {
            const q = j * 3, r = Math.hypot(x - s.position[q], y - s.position[q + 1], z - s.position[q + 2], epsilon);
            if (r)
                potential -= g * m * s.mass[j] / r;
        }
    }
    return { mass, kinetic, potential, energy: kinetic + potential, momentum, angularMomentum: angular, barycenter: center.map(x => x / (mass || 1)) };
}
/** Conservative accuracy limiter. Returns days, not a promise of wall-clock throughput. */
export function stableStep(s, g = G, maxStep = 1, epsilon = 1e-7) {
    let dt = maxStep;
    // Resolve major-major and particle-major encounters. Tracer-tracer encounters are
    // intentionally omitted here; tracers are still gravitating in both force solvers.
    const major = [];
    for (let i = 0; i < s.count; i++)
        if (!s.meta[i].tracer)
            major.push(i);
    for (let i = 0; i < s.count; i++)
        for (const j of major) {
            if (i === j || (!s.meta[i].tracer && j < i))
                continue;
            const p = i * 3, q = j * 3;
            const d = Math.hypot(s.position[p] - s.position[q], s.position[p + 1] - s.position[q + 1], s.position[p + 2] - s.position[q + 2]);
            const v = Math.hypot(s.velocity[p] - s.velocity[q], s.velocity[p + 1] - s.velocity[q + 1], s.velocity[p + 2] - s.velocity[q + 2]);
            const r = Math.max(d, epsilon, s.radius[i] + s.radius[j]);
            if (g > 0)
                dt = Math.min(dt, 0.06 * Math.sqrt(r * r * r / (g * (s.mass[i] + s.mass[j]))));
            if (v > 0)
                dt = Math.min(dt, 0.15 * r / v);
        }
    return Math.max(1e-8, dt);
}
