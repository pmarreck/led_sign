// Browser smoke tests: headless Chromium over the DevTools protocol loads the
// built site, then inspects the real rendered canvas pixels for square,
// uniformly scaled LEDs across phone orientations and device pixel ratios.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from '../../scripts/serve.mjs';

const BROWSER = process.env.LED_SIGN_CHROMIUM || 'chromium';
let server, browser, profile, cdp, origin;

function launch() {
	return new Promise((ok, fail) => {
		const args = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
			'--no-default-browser-check', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', 'about:blank'];
		const child = spawn(BROWSER, args, { stdio: ['ignore', 'ignore', 'pipe'] });
		let log = '';
		child.on('error', (err) => fail(new Error(`Browser smoke tests need Chromium (${BROWSER}): ${err.message}`)));
		child.stderr.on('data', (d) => {
			log += d;
			const m = /DevTools listening on (ws:\S+)/.exec(log);
			if (m) ok({ child, ws: m[1] });
		});
		child.on('exit', (code) => fail(new Error(`Chromium exited early (${code}):\n${log}`)));
	});
}

// Minimal CDP client over Node's built-in WebSocket with flattened sessions.
function connect(url) {
	const ws = new WebSocket(url);
	let id = 0;
	const pending = new Map();
	const listeners = new Set();
	ws.addEventListener('message', (ev) => {
		const msg = JSON.parse(ev.data);
		if (msg.id && pending.has(msg.id)) {
			const { ok, fail } = pending.get(msg.id);
			pending.delete(msg.id);
			if (msg.error) fail(new Error(`${msg.error.message} ${msg.error.data ?? ''}`)); else ok(msg.result);
		} else for (const l of listeners) l(msg);
	});
	const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
		pending.set(++id, { ok, fail });
		ws.send(JSON.stringify({ id, method, params, sessionId }));
	});
	const once = (method, sessionId) => new Promise((ok) => {
		const l = (msg) => { if (msg.method === method && msg.sessionId === sessionId) { listeners.delete(l); ok(msg.params); } };
		listeners.add(l);
	});
	return new Promise((ok) => ws.addEventListener('open', () => ok({ send, once, close: () => ws.close() })));
}

