import { clamp } from '@orbitarium/math';
/** Orthographic 3D camera. Physical coordinates stay in world space; only rendering is rescaled. */
export class OrbitCamera {
    constructor() { this.target = [0, 0, 0]; this.span = 7; this.yaw = -0.30; this.pitch = 0.62; this.width = 1000; this.height = 800; this.follow = null; }
    get scale() { return this.height / (2 * this.span); }
    basis() { const c = Math.cos(this.yaw), s = Math.sin(this.yaw), p = Math.sin(this.pitch), q = Math.cos(this.pitch); return { right: [c, -s, 0], up: [s * p, c * p, q], forward: [-s * q, -c * q, p] }; }
    project(position) { const d = position.map((v, k) => v - this.target[k]), b = this.basis(), f = this.scale; return { x: this.width / 2 + (d[0] * b.right[0] + d[1] * b.right[1]) * f, y: this.height / 2 - (d[0] * b.up[0] + d[1] * b.up[1] + d[2] * b.up[2]) * f, z: d[0] * b.forward[0] + d[1] * b.forward[1] + d[2] * b.forward[2] }; }
    vector(v) { const b = this.basis(); return [v.reduce((s, n, k) => s + n * b.right[k], 0), v.reduce((s, n, k) => s + n * b.up[k], 0), v.reduce((s, n, k) => s + n * b.forward[k], 0)]; }
    unproject(x, y, z = 0) { const b = this.basis(), sx = (x - this.width / 2) / this.scale, sy = -(y - this.height / 2) / this.scale, p = Math.sin(this.pitch); if (Math.abs(p) < 0.06) {
        return [this.target[0] + sx * b.right[0] + sy * b.up[0], this.target[1] + sx * b.right[1] + sy * b.up[1], z];
    } const yWorld = (sy - (z - this.target[2]) * b.up[2]) / p; return [this.target[0] + Math.cos(this.yaw) * sx + Math.sin(this.yaw) * yWorld, this.target[1] - Math.sin(this.yaw) * sx + Math.cos(this.yaw) * yWorld, z]; }
    orbit(dx, dy) { this.yaw += dx * 0.006; this.pitch = clamp(this.pitch + dy * 0.006, 0.07, Math.PI / 2); }
    pan(dx, dy) { const b = this.basis(); for (let k = 0; k < 3; k++)
        this.target[k] -= (dx * b.right[k] - dy * b.up[k]) / this.scale; this.follow = null; }
    zoom(factor) { this.span = clamp(this.span * factor, 1e-7, 1e7); }
    toJSON() { return { target: [...this.target], span: this.span, yaw: this.yaw, pitch: this.pitch, follow: this.follow }; }
    restore(c) { if (!c)
        return; for (const k of ['span', 'yaw', 'pitch'])
        if (Number.isFinite(c[k]))
            this[k] = c[k]; if (Array.isArray(c.target) && c.target.length === 3 && c.target.every(Number.isFinite))
        this.target = [...c.target]; this.span = clamp(this.span, 1e-7, 1e7); this.pitch = clamp(this.pitch, 0.07, Math.PI / 2); this.follow = Number.isSafeInteger(c.follow) ? c.follow : null; }
}
