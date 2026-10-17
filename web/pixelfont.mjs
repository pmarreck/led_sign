// Built-in LED pixel font for the Mono style: a classic 5x7 dot-matrix design
// with two descender rows, scaled by a whole number of LEDs on both axes so
// every stroke is the same width. Characters outside printable ASCII fall
// back to an injected system-font rasterizer. Pure: no DOM access.

export const GLYPH_COLS = 5;
export const GLYPH_ROWS = 9; // 7 above the baseline, 2 descender rows

// Rows top to bottom; omitted trailing rows are blank.
const SOURCE = {
	' ': '',
	'!': '..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..',
	'"': '.#.#. .#.#. .#.#.',
	'#': '.#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.',
	'$': '..#.. .#### #.#.. .###. ..#.# ####. ..#..',
	'%': '##... ##..# ...#. ..#.. .#... #..## ...##',
	'&': '.##.. #..#. #.#.. .#... #.#.# #..#. .##.#',
	"'": '..#.. ..#.. .#...',
	'(': '...#. ..#.. .#... .#... .#... ..#.. ...#.',
	')': '.#... ..#.. ...#. ...#. ...#. ..#.. .#...',
	'*': '..... ..#.. #.#.# .###. #.#.# ..#.. .....',
	'+': '..... ..#.. ..#.. ##### ..#.. ..#.. .....',
	',': '..... ..... ..... ..... ..... .##.. ..#.. .#...',
	'-': '..... ..... ..... ##### ..... ..... .....',
	'.': '..... ..... ..... ..... ..... .##.. .##..',
	'/': '..... ....# ...#. ..#.. .#... #.... .....',
	'0': '.###. #...# #..## #.#.# ##..# #...# .###.',
	'1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
	'2': '.###. #...# ....# ...#. ..#.. .#... #####',
	'3': '##### ...#. ..#.. ...#. ....# #...# .###.',
	'4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
	'5': '##### #.... ####. ....# ....# #...# .###.',
	'6': '..##. .#... #.... ####. #...# #...# .###.',
	'7': '##### ....# ...#. ..#.. .#... .#... .#...',
	'8': '.###. #...# #...# .###. #...# #...# .###.',
	'9': '.###. #...# #...# .#### ....# ...#. .##..',
	':': '..... .##.. .##.. ..... .##.. .##.. .....',
	';': '..... .##.. .##.. ..... .##.. ..#.. .#...',
	'<': '...#. ..#.. .#... #.... .#... ..#.. ...#.',
	'=': '..... ..... ##### ..... ##### ..... .....',
	'>': '.#... ..#.. ...#. ....# ...#. ..#.. .#...',
	'?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
	'@': '.###. #...# ....# .##.# #.#.# #.#.# .###.',
	'A': '.###. #...# #...# ##### #...# #...# #...#',
	'B': '####. #...# #...# ####. #...# #...# ####.',
	'C': '.###. #...# #.... #.... #.... #...# .###.',
	'D': '###.. #..#. #...# #...# #...# #..#. ###..',
	'E': '##### #.... #.... ####. #.... #.... #####',
	'F': '##### #.... #.... ####. #.... #.... #....',
	'G': '.###. #...# #.... #.### #...# #...# .####',
	'H': '#...# #...# #...# ##### #...# #...# #...#',
	'I': '.###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.',
	'J': '..### ...#. ...#. ...#. ...#. #..#. .##..',
	'K': '#...# #..#. #.#.. ##... #.#.. #..#. #...#',
	'L': '#.... #.... #.... #.... #.... #.... #####',
	'M': '#...# ##.## #.#.# #.#.# #...# #...# #...#',
	'N': '#...# #...# ##..# #.#.# #..## #...# #...#',
	'O': '.###. #...# #...# #...# #...# #...# .###.',
	'P': '####. #...# #...# ####. #.... #.... #....',
	'Q': '.###. #...# #...# #...# #.#.# #..#. .##.#',
	'R': '####. #...# #...# ####. #.#.. #..#. #...#',
	'S': '.#### #.... #.... .###. ....# ....# ####.',
	'T': '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
	'U': '#...# #...# #...# #...# #...# #...# .###.',
	'V': '#...# #...# #...# #...# #...# .#.#. ..#..',
	'W': '#...# #...# #...# #.#.# #.#.# #.#.# .#.#.',
	'X': '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
	'Y': '#...# #...# #...# .#.#. ..#.. ..#.. ..#..',
	'Z': '##### ....# ...#. ..#.. .#... #.... #####',
	'[': '.###. .#... .#... .#... .#... .#... .###.',
	'\\': '..... #.... .#... ..#.. ...#. ....# .....',
	']': '.###. ...#. ...#. ...#. ...#. ...#. .###.',
	'^': '..#.. .#.#. #...#',
	'_': '..... ..... ..... ..... ..... ..... ..... #####',
	'`': '.#... ..#.. ...#.',
	'a': '..... ..... .###. ....# .#### #...# .####',
	'b': '#.... #.... #.##. ##..# #...# #...# ####.',
	'c': '..... ..... .###. #.... #.... #...# .###.',
	'd': '....# ....# .##.# #..## #...# #...# .####',
	'e': '..... ..... .###. #...# ##### #.... .###.',
	'f': '..##. .#..# .#... ###.. .#... .#... .#...',
	'g': '..... ..... .#### #...# #...# #...# .#### ....# .###.',
	'h': '#.... #.... #.##. ##..# #...# #...# #...#',
	'i': '..#.. ..... .##.. ..#.. ..#.. ..#.. .###.',
	'j': '...#. ..... ..##. ...#. ...#. ...#. ...#. #..#. .##..',
	'k': '#.... #.... #..#. #.#.. ##... #.#.. #..#.',
	'l': '.##.. ..#.. ..#.. ..#.. ..#.. ..#.. .###.',
	'm': '..... ..... ##.#. #.#.# #.#.# #.#.# #.#.#',
	'n': '..... ..... #.##. ##..# #...# #...# #...#',
	'o': '..... ..... .###. #...# #...# #...# .###.',
	'p': '..... ..... ####. #...# #...# #...# ####. #.... #....',
	'q': '..... ..... .#### #...# #...# #...# .#### ....# ....#',
	'r': '..... ..... #.##. ##..# #.... #.... #....',
	's': '..... ..... .###. #.... .###. ....# ####.',
	't': '.#... .#... ###.. .#... .#... .#..# ..##.',
	'u': '..... ..... #...# #...# #...# #..## .##.#',
	'v': '..... ..... #...# #...# #...# .#.#. ..#..',
	'w': '..... ..... #...# #...# #.#.# #.#.# .#.#.',
	'x': '..... ..... #...# .#.#. ..#.. .#.#. #...#',
	'y': '..... ..... #...# #...# #...# #...# .#### ....# .###.',
	'z': '..... ..... ##### ...#. ..#.. .#... #####',
	'{': '...#. ..#.. ..#.. .#... ..#.. ..#.. ...#.',
	'|': '..#.. ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
	'}': '.#... ..#.. ..#.. ...#. ..#.. ..#.. .#...',
	'~': '..... ..... .#... #.#.# ...#. ..... .....',
};

