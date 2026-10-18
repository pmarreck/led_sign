import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	DEFAULTS, MAX_COLS, MAX_TEXT_COLS, normalize, rowsForZoom, viewport, ledGeometry,
	save, restore, saveMessages, restoreMessages, addMessage, removeMessage, recordHistory, restoreHistory, saveHistory, HISTORY_LIMIT, parseShare, shareHash, textFits,
} from '../../web/model.mjs';

test('settings sanitize untrusted storage without losing Unicode', () => {
	const s = normalize({ text: '你好 🚀', speed: -4, zoom: 99, hue: NaN, blink: 'yes', font: 'url(evil)', shape: 'hexagon' });
	assert.equal(s.text, '你好 🚀');
	assert.equal(s.speed, 0); assert.equal(s.zoom, 1); assert.equal(s.hue, 170);
	assert.equal(s.blink, false); assert.equal(s.font, 'mono'); assert.equal(s.shape, 'square');
	assert.deepEqual(normalize(null), DEFAULTS);
	assert.equal(normalize({ text: 42 }).text, DEFAULTS.text);
	assert.equal(normalize({ text: '' }).text, '');
	assert.equal(normalize({ __proto__: { blink: true } }).blink, false);
});

test('defaults keep flashing off and a calm static-safe sign', () => {
	assert.equal(DEFAULTS.blink, false);
	assert.equal(DEFAULTS.repeat, true);
	assert.equal(DEFAULTS.startOnRotation, false);
});

test('long messages are kept whole, never shortened by normalization', () => {
	const long = 'x'.repeat(50000);
	assert.equal(normalize({ text: long }).text.length, 50000);
	assert.equal(textFits(MAX_TEXT_COLS), true);
	assert.equal(textFits(MAX_TEXT_COLS + 1), false);
});

test('zoom maps monotonically onto LED row counts within the core bounds', () => {
	assert.equal(rowsForZoom(0), 32);
	assert.equal(rowsForZoom(1), 8);
	let prev = Infinity;
	for (let z = 0; z <= 1; z += 0.05) { const r = rowsForZoom(z); assert.ok(r <= prev && r >= 8 && r <= 64); prev = r; }
});

test('viewport uses one integer device-pixel cell size; cells stay square in every orientation and DPR', () => {
	const sizes = [[393, 852], [852, 393], [1920, 1080], [320, 568], [430, 932], [932, 430], [1024, 1366], [3840, 600]];
	for (const [w, h] of sizes) for (const dpr of [1, 2, 3, 2.625]) for (const rows of [8, 16, 32]) {
		const v = viewport(w, h, dpr, rows);
		assert.equal(v.rows, rows);
		assert.ok(Number.isInteger(v.cell) && v.cell >= 1);
		assert.ok(v.cols >= 1 && v.cols <= MAX_COLS);
		assert.equal(v.width, v.cols * v.cell); assert.equal(v.height, v.rows * v.cell);
		assert.ok(v.width <= Math.floor(w * dpr) && v.height <= Math.floor(h * dpr));
		// Same CSS size per LED horizontally and vertically: square, uniform scale.
		assert.ok(Math.abs(v.cssWidth / v.cols - v.cssHeight / v.rows) < 1e-9);
		// Largest integer cell that fits the rows; columns fill the width.
		assert.ok((v.cell + 1) * rows > Math.floor(h * dpr));
		assert.ok(Math.floor(w * dpr) - v.width < v.cell || v.cols === MAX_COLS);
		assert.ok(v.left >= 0 && v.top >= 0);
		assert.ok(Math.abs(v.left * 2 + v.cssWidth - w) < 1e-9 && Math.abs(v.top * 2 + v.cssHeight - h) < 1e-9);
	}
	for (const bad of [[0, 10, 1, 8], [10, 0, 1, 8], [10, 10, 0, 8], [NaN, 10, 1, 8], [100, 100, 1, 0], [100, 100, 1, 65], [100, 4, 1, 8]])
		assert.throws(() => viewport(...bad), RangeError, String(bad));
});

test('LED geometry keeps square lights square and round dots circular', () => {
	for (let cell = 1; cell <= 200; cell++) {
		const sq = ledGeometry(cell, 'square');
		assert.equal(sq.size, cell - 2 * sq.inset);
		assert.ok(sq.size >= 1 && sq.inset >= 0);
		const rd = ledGeometry(cell, 'round');
		assert.ok(rd.radius > 0 && rd.radius <= cell / 2);
		assert.equal(rd.center, cell / 2);
	}
	assert.equal(ledGeometry(1, 'square').inset, 0);
	assert.ok(ledGeometry(100, 'square').inset > 0);
});

test('blocked and corrupt storage do not prevent using the sign', () => {
	const denied = { getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); } };
	assert.equal(restore(denied).text, DEFAULTS.text);
	assert.equal(save(denied, normalize({})), false);
	assert.equal(restore({ getItem: () => '{broken' }).text, DEFAULTS.text);
	assert.equal(restore(undefined).text, DEFAULTS.text);
	assert.deepEqual(restoreMessages(denied), []);
	assert.equal(saveMessages(denied, ['a']), false);
	const store = new Map(); const io = { setItem: (k, v) => store.set(k, v), getItem: (k) => store.get(k) ?? null };
	assert.equal(save(io, normalize({ text: '🚀', shape: 'round' })), true);
	assert.equal(restore(io).text, '🚀'); assert.equal(restore(io).shape, 'round');
	assert.equal(saveMessages(io, ['one', 'two']), true);
	assert.deepEqual(restoreMessages(io), ['one', 'two']);
	assert.deepEqual(restoreMessages({ getItem: () => '[1,"ok",null,"ok"]' }), ['ok']);
});

