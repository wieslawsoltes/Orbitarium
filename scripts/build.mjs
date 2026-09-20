import fs from 'node:fs';
import path from 'node:path';
const out = 'dist';
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const item of ['index.html', 'app', 'packages', 'LICENSE'])
    fs.cpSync(item, path.join(out, item), { recursive: true });
const data = (source, type = 'text/javascript') => `data:${type};base64,${Buffer.from(source).toString('base64')}`;
const imports = {};
for (const entry of fs.readdirSync('packages')) {
    const pkg = `packages/${entry}`;
    if (!fs.existsSync(`${pkg}/src/index.js`))
        continue;
    let source = fs.readFileSync(`${pkg}/src/index.js`, 'utf8');
    if (entry === 'renderer') {
        const camera = fs.readFileSync(`${pkg}/src/camera.js`, 'utf8');
        source = source.replace("'./camera.js'", JSON.stringify(data(camera)));
    }
    if (entry === 'kernels') {
        const shaders = Object.fromEntries(['gravity', 'background', 'bodies'].map(name => [name, fs.readFileSync(`packages/kernels/src/${name}.wgsl`, 'utf8')]));
        source = `const shaders=${JSON.stringify(shaders)};export const kernelURL=name=>new URL('data:text/plain;charset=utf-8,'+encodeURIComponent(shaders[name]));export async function loadKernel(name){if(!(name in shaders))throw new Error('Unknown shader '+name);return shaders[name];}`;
    }
    imports[`@orbitarium/${entry}`] = data(source);
}
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, `<script type="importmap">${JSON.stringify({ imports })}</script>`);
html = html.replace('<link rel="stylesheet" href="./app/styles.css">', () => `<style>${fs.readFileSync('app/styles.css', 'utf8')}</style>`);
html = html.replace('href="./app/icon.svg"', `href="${data(fs.readFileSync('app/icon.svg', 'utf8'), 'image/svg+xml')}"`);
html = html.replace('<script type="module" src="./app/main.js"></script>', () => `<script type="module">${fs.readFileSync('app/main.js', 'utf8').replaceAll('</script', '<\\/script')}</script>`);
fs.writeFileSync('orbitarium-standalone.html', html);
fs.writeFileSync(path.join(out, 'orbitarium-standalone.html'), html);
fs.writeFileSync(path.join(out, '.nojekyll'), '');
// A deployment-only marker lets the publishing helper verify the exact live commit.
// Local builds omit it so checked-in distribution files remain deterministic.
if (process.env.GITHUB_SHA) {
    if (!/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA)) throw new Error('Invalid GITHUB_SHA.');
    fs.writeFileSync(path.join(out, 'revision.txt'), process.env.GITHUB_SHA + '\n');
}
console.log(`Built static distribution and standalone HTML (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB). Zero runtime dependencies.`);
