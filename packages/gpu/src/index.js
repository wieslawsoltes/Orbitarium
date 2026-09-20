import { loadKernel } from '@orbitarium/kernels';
export async function createGPUDevice() {
    if (!globalThis.navigator?.gpu)
        return { device: null, reason: 'WebGPU unavailable; using the CPU and Canvas renderer.' };
    try {
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (!adapter)
            return { device: null, reason: 'No WebGPU adapter available.' };
        const device = await adapter.requestDevice();
        return { device, adapter, reason: null };
    }
    catch (e) {
        return { device: null, reason: e.message };
    }
}
export async function checkedModule(device, code, label) { const module = device.createShaderModule({ code, label }); const info = await module.getCompilationInfo(); const errors = info.messages.filter(m => m.type === 'error'); if (errors.length)
    throw new Error(`${label}: ${errors.map(e => `${e.lineNum}:${e.linePos} ${e.message}`).join('\n')}`); return module; }
/** GPU-resident substep batch with one staging-buffer readback, then explicit CPU reconciliation. */
export class GPUGravity {
    constructor(device) { this.device = device; this.available = false; this.capacity = 0; this.busy = false; this.bufferA = null; this.bufferB = null; this.readback = null; this.params = null; }
    async init() {
        const d = this.device;
        const code = await loadKernel('gravity');
        const module = await checkedModule(d, code, 'Tiled N-body gravity');
        this.layout = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }] });
        const layout = d.createPipelineLayout({ bindGroupLayouts: [this.layout] });
        this.drift = await d.createComputePipelineAsync({ label: 'Velocity Verlet: kick + drift', layout, compute: { module, entryPoint: 'drift' } });
        this.kick = await d.createComputePipelineAsync({ label: 'Velocity Verlet: finish kick', layout, compute: { module, entryPoint: 'kick' } });
        this.params = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        this.available = true;
        return this;
    }
    reserve(n) { if (n <= this.capacity)
        return; this.bufferA?.destroy(); this.bufferB?.destroy(); this.readback?.destroy(); this.capacity = Math.max(64, 2 ** Math.ceil(Math.log2(n))); const size = this.capacity * 32, d = this.device; this.packed = new Float32Array(this.capacity * 8); this.bufferA = d.createBuffer({ label: 'Gravity A', size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC }); this.bufferB = d.createBuffer({ label: 'Gravity B', size, usage: GPUBufferUsage.STORAGE }); this.readback = d.createBuffer({ label: 'Gravity staging', size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }); const bind = (a, b) => d.createBindGroup({ layout: this.layout, entries: [{ binding: 0, resource: { buffer: a } }, { binding: 1, resource: { buffer: b } }, { binding: 2, resource: { buffer: this.params } }] }); this.ab = bind(this.bufferA, this.bufferB); this.ba = bind(this.bufferB, this.bufferA); }
    async step(s, dt, steps, g, epsilon) {
        if (this.busy)
            throw new Error('GPU gravity batches must be serialized');
        if (!s.count)
            return;
        this.busy = true;
        try {
            this.reserve(s.count);
            const d = this.device, n = s.count;
            for (let i = 0; i < n; i++) {
                const a = i * 8, p = i * 3;
                this.packed.set(s.position.subarray(p, p + 3), a);
                this.packed[a + 3] = s.mass[i];
                this.packed.set(s.velocity.subarray(p, p + 3), a + 4);
                this.packed[a + 7] = s.radius[i];
            }
            d.queue.writeBuffer(this.bufferA, 0, this.packed, 0, n * 8);
            const params = new ArrayBuffer(16), view = new DataView(params);
            view.setUint32(0, n, true);
            view.setFloat32(4, dt, true);
            view.setFloat32(8, g, true);
            view.setFloat32(12, epsilon * epsilon, true);
            d.queue.writeBuffer(this.params, 0, params);
            const encoder = d.createCommandEncoder({ label: 'N-body batch' });
            for (let i = 0; i < steps; i++) {
                let pass = encoder.beginComputePass();
                pass.setPipeline(this.drift);
                pass.setBindGroup(0, this.ab);
                pass.dispatchWorkgroups(Math.ceil(n / 64));
                pass.end();
                pass = encoder.beginComputePass();
                pass.setPipeline(this.kick);
                pass.setBindGroup(0, this.ba);
                pass.dispatchWorkgroups(Math.ceil(n / 64));
                pass.end();
            }
            encoder.copyBufferToBuffer(this.bufferA, 0, this.readback, 0, n * 32);
            d.queue.submit([encoder.finish()]);
            await this.readback.mapAsync(GPUMapMode.READ, 0, n * 32);
            try {
                const data = new Float32Array(this.readback.getMappedRange(0, n * 32));
                for (let i = 0; i < n; i++) {
                    for (let k = 0; k < 3; k++) {
                        const p = data[i * 8 + k], v = data[i * 8 + 4 + k];
                        if (!Number.isFinite(p) || !Number.isFinite(v))
                            throw new Error('GPU precision overflow; reduce scale or use the Float64 solver');
                    }
                }
                for (let i = 0; i < n; i++) {
                    s.position.set(data.subarray(i * 8, i * 8 + 3), i * 3);
                    s.velocity.set(data.subarray(i * 8 + 4, i * 8 + 7), i * 3);
                }
            }
            finally {
                this.readback.unmap();
            }
        }
        finally {
            this.busy = false;
        }
    }
    destroy() { this.available = false; for (const b of [this.bufferA, this.bufferB, this.readback, this.params])
        b?.destroy(); }
}