test('saved messages are most-recent-first and deduplicated', () => {
	assert.deepEqual(addMessage(['a', 'b'], 'b'), ['b', 'a']);
	assert.deepEqual(addMessage(['a'], '  '), ['a']);
	assert.deepEqual(removeMessage(['a', 'b', 'c'], 'b'), ['a', 'c']);
	const input = ['a']; addMessage(input, 'z'); assert.deepEqual(input, ['a']);
});

test('history keeps the most recent distinct messages, newest first, capped', () => {
	assert.equal(HISTORY_LIMIT, 20);
	assert.deepEqual(recordHistory(['a', 'b'], 'b'), ['b', 'a']);
	assert.deepEqual(recordHistory(['a'], ' \n'), ['a']);
	let list = [];
	for (let i = 0; i < HISTORY_LIMIT + 5; i++) list = recordHistory(list, `m${i}`);
	assert.equal(list.length, HISTORY_LIMIT);
	assert.equal(list[0], `m${HISTORY_LIMIT + 4}`);
	assert.equal(list.at(-1), 'm5');
	const input = ['a']; recordHistory(input, 'z'); assert.deepEqual(input, ['a']);
});

test('history persists separately from saved messages and survives bad storage', () => {
	const store = new Map(); const io = { setItem: (k, v) => store.set(k, v), getItem: (k) => store.get(k) ?? null };
	assert.equal(saveHistory(io, ['shown']), true);
	assert.equal(saveMessages(io, ['kept']), true);
	assert.deepEqual(restoreHistory(io), ['shown']);
	assert.deepEqual(restoreMessages(io), ['kept']);
	const many = Array.from({ length: 30 }, (_, i) => `x${i}`);
	assert.deepEqual(restoreHistory({ getItem: () => JSON.stringify(many) }), many.slice(0, HISTORY_LIMIT));
	assert.deepEqual(restoreHistory({ getItem: () => '[1,"ok",null,"ok"]' }), ['ok']);
	assert.deepEqual(restoreHistory({ getItem: () => '{broken' }), []);
	const denied = { getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); } };
	assert.deepEqual(restoreHistory(denied), []);
	assert.equal(saveHistory(denied, ['a']), false);
});

test('share links round-trip Unicode text and the show flag', () => {
	for (const text of ['HELLO', '你好 🚀', 'a&b=c#d%', '']) {
		for (const show of [true, false]) assert.deepEqual(parseShare(shareHash(text, show)), { text, show });
	}
	assert.equal(parseShare(''), null);
	assert.equal(parseShare('#nothing=1'), null);
});

test('flag bits map one-to-one onto the WASM ABI bits', async () => {
	const { flagsFor, FLAG } = await import('../../web/model.mjs');
	const names = ['repeat', 'mirror', 'blink', 'invert', 'trueBlack'];
	assert.deepEqual(names.map((n) => FLAG[n]), [1, 2, 4, 8, 16]);
	const seen = new Set();
	for (let bits = 0; bits < 32; bits++) {
		const s = normalize(Object.fromEntries(names.map((n, i) => [n, Boolean(bits & (1 << i))])));
		assert.equal(flagsFor(s), bits);
		seen.add(flagsFor(s));
	}
	assert.equal(seen.size, 32);
});

test('portrait display rotates a landscape sign unless portrait is allowed; LEDs stay square', async () => {
	const { displayLayout } = await import('../../web/model.mjs');
	const portrait = displayLayout(393, 852, 3, 16, false);
	assert.equal(portrait.rotate, true);
	assert.ok(portrait.cols > portrait.rows);
	assert.ok(portrait.cssWidth <= 852 && portrait.cssHeight <= 393);
	const upright = displayLayout(393, 852, 3, 16, true);
	assert.equal(upright.rotate, false);
	assert.ok(upright.cssWidth <= 393);
	assert.equal(displayLayout(852, 393, 3, 16, false).rotate, false);
	for (const v of [portrait, upright]) assert.ok(Math.abs(v.cssWidth / v.cols - v.cssHeight / v.rows) < 1e-9);
});

test('LED tile alpha is exactly symmetric under transpose and both mirrors', async () => {
	const { ledTileAlpha } = await import('../../web/model.mjs');
	for (let cell = 1; cell <= 120; cell++) for (const shape of ['square', 'round']) {
		const a = ledTileAlpha(cell, shape);
		assert.equal(a.length, cell * cell);
		for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
			const v = a[y * cell + x];
			assert.equal(a[x * cell + y], v, `transpose ${shape} ${cell}`);
			assert.equal(a[y * cell + (cell - 1 - x)], v, `mirror ${shape} ${cell}`);
			assert.equal(a[(cell - 1 - y) * cell + x], v, `flip ${shape} ${cell}`);
		}
		const center = a[Math.floor(cell / 2) * cell + Math.floor(cell / 2)];
		if (cell >= 6) assert.equal(center, 255, `${shape} ${cell} lit at center`);
		else assert.ok(center > 127, `${shape} ${cell} mostly lit`);
	}
	const sq = ledTileAlpha(50, 'square'), rd = ledTileAlpha(50, 'round');
	assert.equal(rd[0], 0); assert.equal(sq[0], 0);
	const sum = (t) => t.reduce((s, v) => s + v, 0);
	assert.ok(sum(rd) < sum(sq));
	// Round coverage approximates the circle area pi*r^2 within 2%.
	const r = ledGeometry(50, 'round').radius;
	assert.ok(Math.abs(sum(rd) / 255 / (Math.PI * r * r) - 1) < 0.02);
});
