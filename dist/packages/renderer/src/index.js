import { colorRGB, AU_KM, seededRandom, G, cross, length, normalize, sub, scale, orbitalElements, TAU } from '@orbitarium/math';
import { loadKernel } from '@orbitarium/kernels';
import { checkedModule } from '@orbitarium/gpu';
import { OrbitCamera } from './camera.js';
export { OrbitCamera };
const kindCodes = { star: 0, earth: 1, gas: 2, rocky: 3, moon: 3, asteroid: 3, ice: 4, blackhole: 5, comet: 6, fragment: 7 };
export class UniverseRenderer {
    constructor(canvas, overlay, { device = null } = {}) { this.canvas = canvas; this.overlay = overlay; this.ctx = overlay.getContext('2d'); this.device = device; this.camera = new OrbitCamera(); this.mode = 'Canvas 2D'; this.ready = false; this.projected = []; this.options = { orbits: true, trails: true, labels: true, grid: false, habitable: false, vectors: false, trueScale: false, heatmap: false, exposure: 1 }; this.trails = new Map(); this.bursts = []; this.lastTrailTime = -Infinity; this.selected = null; this.focusEase = null; this.capacity = 0; this.stars = []; const rng = seededRandom(20); for (let i = 0; i < 750; i++)
        this.stars.push([rng(), rng(), rng() * 1.3 + .2, rng() * .65 + .12]); }
    async init() { if (this.device) {
        try {
            await this.initGPU();
            this.mode = 'WebGPU';
        }
        catch (e) {
            console.warn('GPU renderer fallback', e);
            this.error = e.message;
            this.device = null;
            const old = this.canvas, newCanvas = document.createElement('canvas');
            newCanvas.id = old.id;
            newCanvas.className = old.className;
            old.replaceWith(newCanvas);
            this.canvas = newCanvas;
        }
    } if (!this.device)
        this.fallback = this.canvas.getContext('2d'); this.ready = true; return this; }
    async initGPU() {
        const d = this.device;
        this.context = this.canvas.getContext('webgpu');
        if (!this.context)
            throw new Error('Cannot create WebGPU canvas context');
        this.format = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({ device: d, format: this.format, alphaMode: 'opaque' });
        this.uniform = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        const [back, body] = await Promise.all([loadKernel('background'), loadKernel('bodies')]);
        const bgModule = await checkedModule(d, back, 'Procedural starfield'), bodyModule = await checkedModule(d, body, 'Procedural celestial surfaces');
        this.bgPipeline = await d.createRenderPipelineAsync({ layout: 'auto', vertex: { module: bgModule, entryPoint: 'vertexMain' }, fragment: { module: bgModule, entryPoint: 'fragmentMain', targets: [{ format: this.format }] }, primitive: { topology: 'triangle-list' } });
        this.bgBind = d.createBindGroup({ layout: this.bgPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.uniform } }] });
        this.bodyPipeline = await d.createRenderPipelineAsync({ layout: 'auto', vertex: { module: bodyModule, entryPoint: 'vertexMain' }, fragment: { module: bodyModule, entryPoint: 'fragmentMain', targets: [{ format: this.format, blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } } }] }, primitive: { topology: 'triangle-list' } });
        this.reserve(64);
    }
    reserve(n) { if (n <= this.capacity)
        return; this.capacity = Math.max(64, 2 ** Math.ceil(Math.log2(n))); this.data = new Float32Array(this.capacity * 20); if (this.device) {
        this.storage?.destroy();
        this.storage = this.device.createBuffer({ size: this.capacity * 80, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        this.bodyBind = this.device.createBindGroup({ layout: this.bodyPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.storage } }, { binding: 1, resource: { buffer: this.uniform } }] });
    } }
    resize() { const r = this.overlay.getBoundingClientRect(), dpr = Math.min(globalThis.devicePixelRatio || 1, 2), w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr)); for (const c of [this.canvas, this.overlay])
        if (c.width !== w || c.height !== h) {
            c.width = w;
            c.height = h;
        } this.camera.width = r.width; this.camera.height = r.height; this.dpr = dpr; }
    bodyRadius(body) { const real = body.radius * this.camera.scale; if (this.options.trueScale)
        return Math.max(body.tracer ? 0.65 : 1.4, real); if (body.tracer)
        return Math.max(body.kind === 'fragment' ? 1.6 : 0.8, Math.min(3.5, real)); const km = body.radius * AU_KM; const base = body.kind === 'star' ? 18 + Math.log10(Math.max(km / 100000, 1)) * 11 : body.kind === 'blackhole' ? 14 : Math.max(3.2, 3.6 + Math.log10(Math.max(km / 900, 1)) * 6.6); return Math.max(base, real); }
    track(store, time) { if (time === this.lastTrailTime)
        return; if (Math.abs(time - this.lastTrailTime) < 0.003)
        return; this.lastTrailTime = time; for (let i = 0; i < store.count; i++) {
        const b = store.meta[i];
        if (b.tracer)
            continue;
        let trail = this.trails.get(b.id);
        if (!trail) {
            trail = [];
            this.trails.set(b.id, trail);
        }
        trail.push(Array.from(store.position.subarray(i * 3, i * 3 + 3)));
        if (trail.length > 420)
            trail.shift();
    } for (const id of this.trails.keys())
        if (store.index(id) < 0)
            this.trails.delete(id); }
    reset() { this.trails.clear(); this.bursts = []; this.lastTrailTime = -Infinity; }
    burst(event) { this.bursts.push({ ...event, created: performance.now(), seed: Math.floor(performance.now()) }); }
    focus(body, { close = true } = {}) { if (!body)
        return; this.camera.follow = body.id; this.focusEase = { span: close ? Math.max(body.radius * 5, body.kind === 'star' ? 0.018 : 0.00015) : this.camera.span }; }
    render(store, time, selected) {
        if (!this.ready)
            return;
        this.resize();
        const cam = this.camera;
        this.selected = selected;
        const follow = store.body(cam.follow);
        if (follow)
            cam.target = follow.position;
        if (this.focusEase) {
            cam.span += (this.focusEase.span - cam.span) * 0.12;
            if (Math.abs(cam.span - this.focusEase.span) < this.focusEase.span * 0.001)
                this.focusEase = null;
        }
        this.track(store, time);
        let star = null;
        for (let i = 0; i < store.count; i++)
            if (store.meta[i].luminosity > (star?.luminosity || 0))
                star = store.at(i);
        this.projected = [];
        for (let i = 0; i < store.count; i++) {
            const b = store.at(i);
            if (!b.visible)
                continue;
            const p = cam.project(b.position), r = this.bodyRadius(b);
            if (p.x < -r * 3 || p.y < -r * 3 || p.x > cam.width + r * 3 || p.y > cam.height + r * 3)
                continue;
            const light = star ? normalize(cam.vector(sub(star.position, b.position))) : normalize([-0.6, 0.7, 1]);
            if (length(light) < 0.01)
                light[2] = 1;
            this.projected.push({ body: b, ...p, r, light });
        }
        this.projected.sort((a, b) => a.z - b.z);
        this.reserve(this.projected.length || 1);
        if (this.device)
            this.drawGPU(time);
        else
            this.drawFallback(time);
        this.drawOverlay(store, time);
    }
    drawGPU(time) { const d = this.device, c = this.camera; d.queue.writeBuffer(this.uniform, 0, new Float32Array([c.width, c.height, time, this.options.exposure])); let i = 0; for (const p of this.projected) {
        const b = p.body;
        this.data.set([p.x, p.y, p.r, p.z, ...colorRGB(b.color), kindCodes[b.kind] ?? 3, ...p.light, b.temperature, b.seed, b.rings ? 1 : 0, b.spin, b.id === this.selected ? 1 : 0, (time * b.spin * .7) % TAU, this.options.heatmap ? 1 : 0, 0, 0], i * 20);
        i++;
    } if (i)
        d.queue.writeBuffer(this.storage, 0, this.data, 0, i * 20); const encoder = d.createCommandEncoder(); const pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.context.getCurrentTexture().createView(), clearValue: { r: .01, g: .015, b: .03, a: 1 }, loadOp: 'clear', storeOp: 'store' }] }); pass.setPipeline(this.bgPipeline); pass.setBindGroup(0, this.bgBind); pass.draw(3); if (i) {
        pass.setPipeline(this.bodyPipeline);
        pass.setBindGroup(0, this.bodyBind);
        pass.draw(6, i);
    } pass.end(); d.queue.submit([encoder.finish()]); }
    drawFallback(time) {
        const c = this.fallback, w = this.camera.width, h = this.camera.height, dpr = this.dpr;
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.filter = 'none';
        c.fillStyle = '#050913';
        c.fillRect(0, 0, w, h);
        const neb = c.createRadialGradient(w * .55, h * .45, 0, w * .55, h * .45, w * .65);
        neb.addColorStop(0, '#16182c');
        neb.addColorStop(1, '#050913');
        c.fillStyle = neb;
        c.fillRect(0, 0, w, h);
        for (const [x, y, r, a] of this.stars) {
            c.globalAlpha = a;
            c.fillStyle = '#c6d5eb';
            c.beginPath();
            c.arc(x * w, y * h, r, 0, TAU);
            c.fill();
        }
        c.globalAlpha = 1;
        for (const p of this.projected) {
            const b = p.body, r = p.r, x = p.x, y = p.y;
            if (b.rings) {
                c.save();
                c.translate(x, y);
                c.rotate(-.27);
                c.strokeStyle = b.color + '88';
                c.lineWidth = r * .35;
                c.beginPath();
                c.ellipse(0, 0, r * 1.9, r * .60, 0, 0, TAU);
                c.stroke();
                c.restore();
            }
            if (b.kind === 'star') {
                const glow = c.createRadialGradient(x, y, r * .1, x, y, r * 2.6);
                glow.addColorStop(0, b.color);
                glow.addColorStop(.4, b.color + 'a0');
                glow.addColorStop(1, b.color + '00');
                c.fillStyle = glow;
                c.beginPath();
                c.arc(x, y, r * 2.6, 0, TAU);
                c.fill();
            }
            c.save();
            c.beginPath();
            c.arc(x, y, r, 0, TAU);
            c.clip();
            c.fillStyle = b.kind === 'blackhole' ? '#010208' : b.color;
            c.fillRect(x - r, y - r, r * 2, r * 2);
            if (b.kind === 'gas' || b.kind === 'ice') {
                for (let k = -5; k < 5; k++) {
                    c.globalAlpha = .12;
                    c.fillStyle = k % 2 ? '#ffffff' : '#5c3524';
                    c.fillRect(x - r, y + k * r / 5, r * 2, r / 8);
                }
                c.globalAlpha = 1;
            }
            if (b.kind === 'earth') {
                c.fillStyle = '#639475';
                for (let k = 0; k < 7; k++) {
                    const a = k * 2.7 + time * .03, ex = x + Math.sin(a) * r * .6, ey = y + Math.cos(k * 3.3) * r * .65;
                    c.beginPath();
                    c.ellipse(ex, ey, r * .22, r * .35, a, 0, TAU);
                    c.fill();
                }
                c.fillStyle = '#dfebed';
                c.beginPath();
                c.ellipse(x, y - r * .85, r * .45, r * .17, 0, 0, TAU);
                c.fill();
            }
            if (this.options.heatmap && b.kind !== 'star') {
                const t = Math.max(0, Math.min(1, (b.temperature - 50) / 1500));
                c.fillStyle = `rgb(${Math.round(20 + 235 * t)},${Math.round(56 + 10 * t)},${Math.round(217 - 199 * t)})`;
                c.fillRect(x - r, y - r, r * 2, r * 2);
            }
            const shade = c.createRadialGradient(x - r * .4, y - r * .45, 0, x + r * .1, y + r * .1, r * 1.25);
            shade.addColorStop(0, '#ffffff22');
            shade.addColorStop(.5, '#00000011');
            shade.addColorStop(1, b.kind === 'star' ? '#5f300066' : '#01030aea');
            c.fillStyle = shade;
            c.fillRect(x - r, y - r, r * 2, r * 2);
            c.restore();
        }
        // Apply exposure once to the complete image, not as a per-primitive software filter.
        if (this.options.exposure < 1) {
            c.globalCompositeOperation = 'multiply';
            const level = Math.round(this.options.exposure * 255);
            c.fillStyle = `rgb(${level},${level},${level})`;
            c.fillRect(0, 0, w, h);
            c.globalCompositeOperation = 'source-over';
        } else if (this.options.exposure > 1) {
            c.globalCompositeOperation = 'lighter';
            c.globalAlpha = this.options.exposure - 1;
            c.drawImage(this.canvas, 0, 0, w, h);
            c.globalAlpha = 1;
            c.globalCompositeOperation = 'source-over';
        }
    }
    primary(store, body) { let best = null, score = 0; for (let i = 0; i < store.count; i++) {
        if (store.meta[i].id === body.id || store.mass[i] < body.mass * 5)
            continue;
        const d = length(sub(store.position.subarray(i * 3, i * 3 + 3), body.position)), a = store.mass[i] / (d * d + 1e-20);
        if (a > score) {
            score = a;
            best = store.at(i);
        }
    } return best; }
    orbitPoints(body, primary) { const p = sub(body.position, primary.position), v = sub(body.velocity, primary.velocity), mu = G * (this.gravity ?? 1) * (body.mass + primary.mass), el = orbitalElements(p, v, mu); if (!el || el.eccentricity >= 0.99 || el.semiMajor > 1e6)
        return null; const h = cross(p, v), ev = sub(scale(cross(v, h), 1 / mu), scale(p, 1 / length(p))), u = el.eccentricity > 1e-5 ? normalize(ev) : normalize(p), w = normalize(cross(h, u)), points = []; for (let i = 0; i <= 180; i++) {
        const a = i / 180 * TAU, r = el.semiMajor * (1 - el.eccentricity ** 2) / (1 + el.eccentricity * Math.cos(a));
        points.push(primary.position.map((x, k) => x + r * (u[k] * Math.cos(a) + w[k] * Math.sin(a))));
    } return points; }
    path(points, stroke, width = 1, dash = []) { if (!points?.length)
        return; const c = this.ctx; c.beginPath(); for (let i = 0; i < points.length; i++) {
        const p = this.camera.project(points[i]);
        if (i)
            c.lineTo(p.x, p.y);
        else
            c.moveTo(p.x, p.y);
    } c.strokeStyle = stroke; c.lineWidth = width; c.setLineDash(dash); c.stroke(); c.setLineDash([]); }
    drawOverlay(store, time) {
        const c = this.ctx, cam = this.camera, w = cam.width, h = cam.height;
        c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        c.clearRect(0, 0, w, h);
        if (this.options.grid) {
            const step = 10 ** Math.floor(Math.log10(cam.span / 2));
            for (let i = -10; i <= 10; i++) {
                this.path([[-step * 10, i * step, 0], [step * 10, i * step, 0]], '#a3b4d512');
                this.path([[i * step, -step * 10, 0], [i * step, step * 10, 0]], '#a3b4d512');
            }
        }
        if (this.options.habitable) {
            for (let i = 0; i < store.count; i++) {
                const b = store.at(i);
                if (b.luminosity <= 0)
                    continue;
                const r = Math.sqrt(b.luminosity);
                c.beginPath();
                for (let j = 0; j <= 180; j++) {
                    const a = j / 180 * TAU, p = cam.project([b.position[0] + r * 1.65 * Math.cos(a), b.position[1] + r * 1.65 * Math.sin(a), b.position[2]]);
                    if (j)
                        c.lineTo(p.x, p.y);
                    else
                        c.moveTo(p.x, p.y);
                }
                for (let j = 180; j >= 0; j--) {
                    const a = j / 180 * TAU, p = cam.project([b.position[0] + r * .95 * Math.cos(a), b.position[1] + r * .95 * Math.sin(a), b.position[2]]);
                    c.lineTo(p.x, p.y);
                }
                c.closePath();
                c.fillStyle = '#5ad69912';
                c.fill();
            }
        }
        if (this.options.orbits) {
            for (let i = 0; i < store.count; i++) {
                const b = store.at(i);
                if (b.tracer || b.kind === 'star')
                    continue;
                const primary = this.primary(store, b);
                if (!primary)
                    continue;
                const pts = this.orbitPoints(b, primary);
                if (pts)
                    this.path(pts, b.id === this.selected ? '#a995ed66' : b.color + '24', b.id === this.selected ? 1.05 : .75);
            }
        }
        if (this.options.trails) {
            for (const [id, trail] of this.trails) {
                const b = store.body(id);
                if (!b)
                    continue;
                this.path(trail, b.color + '87', id === this.selected ? 1.65 : 1.0);
            }
        }
        for (const p of this.projected) {
            const b = p.body;
            if (b.tracer)
                continue;
            if (b.id === this.selected) {
                const r = p.r + 8;
                c.strokeStyle = '#b7a4ee';
                c.lineWidth = 1;
                c.beginPath();
                for (let a = 0; a < 4; a++) {
                    const theta = a * Math.PI / 2 + .14;
                    c.arc(p.x, p.y, r, theta, theta + .8);
                }
                c.stroke();
                c.fillStyle = '#b7a4ee';
                c.beginPath();
                c.arc(p.x, p.y + r + 4, 1.5, 0, TAU);
                c.fill();
            }
            if (this.options.vectors) {
                const endpoint = cam.project(b.position.map((v, k) => v + b.velocity[k] * cam.span * 8));
                c.strokeStyle = '#66c4d0aa';
                c.lineWidth = 1;
                c.beginPath();
                c.moveTo(p.x, p.y);
                c.lineTo(endpoint.x, endpoint.y);
                c.stroke();
                const a = Math.atan2(endpoint.y - p.y, endpoint.x - p.x);
                c.beginPath();
                c.moveTo(endpoint.x, endpoint.y);
                c.lineTo(endpoint.x - 7 * Math.cos(a - .4), endpoint.y - 7 * Math.sin(a - .4));
                c.moveTo(endpoint.x, endpoint.y);
                c.lineTo(endpoint.x - 7 * Math.cos(a + .4), endpoint.y - 7 * Math.sin(a + .4));
                c.stroke();
            }
        }
        if (this.options.labels)
            this.drawLabels();
        else
            this.labelPlacements = [];
        this.bursts = this.bursts.filter(b => performance.now() - b.created < 5000);
        for (const b of this.bursts) {
            const age = (performance.now() - b.created) / 1000, p = cam.project(b.position), radius = Math.max(12, b.radius * cam.scale) * (.8 + age * 3);
            c.strokeStyle = `rgba(255,183,115,${Math.max(0, .75 - age / 5)})`;
            c.lineWidth = Math.max(1, 7 - age);
            c.beginPath();
            c.arc(p.x, p.y, radius, 0, TAU);
            c.stroke();
            const rng = seededRandom(b.seed);
            c.fillStyle = '#ffcc98';
            for (let i = 0; i < 65; i++) {
                const a = rng() * TAU, r = radius * (.4 + rng() * .7);
                c.globalAlpha = Math.max(0, 1 - age / 5);
                c.beginPath();
                c.arc(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * .7, Math.max(.7, 2 - age * .3), 0, TAU);
                c.fill();
            }
            c.globalAlpha = 1;
        }
        if (this.measurement?.length) {
            const a = cam.project(this.measurement[0]), b = this.measurement[1] ? cam.project(this.measurement[1]) : a;
            c.strokeStyle = '#d8c698';
            c.setLineDash([4, 4]);
            c.beginPath();
            c.moveTo(a.x, a.y);
            c.lineTo(b.x, b.y);
            c.stroke();
            c.setLineDash([]);
            if (this.measurement[1]) {
                const d = length(sub(this.measurement[0], this.measurement[1]));
                c.font = '11px monospace';
                c.fillStyle = '#efdfb3';
                c.textAlign = 'center';
                c.fillText(`${d.toPrecision(4)} AU · ${(d * 499.005 / 60).toPrecision(3)} light-min`, (a.x + b.x) / 2, (a.y + b.y) / 2 - 10);
            }
        }
        if (this.launchPreview) {
            const { from, to } = this.launchPreview;
            c.strokeStyle = '#e5bf8b';
            c.lineWidth = 1.5;
            c.setLineDash([5, 4]);
            c.beginPath();
            c.moveTo(from[0], from[1]);
            c.lineTo(to[0], to[1]);
            c.stroke();
            c.setLineDash([]);
        }
        // Orientation triad and a physical scale bar.
        const origin = { x: 35, y: h - 36 }, axes = [[1, 0, 0, '#d98f88', 'X'], [0, 1, 0, '#8ab9a1', 'Y'], [0, 0, 1, '#91a7d5', 'Z']];
        for (const a of axes) {
            const v = cam.vector(a.slice(0, 3));
            c.strokeStyle = a[3];
            c.beginPath();
            c.moveTo(origin.x, origin.y);
            c.lineTo(origin.x + v[0] * 20, origin.y - v[1] * 20);
            c.stroke();
            c.fillStyle = a[3];
            c.font = '9px system-ui';
            c.fillText(a[4], origin.x + v[0] * 27, origin.y - v[1] * 27 + 3);
        }
        const target = 90 / cam.scale, unit = 10 ** Math.floor(Math.log10(target)), dist = Math.floor(target / unit) * unit, pixels = dist * cam.scale, x = w - 130, y = h - 24;
        c.strokeStyle = '#8590a066';
        c.beginPath();
        c.moveTo(x, y - 4);
        c.lineTo(x, y);
        c.lineTo(x + pixels, y);
        c.lineTo(x + pixels, y - 4);
        c.stroke();
        c.fillStyle = '#8190a5';
        c.font = '10px monospace';
        c.textAlign = 'left';
        c.fillText(dist < .01 ? `${(dist * AU_KM).toPrecision(3)} km` : `${dist.toPrecision(2)} AU`, x, y - 10);
    }
    /** Stable priority placement keeps dense inner systems legible without changing world positions. */
    drawLabels() {
        const c = this.ctx, cam = this.camera;
        const bodies = this.projected.filter(p => !p.body.tracer);
        const ordered = [...bodies].sort((a, b) => Number(b.body.id === this.selected) - Number(a.body.id === this.selected) || b.body.mass - a.body.mass || a.body.id - b.body.id);
        const occupied = [], intersects = (a, b) => a.x < b.x + b.w + 4 && a.x + a.w + 4 > b.x && a.y < b.y + b.h + 4 && a.y + a.h + 4 > b.y;
        this.labelPlacements = [];
        for (const p of ordered) {
            const selected = p.body.id === this.selected;
            c.font = `${selected ? '500' : '400'} 11px Inter, system-ui, sans-serif`;
            const text = p.body.name, width = c.measureText(text).width, height = 14, r = p.r + 11;
            const candidates = [];
            for (const dy of [0, -20, 20, -40, 40, -60, 60]) {
                candidates.push({ x: p.x + r, y: p.y - 7 + dy, w: width, h: height });
                candidates.push({ x: p.x - r - width, y: p.y - 7 + dy, w: width, h: height });
            }
            candidates.push({ x: p.x - width / 2, y: p.y - r - height, w: width, h: height }, { x: p.x - width / 2, y: p.y + r, w: width, h: height });
            const rect = candidates.find(a => a.x > 8 && a.y > 80 && a.x + a.w < cam.width - 8 && a.y + a.h < cam.height - 54 && !occupied.some(b => intersects(a, b)) && !bodies.some(b => intersects(a, { x: b.x - b.r - 2, y: b.y - b.r - 2, w: 2 * b.r + 4, h: 2 * b.r + 4 })));
            if (!rect)
                continue;
            occupied.push(rect);
            this.labelPlacements.push({ ...rect, id: p.body.id });
            if (Math.abs(rect.y + 7 - p.y) > 12) {
                const ex = Math.max(rect.x, Math.min(p.x, rect.x + rect.w)), ey = rect.y + 7;
                const dx = ex - p.x, dy = ey - p.y, d = Math.hypot(dx, dy) || 1;
                c.strokeStyle = selected ? '#b7a4ee60' : '#8190a540';
                c.lineWidth = .7;
                c.beginPath();
                c.moveTo(p.x + dx / d * (p.r + 3), p.y + dy / d * (p.r + 3));
                c.lineTo(ex, ey);
                c.stroke();
            }
            c.textAlign = 'left';
            c.fillStyle = selected ? '#e6e0fa' : '#9dabc0';
            c.shadowBlur = 4;
            c.shadowColor = '#050713';
            c.fillText(text, rect.x, rect.y + 11);
            c.shadowBlur = 0;
        }
    }
    pick(x, y) { let best = null, dist = Infinity; for (const p of this.projected) {
        if (p.body.tracer && p.r < 2)
            continue;
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < Math.max(p.r + 9, 14) && d < dist) {
            best = p.body;
            dist = d;
        }
    } return best; }
    async screenshot() { const out = document.createElement('canvas'); out.width = this.canvas.width; out.height = this.canvas.height; const c = out.getContext('2d'); c.drawImage(this.canvas, 0, 0); c.drawImage(this.overlay, 0, 0); return new Promise(resolve => out.toBlob(resolve, 'image/png')); }
    destroy() { this.storage?.destroy(); this.uniform?.destroy(); this.context?.unconfigure(); }
}