async function openPage(width, height, dpr, hash = '', { userAgent, preload } = {}) {
	const { browserContextId } = await cdp.send('Target.createBrowserContext');
	const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId });
	const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
	const s = (m, p) => cdp.send(m, p, sessionId);
	await s('Page.enable');
	await s('Runtime.enable');
	const page = {
		s,
		async resize(w, h, d = dpr) {
			await s('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: d, mobile: true });
		},
		async eval(expression) {
			const r = await s('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
			if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
			return r.result.value;
		},
		async reload() {
			const done = cdp.once('Page.loadEventFired', sessionId);
			await s('Page.reload', {});
			await done;
			await page.eval(READY);
		},
		close: () => cdp.send('Target.disposeBrowserContext', { browserContextId }),
	};
	await page.resize(width, height);
	if (userAgent) await s('Emulation.setUserAgentOverride', { userAgent });
	if (preload) await s('Page.addScriptToEvaluateOnNewDocument', { source: preload });
	const loaded = cdp.once('Page.loadEventFired', sessionId);
	await s('Page.navigate', { url: `${origin}/${hash}` });
	await loaded;
	await page.eval(READY);
	return page;
}

// Resolves when the app marks itself ready (or failed); no timing sleeps.
const READY = `new Promise((ok, fail) => {
	const check = () => { const r = document.documentElement.dataset.ready; if (r === '1') ok(true); else if (r) fail(new Error(document.getElementById('message-error').textContent)); else return false; return true; };
	if (!check()) new MutationObserver((_, o) => { if (check()) o.disconnect(); }).observe(document.documentElement, { attributes: true });
})`;

// Waits two animation frames so layout and one draw have happened.
const FRAMES = 'new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok(true))))';

// Reads the display canvas and summarizes LED geometry from its alpha channel:
// every cell must have the identical alpha mask, and that mask must equal its
// own transpose (true for both a square and a circle, false for any stretch).
const INSPECT = (id, rows) => `(() => {
	const c = document.getElementById(${JSON.stringify(id)});
	const r = c.getBoundingClientRect();
	const rows = ${rows};
	const cell = c.height / rows;
	const cols = c.width / cell;
	const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
	const alpha = (x, y) => data[(y * c.width + x) * 4 + 3] > 127 ? 1 : 0;
	const mask = (cx, cy) => { const m = []; for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) m.push(alpha(cx * cell + x, cy * cell + y)); return m.join(''); };
	const first = mask(0, 0);
	let uniform = true, symmetric = true;
	for (let y = 0; y < cell && symmetric; y++) for (let x = 0; x < cell; x++) if (first[y * cell + x] !== first[x * cell + y]) { symmetric = false; break; }
	for (let cy = 0; cy < rows && uniform; cy++) for (let cx = 0; cx < cols; cx++) if (mask(cx, cy) !== first) { uniform = false; break; }
	let lit = 0;
	for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] > 200) lit++;
	return { width: c.width, height: c.height, cell, cols, cssW: r.width, cssH: r.height, styleW: parseFloat(c.style.width), styleH: parseFloat(c.style.height),
		rotated: c.classList.contains('rotated'), uniform, symmetric, coverage: [...first].filter((v) => v === '1').length / (cell * cell),
		corner: first[0], center: first[Math.floor(cell / 2) * cell + Math.floor(cell / 2)], lit, dpr: devicePixelRatio, vw: innerWidth, vh: innerHeight };
})()`;

const DEFAULT_ROWS = 20; // rowsForZoom(DEFAULTS.zoom = 0.5)

function assertSquareLeds(m, label) {
	if (process.env.LED_SIGN_DUMP) console.error(label, JSON.stringify(m));
	assert.ok(Number.isInteger(m.cell) && m.cell >= 1, `${label}: integer cell (${m.cell})`);
	assert.ok(Number.isInteger(m.cols), `${label}: whole columns (${m.cols})`);
	// Browsers quantize CSS lengths (1/64 px layout units, 3-decimal style
	// serialization), so cell/dpr such as 16/3 is approximate; the backing store
	// is exact. 2e-3 relative is far below one device pixel per LED.
	const near = (a, b) => Math.abs(a / b - 1) < 2e-3;
	assert.ok(near(m.styleW / m.width, m.styleH / m.height), `${label}: uniform declared CSS scale`);
	const [rw, rh] = m.rotated ? [m.cssH, m.cssW] : [m.cssW, m.cssH];
	assert.ok(near(rw / m.width, rh / m.height), `${label}: uniform rendered scale`);
	assert.ok(near(rw * m.dpr, m.width), `${label}: one backing pixel per device pixel`);
	assert.ok(m.uniform, `${label}: every LED has the same shape`);
	assert.ok(m.symmetric, `${label}: LED shape is square-symmetric (not stretched)`);
}

before(async () => {
	server = await serve(new URL('../../dist/', import.meta.url).pathname);
	origin = `http://127.0.0.1:${server.address().port}`;
	profile = await mkdtemp(join(process.env.TMPDIR || tmpdir(), 'led-sign-chromium-'));
	const launched = await launch();
	browser = launched.child;
	cdp = await connect(launched.ws);
});

after(async () => {
	cdp?.close();
	if (browser && browser.exitCode === null) {
		const exited = new Promise((ok) => browser.once('exit', ok));
		browser.kill();
		await exited;
	}
	server?.close();
	if (profile) await rm(profile, { recursive: true, force: true });
});

test('editor loads, preview is drawn by WASM with square LEDs', { timeout: 60000 }, async () => {
	const page = await openPage(393, 852, 3);
	await page.eval(FRAMES);
	const m = await page.eval(INSPECT('preview-canvas', DEFAULT_ROWS));
	assertSquareLeds(m, 'preview');
	assert.equal(await page.eval(`document.getElementById('message-error').hidden`), true);
	await page.eval(`(() => { const s = document.getElementById('speed'); s.value = '0'; s.dispatchEvent(new Event('input')); })()`);
	await page.eval(FRAMES);
	const still = await page.eval(INSPECT('preview-canvas', DEFAULT_ROWS));
	assert.ok(still.lit > 0, 'a static message lights LEDs');
	await page.close();
});

test('display fills a portrait phone with rotated square LEDs, then landscape upright', { timeout: 60000 }, async () => {
	const page = await openPage(393, 852, 3);
	await page.eval(`document.getElementById('show').click()`);
	await page.eval(FRAMES);
	const p = await page.eval(INSPECT('sign-canvas', DEFAULT_ROWS));
	assertSquareLeds(p, 'portrait');
	assert.equal(p.rotated, true);
	assert.equal(p.height, DEFAULT_ROWS * p.cell);
	assert.ok(p.styleW <= 852 && p.styleH <= 393 && 393 * 3 - p.height < DEFAULT_ROWS, 'rotated sign fills the short edge');
	await page.resize(852, 393);
	await page.eval(FRAMES);
	const l = await page.eval(INSPECT('sign-canvas', DEFAULT_ROWS));
	assertSquareLeds(l, 'landscape');
	assert.equal(l.rotated, false);
	assert.ok(852 * 3 - l.width < l.cell, 'columns fill the width');
	for (const [w, h, d] of [[430, 932, 3], [1024, 768, 2], [800, 1280, 1.5]]) {
		await page.resize(w, h, d);
		await page.eval(FRAMES);
		await page.eval(FRAMES);
		assertSquareLeds(await page.eval(INSPECT('sign-canvas', DEFAULT_ROWS)), `${w}x${h}@${d}`);
	}
	await page.eval(`document.getElementById('exit').click()`);
	assert.equal(await page.eval(`document.getElementById('display').hidden`), true);
	await page.close();
});

test('round LEDs stay circular; square LEDs cover more of their cell', { timeout: 60000 }, async () => {
	const page = await openPage(852, 393, 3);
	await page.eval(`document.getElementById('show').click()`);
	await page.eval(FRAMES);
	const square = await page.eval(INSPECT('sign-canvas', DEFAULT_ROWS));
	await page.eval(`document.getElementById('exit').click(); document.querySelector('input[name=shape][value=round]').click()`);
	await page.eval(`document.getElementById('show').click()`);
	await page.eval(FRAMES);
	const round = await page.eval(INSPECT('sign-canvas', DEFAULT_ROWS));
	assertSquareLeds(round, 'round');
	assert.equal(round.corner, '0');
	assert.equal(round.center, '1');
	assert.ok(round.coverage < square.coverage && round.coverage > 0.5, `coverage ${round.coverage} vs ${square.coverage}`);
	await page.close();
});

test('an oversized message is refused with an explanation, never truncated', { timeout: 60000 }, async () => {
	const page = await openPage(393, 852, 3);
	const state = await page.eval(`(() => {
		const t = document.getElementById('message');
		t.value = 'W'.repeat(4000);
		t.dispatchEvent(new Event('input'));
		return { error: document.getElementById('message-error').textContent, disabled: document.getElementById('show').disabled, kept: t.value.length };
	})()`);
	assert.match(state.error, /limit is 8192/);
	assert.equal(state.disabled, true);
	assert.equal(state.kept, 4000);
	await page.close();
});

test('a share link opens straight into the sign with its text', { timeout: 60000 }, async () => {
	const page = await openPage(852, 393, 2, '#text=%E4%BD%A0%E5%A5%BD%20%F0%9F%9A%80&show=1');
	await page.eval(FRAMES);
	assert.equal(await page.eval(`document.getElementById('display').hidden`), false);
	assert.equal(await page.eval(`document.getElementById('message').value`), '你好 🚀');
	const m = await page.eval(INSPECT('sign-canvas', DEFAULT_ROWS));
	assertSquareLeds(m, 'shared');
	await page.close();
});

test('the service worker makes the site load offline', { timeout: 60000 }, async () => {
	const page = await openPage(393, 852, 3);
	await page.eval(`navigator.serviceWorker.ready.then(() => true)`);
	assert.equal(await page.eval('navigator.serviceWorker.controller !== null'), true, 'served by the service worker');
	await page.s('Network.enable');
	await page.s('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
	server.closeAllConnections();
	await page.reload();
	assert.equal(await page.eval(`document.documentElement.dataset.ready`), '1');
	await page.close();
});

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

test('iPhone Safari gets an obvious Add to Home Screen button with Share-menu steps', { timeout: 60000 }, async () => {
	const page = await openPage(393, 852, 3, '', { userAgent: IPHONE_UA });
	const state = await page.eval(`(() => {
		const button = document.getElementById('install-open');
		button.click();
		const r = button.getBoundingClientRect();
		return { hidden: button.hidden, onScreen: r.top >= 0 && r.bottom <= innerHeight && r.width > 0, open: document.getElementById('install').open,
			ios: !document.getElementById('install-ios').hidden, other: !document.getElementById('install-other').hidden,
			steps: document.querySelectorAll('#install-ios .steps li').length, text: document.getElementById('install-ios').textContent };
	})()`);
	assert.equal(state.hidden, false);
	assert.ok(state.onScreen, 'install button is visible without scrolling');
	assert.equal(state.open, true);
	assert.equal(state.ios, true);
	assert.equal(state.other, false);
	assert.equal(state.steps, 3);
	assert.match(state.text, /Share/);
	assert.match(state.text, /Add to Home Screen/);
	await page.close();
});

test('an installed (standalone) app hides the install button', { timeout: 60000 }, async () => {
	const page = await openPage(393, 852, 3, '', { userAgent: IPHONE_UA, preload: `Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true })` });
	assert.equal(await page.eval('navigator.standalone'), true, 'iOS Home Screen signal applied');
	assert.equal(await page.eval(`document.getElementById('install-open').hidden`), true);
	await page.close();
});
