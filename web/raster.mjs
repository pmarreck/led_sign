// Browser adapter: rasterizes text with the system font stack into an alpha
// mask exactly `rows` pixels tall, so the browser handles Unicode shaping and
// emoji while the WASM core decides which LEDs are lit. The Mono style uses
// Berkeley Mono when installed and otherwise the built-in LED pixel font.
import { pixelRaster } from './pixelfont.mjs';

export const PREFERRED_MONO = 'Berkeley Mono';

export const FONT_STACKS = Object.freeze({
	mono: '600 {px}px "Berkeley Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
	sans: '600 {px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
	serif: '600 {px}px ui-serif, "New York", Georgia, serif',
	bold: '900 {px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
	rounded: '700 {px}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif',
});

const PROBE = 'ÅÉgjpyQ|';
const scratch = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
const ctx = scratch.getContext('2d', { willReadFrequently: true });

function fontFor(font, px) {
	return (FONT_STACKS[font] ?? FONT_STACKS.mono).replace('{px}', px.toFixed(2));
}

// Font size whose probe ink (accented capital to descender) fills the rows,
// so accents and descenders stay inside the sign.
function fit(font, rows) {
	ctx.font = fontFor(font, 100);
	const m = ctx.measureText(PROBE);
	const ascent = m.actualBoundingBoxAscent;
	const descent = m.actualBoundingBoxDescent;
	const px = (100 * rows) / Math.max(1, ascent + descent);
	return { px, baseline: (ascent * px) / 100 };
}

// Whether a font family is installed: text set in it (with a generic fallback)
// measures differently from the generic alone for at least one of two
// generics. A width-comparison probe; FontFaceSet.check cannot tell for
// local fonts.
export function fontInstalled(family) {
	const sample = 'mmmmmmmmmmlli10OQ@#';
	return ['monospace', 'serif'].some((generic) => {
		ctx.font = `72px ${generic}`;
		const base = ctx.measureText(sample).width;
		ctx.font = `72px "${family}", ${generic}`;
		return ctx.measureText(sample).width !== base;
	});
}

let monoFamily = null;
function usePixelMono() {
	if (monoFamily === null) monoFamily = fontInstalled(PREFERRED_MONO);
	return !monoFamily;
}

// Width in LED columns of `text` rendered `rows` pixels tall.
export function measure(text, font, rows) {
	const { px } = fit(font, rows);
	ctx.font = fontFor(font, px);
	return Math.ceil(ctx.measureText(text).width);
}

// Returns { cols, alpha }: a row-major rows x cols alpha mask, or alpha null
// when the message is wider than maxCols (the caller reports it; no truncation).
export function rasterize(text, font, rows, maxCols) {
	if (font === 'mono' && usePixelMono()) return pixelRaster(text, rows, maxCols, (run, h, max) => rasterizeSystem(run, font, h, max));
	return rasterizeSystem(text, font, rows, maxCols);
}

function rasterizeSystem(text, font, rows, maxCols) {
	const cols = measure(text, font, rows);
	if (cols > maxCols) return { cols, alpha: null };
	const { px, baseline } = fit(font, rows);
	scratch.width = Math.max(1, cols);
	scratch.height = rows;
	ctx.clearRect(0, 0, scratch.width, rows);
	ctx.font = fontFor(font, px);
	ctx.textBaseline = 'alphabetic';
	ctx.fillStyle = '#fff';
	ctx.fillText(text, 0, baseline);
	const alpha = new Uint8Array(cols * rows);
	if (cols === 0) return { cols, alpha };
	const rgba = ctx.getImageData(0, 0, cols, rows).data;
	// Emoji draw in color; their dark outlines stay unlit, bright areas light.
	for (let i = 0; i < alpha.length; i++) {
		const p = i * 4;
		alpha[i] = Math.max(rgba[p], rgba[p + 1], rgba[p + 2]) > 48 ? rgba[p + 3] : 0;
	}
	return { cols, alpha };
}
