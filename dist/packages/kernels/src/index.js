export const kernelURL = name => new URL(`./${name}.wgsl`, import.meta.url);
export async function loadKernel(name) { if (!['gravity', 'bodies', 'background'].includes(name))
    throw new Error(`Unknown kernel ${name}`); const response = await fetch(kernelURL(name)); if (!response.ok)
    throw new Error(`Could not load ${name}: HTTP ${response.status}`); return response.text(); }
