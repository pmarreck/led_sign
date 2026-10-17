import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const wasmPath = new URL('../../dist/led-sign.wasm', import.meta.url);
const { instance } = await WebAssembly.instantiate(await readFile(wasmPath));
const e = instance.exports;
const REPEAT = 1, MIRROR = 2, BLINK = 4, INVERT = 8, TRUE_BLACK = 16;

function frame(n, cols, rows) {
	assert.equal(n, cols * rows * 4);
	return Array.from(new Uint8Array(e.memory.buffer, e.frame_ptr(), n));
}
function setMask(textCols, rows, lit) {
	const mask = new Uint8Array(e.memory.buffer, e.mask_ptr(), e.mask_capacity());
	mask.fill(0, 0, textCols * rows);
	for (const [x, y] of lit) mask[y * textCols + x] = 255;
}
const render = (o = {}) => e.render(o.t ?? 0, o.cols ?? 24, o.rows ?? 8, o.text ?? 2, o.speed ?? 0, o.hue ?? 15, 1, 1, o.flags ?? (REPEAT | TRUE_BLACK));

test('exported buffers match the documented capacities', () => {
	assert.equal(e.mask_capacity(), 8192 * 64);
	assert.equal(e.frame_capacity(), 960 * 64 * 4);
	assert.ok(e.mask_ptr() + e.mask_capacity() <= e.memory.buffer.byteLength);
	assert.ok(e.frame_ptr() + e.frame_capacity() <= e.memory.buffer.byteLength);
	const [m0, m1, f0, f1] = [e.mask_ptr(), e.mask_ptr() + e.mask_capacity(), e.frame_ptr(), e.frame_ptr() + e.frame_capacity()];
	assert.ok(m1 <= f0 || f1 <= m0, 'mask and frame buffers must not overlap');
});

test('real WASM renders deterministic, centered, mirrored LED cells', () => {
	setMask(2, 8, [[0, 0], [1, 3]]);
	const pixels = frame(render(), 24, 8);
	assert.deepEqual(frame(render(), 24, 8), pixels);
	const at = (px, x, y) => px.slice((y * 24 + x) * 4, (y * 24 + x + 1) * 4);
	assert.deepEqual(at(pixels, 11, 0), [255, 64, 0, 255]);
	assert.deepEqual(at(pixels, 12, 3), [255, 64, 0, 255]);
	assert.equal(pixels.filter((v, i) => i % 4 === 0 && v === 255).length, 2);
	const mirrored = frame(render({ flags: REPEAT | TRUE_BLACK | MIRROR }), 24, 8);
	for (let y = 0; y < 8; y++) for (let x = 0; x < 24; x++) assert.deepEqual(at(mirrored, 23 - x, y), at(pixels, x, y));
	const inverted = frame(render({ flags: REPEAT | TRUE_BLACK | INVERT }), 24, 8);
	assert.deepEqual(at(inverted, 0, 0), [255, 64, 0, 255]);
	assert.deepEqual(at(inverted, 11, 0), [0, 0, 0, 255]);
});

test('real WASM blinks dark and reports completion for non-repeating scrolls', () => {
	setMask(2, 8, [[0, 0]]);
	const off = frame(render({ flags: REPEAT | TRUE_BLACK | BLINK, t: 0.8 }), 24, 8);
	assert.ok(off.every((v, i) => v === (i % 4 === 3 ? 255 : 0)));
	assert.equal(e.complete(6.4, 24, 2, 4, 0), 0);
	assert.equal(e.complete(6.5, 24, 2, 4, 0), 1);
	assert.equal(e.complete(100, 24, 2, 4, REPEAT), 0);
});

test('real WASM rejects invalid boundaries as a set and leaves the frame untouched', () => {
	setMask(2, 8, [[0, 0]]);
	const before = frame(render(), 24, 8);
	const bad = [
		{ cols: 961 }, { cols: 0 }, { rows: 65 }, { rows: 0 }, { text: 8193 }, { t: NaN }, { t: Infinity },
		{ speed: -1 }, { speed: 1001 }, { speed: NaN }, { hue: NaN },
	];
	for (const o of bad) assert.equal(render(o), 0, JSON.stringify(o));
	assert.equal(e.render(0, 24, 8, 2, 0, 0, 1.5, 1, 0), 0);
	assert.equal(e.render(0, 24, 8, 2, 0, 0, 1, -0.1, 0), 0);
	assert.deepEqual(frame(24 * 8 * 4, 24, 8), before);
	for (const ok of [{ cols: 960, rows: 64, text: 8192 }, { text: 0 }]) assert.ok(render(ok) > 0, JSON.stringify(ok));
});
