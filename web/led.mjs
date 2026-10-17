// Browser adapter around one WASM core instance: owns a canvas, feeds the
// glyph mask in, and paints the per-LED RGBA frame at an integer cell scale
// with a square or round LED mask so every light keeps a 1:1 aspect.
import { ledTileAlpha, flagsFor, MAX_TEXT_COLS } from './model.mjs';
import { rasterize } from './raster.mjs';

export async function loadModule(url) {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Could not load ${url}: HTTP ${response.status}`);
	return WebAssembly.compile(await response.arrayBuffer());
}

function makeCanvas(w, h) {
	if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
	const c = document.createElement('canvas');
	c.width = w; c.height = h;
	return c;
}

export class Sign {
	static async create(module, canvas) {
		return new Sign((await WebAssembly.instantiate(module)).exports, canvas);
	}

	constructor(core, canvas) {
		this.core = core;
		this.canvas = canvas;
		this.ctx = canvas.getContext('2d');
		this.cells = makeCanvas(1, 1);
		this.cellsCtx = this.cells.getContext('2d');
		this.textCols = 0;
		this.layout = null;
		this.shape = null;
		this.pattern = null;
		this.messageKey = '';
	}

	// Rasterizes the message into the WASM mask. Returns { ok, cols }; ok is
	// false when the message exceeds the core's column limit.
	setMessage(text, font, rows) {
		const key = JSON.stringify([text, font, rows]);
		if (key === this.messageKey) return { ok: true, cols: this.textCols };
		const { cols, alpha } = rasterize(text, font, rows, MAX_TEXT_COLS);
		if (!alpha) return { ok: false, cols };
		new Uint8Array(this.core.memory.buffer, this.core.mask_ptr(), alpha.length).set(alpha);
		this.textCols = cols;
		this.messageKey = key;
		return { ok: true, cols };
	}

	// Applies a viewport()/displayLayout() result: backing store in device
	// pixels, CSS size derived from the same cell so both axes scale equally.
	setLayout(v, shape) {
		const changed = !this.layout || v.cell !== this.layout.cell || v.cols !== this.layout.cols || v.rows !== this.layout.rows;
		if (changed) {
			this.canvas.width = v.width;
			this.canvas.height = v.height;
			this.cells.width = v.cols;
			this.cells.height = v.rows;
			this.cellImage = this.cellsCtx.createImageData(v.cols, v.rows);
		}
		this.canvas.style.width = `${v.cssWidth}px`;
		this.canvas.style.height = `${v.cssHeight}px`;
		if (changed || shape !== this.shape) this.pattern = this.makePattern(v.cell, shape);
		this.layout = v;
		this.shape = shape;
	}

	makePattern(cell, shape) {
		const tile = makeCanvas(cell, cell);
		const t = tile.getContext('2d');
		const alpha = ledTileAlpha(cell, shape);
		const image = t.createImageData(cell, cell);
		for (let i = 0; i < alpha.length; i++) {
			image.data.fill(255, i * 4, i * 4 + 3);
			image.data[i * 4 + 3] = alpha[i];
		}
		t.putImageData(image, 0, 0);
		return this.ctx.createPattern(tile, 'repeat');
	}

	// Draws the frame for `seconds` of elapsed display time. Returns false if the
	// core refused the parameters (the previous frame stays on screen).
	draw(seconds, s) {
		const v = this.layout;
		if (!v) return false;
		const n = this.core.render(seconds, v.cols, v.rows, this.textCols, s.speed, s.hue, s.saturation, s.brightness, flagsFor(s));
		if (n === 0) return false;
		this.cellImage.data.set(new Uint8Array(this.core.memory.buffer, this.core.frame_ptr(), n));
		this.cellsCtx.putImageData(this.cellImage, 0, 0);
		const ctx = this.ctx;
		ctx.globalCompositeOperation = 'copy';
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(this.cells, 0, 0, v.width, v.height);
		ctx.globalCompositeOperation = 'destination-in';
		ctx.fillStyle = this.pattern;
		ctx.fillRect(0, 0, v.width, v.height);
		ctx.globalCompositeOperation = 'source-over';
		return true;
	}

	complete(seconds, s) {
		return this.layout ? this.core.complete(seconds, this.layout.cols, this.textCols, s.speed, flagsFor(s)) === 1 : false;
	}
}
