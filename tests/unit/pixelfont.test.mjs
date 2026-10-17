// Built-in LED pixel font: glyph table integrity over the whole printable ASCII
// set, whole-LED scaling (the uneven-stem bug), layout and system fallback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLYPHS, GLYPH_ROWS, GLYPH_COLS, pixelScale, pixelRaster } from '../../web/pixelfont.mjs';

const PRINTABLE = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i));
const noFallback = () => assert.fail('fallback must not be used for ASCII');

// Lit columns of one mask row as [start, length] runs.
function runs(r, row) {
	const out = [];
	for (let x = 0; x < r.cols; x++) {
		if (r.alpha[row * r.cols + x] && (x === 0 || !r.alpha[row * r.cols + x - 1])) out.push([x, 0]);
		if (r.alpha[row * r.cols + x]) out[out.length - 1][1]++;
	}
	return out;
}

test('glyph table covers exactly printable ASCII with well-formed 5x9 bitmaps', () => {
	assert.deepEqual([...GLYPHS.keys()].sort(), [...PRINTABLE].sort());
	for (const [ch, rows] of GLYPHS) {
		assert.equal(rows.length, GLYPH_ROWS, `rows of ${JSON.stringify(ch)}`);
		for (const row of rows) assert.match(row, new RegExp(`^[.#]{${GLYPH_COLS}}$`), `row of ${JSON.stringify(ch)}`);
	}
});

test('every glyph except space has ink and no two glyphs are identical', () => {
	const seen = new Map();
	for (const [ch, rows] of GLYPHS) {
		const key = rows.join('/');
		if (ch !== ' ') assert.ok(key.includes('#'), `${JSON.stringify(ch)} is blank`);
		assert.ok(!seen.has(key), `${JSON.stringify(ch)} duplicates ${JSON.stringify(seen.get(key))}`);
		seen.set(key, ch);
	}
});

test('only true descenders use the two rows below the baseline', () => {
	const descending = PRINTABLE.filter((ch) => GLYPHS.get(ch).slice(7).join('').includes('#'));
	assert.deepEqual(descending.sort(), [',', '_', 'g', 'j', 'p', 'q', 'y'].sort());
});

test('scale is the largest whole number of LEDs per font pixel that fits', () => {
	for (let rows = 1; rows <= 64; rows++) {
		const k = pixelScale(rows);
		assert.ok(Number.isInteger(k) && k >= 1, `rows ${rows}`);
		if (rows >= GLYPH_ROWS) assert.ok(k * GLYPH_ROWS <= rows && (k + 1) * GLYPH_ROWS > rows, `rows ${rows}`);
		else assert.equal(k, 1);
	}
});

test('both stems of H are exactly one scaled pixel wide at every sign height', () => {
	for (let rows = 8; rows <= 32; rows++) {
		const k = pixelScale(rows);
		const r = pixelRaster('H', rows, 8192, noFallback);
		const top = Math.max(0, Math.floor((rows - GLYPH_ROWS * k) / 2));
		assert.deepEqual(runs(r, top + k), [[0, k], [4 * k, k]], `rows ${rows}`);
	}
});

test('repeated characters render identically, one scaled pixel apart', () => {
	const rows = 20, k = pixelScale(rows);
	const r = pixelRaster('HEH', rows, 8192, noFallback);
	assert.equal(r.cols, 3 * GLYPH_COLS * k + 2 * k);
	const block = (start) => { const b = []; for (let y = 0; y < rows; y++) for (let x = 0; x < GLYPH_COLS * k; x++) b.push(r.alpha[y * r.cols + start + x]); return b.join(','); };
	assert.equal(block(0), block(2 * (GLYPH_COLS + 1) * k));
	assert.ok([...r.alpha].every((a) => a === 0 || a === 255));
});

test('glyphs are centered vertically and capitals sit above the descender rows', () => {
	const r = pixelRaster('H', 20, 8192, noFallback);
	const lit = [...Array(20).keys()].filter((y) => runs(r, y).length > 0);
	assert.deepEqual(lit, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
});

test('signs shorter than the font clip only the descender rows', () => {
	const r = pixelRaster('Hg', 8, 8192, noFallback);
	assert.equal(r.alpha.length, 8 * r.cols);
	for (let y = 0; y < 7; y++) assert.deepEqual(runs(r, y)[0], y === 3 ? [0, 5] : [0, 1], `row ${y}`);
	assert.equal(runs(r, 7).length, 1, 'only g reaches the first descender row');
});

test('runs of characters outside the font go to the fallback as one string', () => {
	const rows = 20, k = pixelScale(rows), calls = [];
	const fallback = (text, h, max) => {
		calls.push([text, h, max]);
		const cols = 7;
		return { cols, alpha: new Uint8Array(cols * h).fill(200) };
	};
	const r = pixelRaster('Aé😀B', rows, 8192, fallback);
	assert.deepEqual(calls, [['é😀', rows, 8192 - GLYPH_COLS * k - k]]);
	assert.equal(r.cols, GLYPH_COLS * k + k + 7 + k + GLYPH_COLS * k);
	assert.equal(r.alpha[GLYPH_COLS * k + k], 200);
});

test('messages wider than the limit report their width without a mask', () => {
	const k = pixelScale(20);
	assert.deepEqual(pixelRaster('HHHH', 20, 10, noFallback), { cols: 4 * GLYPH_COLS * k + 3 * k, alpha: null });
	assert.deepEqual(pixelRaster('Hé', 20, 8192, () => ({ cols: 9000, alpha: null })), { cols: GLYPH_COLS * k + k + 9000, alpha: null });
});

test('an empty message is zero columns wide', () => {
	assert.deepEqual(pixelRaster('', 20, 8192, noFallback), { cols: 0, alpha: new Uint8Array(0) });
});
