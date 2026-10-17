#!/usr/bin/env node
// Minimal static file server for dist/ (local preview and browser tests).
// Serves only files inside the root; no directory listings.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = {
	'.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.png': 'image/png',
	'.webmanifest': 'application/manifest+json',
};

export function serve(root, { port = 0, host = '127.0.0.1' } = {}) {
	const base = resolve(root);
	const server = createServer(async (req, res) => {
		let path;
		try {
			path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
		} catch {
			res.writeHead(400).end();
			return;
		}
		const file = resolve(join(base, path.endsWith('/') ? `${path}index.html` : path));
		if (file !== base && !file.startsWith(base + sep)) { res.writeHead(403).end(); return; }
		try {
			const body = await readFile(file);
			res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
			res.end(body);
		} catch {
			res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
		}
	});
	return new Promise((ok) => server.listen(port, host, () => ok(server)));
}

// Node resolves symlinks for the module URL but not argv[1], so compare real
// paths; otherwise launching through a symlinked directory silently exits.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const port = Number(process.env.PORT ?? 8417);
	const host = process.env.HOST ?? '127.0.0.1';
	const server = await serve(process.argv[2] ?? 'dist', { port, host });
	console.error(`LED Sign preview: http://${host}:${server.address().port}/`);
}
