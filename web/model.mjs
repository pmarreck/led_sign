// Pure settings, layout and persistence logic for the LED sign browser adapter.
// No DOM access: storage objects and viewport measurements are injected.

export const MAX_COLS = 960;
export const MAX_ROWS = 64;
export const MAX_TEXT_COLS = 8192;
export const MAX_SPEED = 60;
export const MIN_ZOOM_ROWS = 8;
export const MAX_ZOOM_ROWS = 32;
export const FONTS = Object.freeze(['mono', 'sans', 'serif', 'bold', 'rounded']);
export const SHAPES = Object.freeze(['square', 'round']);
const SETTINGS_KEY = 'led-sign:settings:v1';
const MESSAGES_KEY = 'led-sign:messages:v1';

export const DEFAULTS = Object.freeze({
	text: 'HELLO WORLD',
	hue: 170,
	saturation: 1,
	brightness: 1,
	speed: 12,
	zoom: 0.5,
	font: 'mono',
	shape: 'square',
	invert: false,
	mirror: false,
	blink: false,
	repeat: true,
	trueBlack: false,
	entireScreen: true,
	allowPortrait: false,
	startOnRotation: false,
});

const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
const num = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const pick = (v, allowed, d) => (allowed.includes(v) ? v : d);

// Coerces untrusted settings (storage, share links) into a valid settings
// object: clamps numbers, allowlists enums and keeps text whole (no truncation).
export function normalize(raw) {
	const get = (k) => (own(raw, k) ? raw[k] : undefined);
	const d = DEFAULTS;
	return {
		text: typeof get('text') === 'string' ? get('text') : d.text,
		hue: num(get('hue'), 0, 360, d.hue),
		saturation: num(get('saturation'), 0, 1, d.saturation),
		brightness: num(get('brightness'), 0, 1, d.brightness),
		speed: num(get('speed'), 0, MAX_SPEED, d.speed),
		zoom: num(get('zoom'), 0, 1, d.zoom),
		font: pick(get('font'), FONTS, d.font),
		shape: pick(get('shape'), SHAPES, d.shape),
		invert: bool(get('invert'), d.invert),
		mirror: bool(get('mirror'), d.mirror),
		blink: bool(get('blink'), d.blink),
		repeat: bool(get('repeat'), d.repeat),
		trueBlack: bool(get('trueBlack'), d.trueBlack),
		entireScreen: bool(get('entireScreen'), d.entireScreen),
		allowPortrait: bool(get('allowPortrait'), d.allowPortrait),
		startOnRotation: bool(get('startOnRotation'), d.startOnRotation),
	};
}

// Zoom slider (0 = small LEDs, 1 = giant LEDs) to the number of LED rows.
export function rowsForZoom(zoom) {
	return Math.round(MAX_ZOOM_ROWS - num(zoom, 0, 1, 0) * (MAX_ZOOM_ROWS - MIN_ZOOM_ROWS));
}

export const textFits = (textCols) => Number.isInteger(textCols) && textCols >= 0 && textCols <= MAX_TEXT_COLS;

// Uniform-scale layout: one integer device-pixel cell size shared by both
// axes, so every LED is square at any orientation, size or devicePixelRatio.
// Rows fill the height; columns fill the width; the remainder is centered.
export function viewport(cssWidth, cssHeight, dpr, rows) {
	const ok = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
	if (!ok(cssWidth) || !ok(cssHeight) || !ok(dpr)) throw new RangeError('viewport dimensions must be positive');
	if (!Number.isInteger(rows) || rows < 1 || rows > MAX_ROWS) throw new RangeError(`rows must be 1..${MAX_ROWS}`);
	const devW = Math.floor(cssWidth * dpr);
	const devH = Math.floor(cssHeight * dpr);
	const cell = Math.floor(devH / rows);
	if (cell < 1) throw new RangeError('viewport too small for this many rows');
	const cols = Math.min(MAX_COLS, Math.floor(devW / cell));
	if (cols < 1) throw new RangeError('viewport too narrow');
	const width = cols * cell;
	const height = rows * cell;
	const cssW = width / dpr;
	const cssH = height / dpr;
	return {
		rows, cols, cell, width, height,
		cssWidth: cssW, cssHeight: cssH,
		left: (cssWidth - cssW) / 2, top: (cssHeight - cssH) / 2,
	};
}