const BLANK = '.'.repeat(GLYPH_COLS);

export const GLYPHS = new Map(Object.entries(SOURCE).map(([ch, src]) => {
	const rows = src ? src.split(' ') : [];
	while (rows.length < GLYPH_ROWS) rows.push(BLANK);
	return [ch, rows];
}));

// LEDs per font pixel: the largest whole number whose glyph height fits the
// sign, at least 1 (shorter signs clip the descender rows).
export function pixelScale(rows) {
	return Math.max(1, Math.floor(rows / GLYPH_ROWS));
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

// Splits text into pixel-font glyphs and maximal runs of other graphemes, so
// emoji sequences and combining marks reach the fallback shaper intact.
function segments(text) {
	const out = [];
	for (const { segment } of segmenter.segment(text)) {
		if (GLYPHS.has(segment)) out.push({ glyph: GLYPHS.get(segment) });
		else if (out.length && out[out.length - 1].text !== undefined) out[out.length - 1].text += segment;
		else out.push({ text: segment });
	}
	return out;
}

// Rasterizes text as a rows-tall alpha mask (row-major, 255 lit, 0 dark) with
// one scaled pixel of space between segments. `fallback(text, rows, maxCols)`
// returns { cols, alpha|null } like the system rasterizer. Returns alpha null
// when the message is wider than maxCols; nothing is truncated.
export function pixelRaster(text, rows, maxCols, fallback) {
	const k = pixelScale(rows);
	const glyphWidth = GLYPH_COLS * k;
	const parts = [];
	let cols = 0;
	let fits = true;
	for (const seg of segments(text)) {
		if (parts.length) cols += k;
		if (seg.glyph) {
			parts.push({ x: cols, glyph: seg.glyph });
			cols += glyphWidth;
		} else {
			const r = fallback(seg.text, rows, Math.max(0, maxCols - cols));
			if (!r.alpha) fits = false;
			parts.push({ x: cols, cols: r.cols, alpha: r.alpha });
			cols += r.cols;
		}
	}
	if (!fits || cols > maxCols) return { cols, alpha: null };
	const alpha = new Uint8Array(cols * rows);
	const top = Math.max(0, Math.floor((rows - GLYPH_ROWS * k) / 2));
	for (const p of parts) {
		if (p.glyph) {
			for (let y = 0; y < rows - top && y < GLYPH_ROWS * k; y++) {
				const line = p.glyph[Math.floor(y / k)];
				for (let x = 0; x < glyphWidth; x++) if (line[Math.floor(x / k)] === '#') alpha[(top + y) * cols + p.x + x] = 255;
			}
		} else {
			for (let y = 0; y < rows; y++) alpha.set(p.alpha.subarray(y * p.cols, (y + 1) * p.cols), y * cols + p.x);
		}
	}
	return { cols, alpha };
}
