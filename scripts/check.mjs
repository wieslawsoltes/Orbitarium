import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const files = [...walk('packages'), ...walk('app'), ...walk('scripts')].filter(f => /\.m?js$/.test(f));
let failed = 0;
for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) {
        console.error(result.stderr);
        failed++;
    }
}
console.log(`${files.length} JavaScript modules syntax checked; ${failed} failures.`);
process.exitCode = failed ? 1 : 0;