// Lit area of one LED inside its cell, in device pixels. Square lights are an
// inset square; round lights a centered circle. Both have equal width/height.
export function ledGeometry(cell, shape) {
	const inset = cell >= 4 ? Math.max(1, Math.round(cell * 0.08)) : 0;
	if (shape === 'round') return { center: cell / 2, radius: Math.max(0.5, cell / 2 - inset) };
	return { inset, size: cell - 2 * inset };
}

function readJson(storage, key) {
	try {
		const text = storage?.getItem(key);
		return text == null ? undefined : JSON.parse(text);
	} catch {
		return undefined;
	}
}

function writeJson(storage, key, value) {
	try {
		storage.setItem(key, JSON.stringify(value));
		return true;
	} catch {
		return false;
	}
}

export const restore = (storage) => normalize(readJson(storage, SETTINGS_KEY));
export const save = (storage, settings) => writeJson(storage, SETTINGS_KEY, normalize(settings));

export function restoreMessages(storage) {
	const list = readJson(storage, MESSAGES_KEY);
	if (!Array.isArray(list)) return [];
	return list.filter((m) => typeof m === 'string').reduceRight((acc, m) => addMessage(acc, m), []);
}

export const saveMessages = (storage, list) => writeJson(storage, MESSAGES_KEY, list);

// Returns a new list with `text` first and any earlier duplicate removed.
export function addMessage(list, text) {
	if (typeof text !== 'string' || text.trim() === '') return list.slice();
	return [text, ...list.filter((m) => m !== text)];
}

export const removeMessage = (list, text) => list.filter((m) => m !== text);

// URL fragment for sharing a sign; fragments never reach a server.
export function shareHash(text, show) {
	const p = new URLSearchParams({ text });
	if (show) p.set('show', '1');
	return `#${p}`;
}

export function parseShare(hash) {
	const p = new URLSearchParams(String(hash ?? '').replace(/^#/, ''));
	if (!p.has('text')) return null;
	return { text: p.get('text'), show: p.get('show') === '1' };
}

export const FLAG = Object.freeze({ repeat: 1, mirror: 2, blink: 4, invert: 8, trueBlack: 16 });

// Packs boolean settings into the core's Flags bitfield (src/core.zig).
export function flagsFor(s) {
	let bits = 0;
	for (const [name, bit] of Object.entries(FLAG)) if (s[name]) bits |= bit;
	return bits;
}

// Chooses whether to rotate the sign 90 degrees so text runs along the long
// edge of a portrait screen, then lays out square cells in that frame.
export function displayLayout(cssWidth, cssHeight, dpr, rows, allowPortrait) {
	const rotate = !allowPortrait && cssHeight > cssWidth;
	const v = rotate ? viewport(cssHeight, cssWidth, dpr, rows) : viewport(cssWidth, cssHeight, dpr, rows);
	return { ...v, rotate };
}

// Alpha mask for one LED cell (row-major cell x cell). Round coverage comes
// from each pixel center's distance to the cell center, a one-pixel linear
// antialiasing ramp, so the dot is exactly symmetric and identical everywhere.
export function ledTileAlpha(cell, shape) {
	const g = ledGeometry(cell, shape);
	const out = new Uint8Array(cell * cell);
	for (let y = 0; y < cell; y++) {
		for (let x = 0; x < cell; x++) {
			let a;
			if (shape === 'round') {
				const dx = x + 0.5 - g.center, dy = y + 0.5 - g.center;
				a = Math.min(1, Math.max(0, g.radius - Math.hypot(dx, dy) + 0.5));
			} else {
				a = x >= g.inset && y >= g.inset && x < g.inset + g.size && y < g.inset + g.size ? 1 : 0;
			}
			out[y * cell + x] = Math.round(a * 255);
		}
	}
	return out;
}
