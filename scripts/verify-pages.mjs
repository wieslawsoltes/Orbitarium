/** Validate the shipped site's relative URLs for a /Orbitarium/ project-site base. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('dist');
const base = new URL('https://wieslawsoltes.github.io/Orbitarium/');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const mapText = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1];
assert.ok(mapText, 'The module import map is missing.');
const imports = JSON.parse(mapText).imports;
assert.equal(Object.keys(imports).length, 12, 'All twelve standalone packages must be mapped.');
const refs = [
  ...Object.values(imports),
  ...Array.from(html.matchAll(/(?:src|href)="([^"#]+)"/g), m => m[1])
    .filter(ref => !/^(?:https?:|data:|mailto:)/.test(ref)),
];
for (const ref of refs) {
  const url = new URL(ref, base);
  assert.equal(url.origin, base.origin, `External dependency: ${ref}`);
  assert.ok(url.pathname.startsWith(base.pathname), `Escapes the project-site base: ${ref}`);
  const file = path.resolve(root, decodeURIComponent(url.pathname.slice(base.pathname.length)));
  assert.ok(file.startsWith(root + path.sep), `Path escapes dist/: ${ref}`);
  assert.ok(fs.statSync(file).isFile(), `Missing asset: ${ref}`);
}
for (const shader of ['background', 'bodies', 'gravity']) {
  assert.ok(fs.statSync(path.join(root, 'packages/kernels/src', `${shader}.wgsl`)).size > 100,
    `Missing WGSL shader: ${shader}`);
}
assert.ok(fs.existsSync(path.join(root, '.nojekyll')));
assert.ok(fs.statSync(path.join(root, 'orbitarium-standalone.html')).size > 100_000);
function checkTree(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    assert.ok(!entry.isSymbolicLink(), `Pages artifacts cannot contain symlinks: ${entry.name}`);
    assert.notEqual(entry.name, 'node_modules', 'Workspace installation leaked into dist/.');
    if (entry.isDirectory()) checkTree(path.join(dir, entry.name));
  }
}
checkTree(root);
if (process.env.GITHUB_SHA) {
  assert.equal(fs.readFileSync(path.join(root, 'revision.txt'), 'utf8').trim(), process.env.GITHUB_SHA);
}
console.log(`Pages verified: ${refs.length} local references, twelve packages, three WGSL shaders, /Orbitarium/ base.`);
