import fs from 'node:fs';
const deps = {
    math: [], core: ['math'], gravity: ['math'], collisions: ['math', 'core'], thermal: ['math'],
    celestial: ['math', 'core'], kernels: [], gpu: ['kernels'], renderer: ['math', 'kernels', 'gpu'],
    ui: [], persistence: ['core'], simulation: ['math', 'core', 'gravity', 'collisions', 'thermal', 'persistence']
};
const map = {};
for (const [name, names] of Object.entries(deps)) {
    const pkg = { name: `@orbitarium/${name}`, version: '0.1.0', description: `Orbitarium standalone ${name} package`, type: 'module', license: 'MIT', exports: { '.': './src/index.js' }, files: ['src', 'README.md'], sideEffects: false };
    if (names.length)
        pkg.dependencies = Object.fromEntries(names.map(n => [`@orbitarium/${n}`, '0.1.0']));
    if (name === 'kernels')
        pkg.exports['./*.wgsl'] = './src/*.wgsl';
    fs.writeFileSync(`packages/${name}/package.json`, JSON.stringify(pkg, null, 2) + '\n');
    map[`@orbitarium/${name}`] = `./packages/${name}/src/index.js`;
    fs.mkdirSync('node_modules/@orbitarium', { recursive: true });
    try {
        fs.symlinkSync(`../../packages/${name}`, `node_modules/@orbitarium/${name}`, 'dir');
    }
    catch { }
}
fs.writeFileSync('app/importmap.json', JSON.stringify({ imports: map }, null, 2));
