import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
const port = Number(process.env.PORT || 4173), root = resolve(process.env.SERVE_DIR || '.');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.wgsl': 'text/plain; charset=utf-8', '.png': 'image/png', '.md': 'text/plain; charset=utf-8' };
const server = createServer((req, res) => { try {
    const url = new URL(req.url, 'http://localhost');
    let file = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (file !== root && !file.startsWith(root + sep)) {
        res.writeHead(403);
        return res.end('Forbidden');
    }
    if (existsSync(file) && statSync(file).isDirectory())
        file = resolve(file, 'index.html');
    if (!existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404);
        return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
    createReadStream(file).pipe(res);
}
catch {
    res.writeHead(400);
    res.end('Bad request');
} });
server.listen(port, '0.0.0.0', () => console.log(`Orbitarium: http://localhost:${port}`));
