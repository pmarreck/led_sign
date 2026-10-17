#!/usr/bin/env node
// Generates the app icons as PNGs with no image dependencies: a field of
// square LEDs spelling a short marquee arrow on a black ground.
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const GRID = 9;
// 1 = lit LED. A right-pointing chevron reads as "scrolling sign" at any size.
const PATTERN = [
	'000000000',
	'001000000',
	'000100000',
	'000010000',
	'000001000',
	'000010000',
	'000100000',
	'001000000',
	'000000000',
];
const LIT = [56, 232, 200];
const GHOST = [10, 34, 30];
const BASE = [0, 0, 0];

function chunk(type, data) {
	const out = Buffer.alloc(12 + data.length);
	out.writeUInt32BE(data.length, 0);
	out.write(type, 4, 'latin1');
	data.copy(out, 8);
	out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
	return out;
}

export function iconPng(size) {
	const cell = size / GRID;
	const inset = cell * 0.12;
	const raw = Buffer.alloc((size * 3 + 1) * size);
	for (let y = 0; y < size; y++) {
		raw[y * (size * 3 + 1)] = 0;
		for (let x = 0; x < size; x++) {
			const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
			const lx = x - cx * cell, ly = y - cy * cell;
			const inLed = lx >= inset && ly >= inset && lx < cell - inset && ly < cell - inset;
			const rgb = !inLed ? BASE : PATTERN[cy][cx] === '1' ? LIT : GHOST;
			rgb.forEach((v, i) => { raw[y * (size * 3 + 1) + 1 + x * 3 + i] = v; });
		}
	}
	const header = Buffer.alloc(13);
	header.writeUInt32BE(size, 0);
	header.writeUInt32BE(size, 4);
	header[8] = 8; header[9] = 2; // 8-bit truecolor, no alpha (iOS requires opaque icons)
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
	]);
}

const out = process.argv[2];
if (!out) { console.error('usage: make-icons.mjs OUTPUT_DIR'); process.exit(2); }
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
	writeFileSync(join(out, name), iconPng(size));
}
