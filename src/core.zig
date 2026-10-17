//! Deterministic LED sign core: scroll timing, color and cell rendering.
//! Pure computation with no I/O; the browser supplies glyph alpha masks and
//! elapsed time, and receives one RGBA value per LED cell.
const std = @import("std");

pub const max_cols: u32 = 960;
pub const max_rows: u32 = 64;
pub const max_text_cols: u32 = 8192;
pub const mask_capacity: usize = @as(usize, max_text_cols) * max_rows;
pub const frame_capacity: usize = @as(usize, max_cols) * max_rows * 4;
pub const max_speed: f64 = 1000;
pub const blink_period: f64 = 1.0;
pub const lit_threshold: u8 = 128;

pub const Flags = packed struct(u32) {
	repeat: bool = false,
	mirror: bool = false,
	blink: bool = false,
	invert: bool = false,
	true_black: bool = false,
	_pad: u27 = 0,
};

pub const Params = struct {
	seconds: f64,
	cols: u32,
	rows: u32,
	text_cols: u32,
	speed: f64,
	hue: f64,
	saturation: f64,
	brightness: f64,
	flags: Flags,
};

pub const Rgb = [3]u8;

/// Leftmost LED column of the message at `seconds`: enters from the right edge
/// at `speed` cells/second and wraps after travelling width + text_width
/// (modular arithmetic); a zero speed centers it, bad time keeps it off-screen.
pub fn position(width: f64, text_width: f64, seconds: f64, speed: f64, repeat: bool) f64 {
	if (!std.math.isFinite(seconds) or seconds < 0) return width;
	if (speed == 0) return (width - text_width) / 2;
	const travelled = seconds * speed;
	if (repeat) return width - @mod(travelled, width + text_width);
	return @max(width - travelled, -text_width);
}

/// True once a non-repeating scroll has fully left the sign (end-of-message
/// feedback hook); repeating and static messages never complete.
pub fn isComplete(width: f64, text_width: f64, seconds: f64, speed: f64, repeat: bool) bool {
	if (repeat or speed <= 0 or !std.math.isFinite(seconds) or seconds < 0) return false;
	return seconds * speed >= width + text_width;
}

/// HSV to 8-bit RGB: hue in degrees (wrapping), saturation as the color
/// intensity versus white, brightness as value.
pub fn color(hue: f64, saturation: f64, brightness: f64) Rgb {
	const h = @mod(hue, 360) / 60;
	const c = brightness * saturation;
	const x = c * (1 - @abs(@mod(h, 2) - 1));
	const m = brightness - c;
	const rgb: [3]f64 = switch (@as(u3, @intFromFloat(@floor(h)))) {
		0 => .{ c, x, 0 },
		1 => .{ x, c, 0 },
		2 => .{ 0, c, x },
		3 => .{ 0, x, c },
		4 => .{ x, 0, c },
		else => .{ c, 0, x },
	};
	var out: Rgb = undefined;
	for (rgb, 0..) |v, i| out[i] = @intFromFloat(@round(std.math.clamp((v + m) * 255, 0, 255)));
	return out;
}

fn unit(v: f64) bool {
	return v >= 0 and v <= 1; // false for NaN
}

pub fn valid(p: Params) bool {
	return p.cols >= 1 and p.cols <= max_cols and p.rows >= 1 and p.rows <= max_rows and
		p.text_cols <= max_text_cols and std.math.isFinite(p.seconds) and
		p.speed >= 0 and p.speed <= max_speed and std.math.isFinite(p.hue) and
		unit(p.saturation) and unit(p.brightness);
}

/// Rasterizes one frame of LED cells (RGBA, opaque) from a row-major glyph
/// alpha mask of rows x text_cols. Thresholds alpha into lit/unlit LEDs,
/// applies scroll offset, invert, mirror and blink. Returns bytes written, or
/// 0 without writing when parameters or buffer lengths are invalid.
pub fn render(p: Params, mask: []const u8, frame: []u8) usize {
	if (!valid(p)) return 0;
	const mask_len = @as(usize, p.text_cols) * p.rows;
	const frame_len = @as(usize, p.cols) * p.rows * 4;
	if (mask.len < mask_len or frame.len < frame_len) return 0;
	const on = color(p.hue, p.saturation, p.brightness);
	const off: Rgb = if (p.flags.true_black) .{ 0, 0, 0 } else .{ on[0] / 8, on[1] / 8, on[2] / 8 };
	const blank = p.flags.blink and @mod(p.seconds, blink_period) >= blink_period / 2;
	const cols: i64 = p.cols;
	const text: i64 = p.text_cols;
	const origin: i64 = @intFromFloat(@floor(position(@floatFromInt(cols), @floatFromInt(text), p.seconds, p.speed, p.flags.repeat)));
	for (0..p.rows) |y| {
		var x: i64 = 0;
		while (x < cols) : (x += 1) {
			const tx = x - origin;
			var lit = !blank and tx >= 0 and tx < text and mask[y * p.text_cols + @as(usize, @intCast(tx))] >= lit_threshold;
			if (p.flags.invert and !blank) lit = !lit;
			const ox: usize = @intCast(if (p.flags.mirror) cols - 1 - x else x);
			const rgb = if (lit) on else off;
			const i = (y * p.cols + ox) * 4;
			frame[i..][0..4].* = .{ rgb[0], rgb[1], rgb[2], 255 };
		}
	}
	return frame_len;
}

const testing = std.testing;

test "scrolling moves at the requested speed and repeats at the exact boundary" {
	try testing.expectEqual(@as(f64, 80), position(100, 40, 1, 20, true));
	try testing.expectEqual(@as(f64, 100), position(100, 40, 7, 20, true));
	try testing.expectEqual(@as(f64, 90), position(100, 40, 7.5, 20, true));
	try testing.expectEqual(@as(f64, -40), position(100, 40, 8, 20, false));
	try testing.expectEqual(@as(f64, -40), position(100, 40, 1e9, 20, false));
}

test "zero speed centers a static message and invalid time is safe" {
	try testing.expectEqual(@as(f64, 30), position(100, 40, 20, 0, true));
	try testing.expectEqual(@as(f64, 100), position(100, 40, -1, 20, true));
	try testing.expectEqual(@as(f64, 100), position(100, 40, std.math.nan(f64), 20, true));
	try testing.expectEqual(@as(f64, 100), position(100, 40, std.math.inf(f64), 20, true));
}

test "completion happens once a non-repeating message has fully exited" {
	try testing.expect(!isComplete(100, 40, 6.99, 20, false));
	try testing.expect(isComplete(100, 40, 7, 20, false));
	try testing.expect(!isComplete(100, 40, 1e6, 20, true));
	try testing.expect(!isComplete(100, 40, 1e6, 0, false));
}

test "color maps hue, saturation and brightness to RGB" {
	try testing.expectEqual(Rgb{ 255, 0, 0 }, color(0, 1, 1));
	try testing.expectEqual(Rgb{ 0, 255, 0 }, color(120, 1, 1));
	try testing.expectEqual(Rgb{ 0, 0, 255 }, color(240, 1, 1));
	try testing.expectEqual(Rgb{ 255, 0, 0 }, color(360, 1, 1));
	try testing.expectEqual(Rgb{ 255, 255, 255 }, color(77, 0, 1));
	try testing.expectEqual(Rgb{ 128, 0, 0 }, color(0, 1, 0.5));
	try testing.expectEqual(Rgb{ 0, 0, 0 }, color(200, 0.3, 0));
}

fn params(overrides: anytype) Params {
	var p: Params = .{ .seconds = 0, .cols = 24, .rows = 8, .text_cols = 2, .speed = 0, .hue = 0, .saturation = 1, .brightness = 1, .flags = .{ .repeat = true, .true_black = true } };
	inline for (std.meta.fields(@TypeOf(overrides))) |f| @field(p, f.name) = @field(overrides, f.name);
	return p;
}

test "parameter validation rejects out-of-range boundaries as a set" {
	const nan = std.math.nan(f64);
	const inf = std.math.inf(f64);
	try testing.expect(valid(params(.{})));
	try testing.expect(valid(params(.{ .text_cols = 0 })));
	try testing.expect(valid(params(.{ .cols = max_cols, .rows = max_rows, .text_cols = max_text_cols, .speed = max_speed })));
	const bad = [_]Params{
		params(.{ .cols = 0 }),                 params(.{ .rows = 0 }),
		params(.{ .cols = max_cols + 1 }),      params(.{ .rows = max_rows + 1 }),
		params(.{ .text_cols = max_text_cols + 1 }),
		params(.{ .seconds = nan }),            params(.{ .seconds = inf }),
		params(.{ .speed = -1 }),               params(.{ .speed = max_speed + 1 }),
		params(.{ .speed = nan }),              params(.{ .hue = nan }),
		params(.{ .saturation = -0.1 }),        params(.{ .saturation = 1.1 }),
		params(.{ .brightness = -0.1 }),        params(.{ .brightness = 1.1 }),
		params(.{ .brightness = nan }),         params(.{ .hue = inf }),
	};
	for (bad) |p| try testing.expect(!valid(p));
}

fn cell(frame: []const u8, cols: u32, x: u32, y: u32) [4]u8 {
	const i = (y * cols + x) * 4;
	return frame[i..][0..4].*;
}

test "static message lights exactly the masked cells, centered, opaque" {
	var mask = [_]u8{0} ** (2 * 8);
	mask[0] = 255; // text column 0, row 0
	mask[1 * 2 + 1] = 200; // text column 1, row 1
	mask[2 * 2 + 0] = 100; // below threshold: stays dark
	var frame: [24 * 8 * 4]u8 = undefined;
	try testing.expectEqual(@as(usize, frame.len), render(params(.{}), &mask, &frame));
	var lit: usize = 0;
	for (0..8) |y| for (0..24) |x| {
		const c = cell(&frame, 24, @intCast(x), @intCast(y));
		try testing.expectEqual(@as(u8, 255), c[3]);
		if (c[0] != 0) lit += 1;
	};
	try testing.expectEqual(@as(usize, 2), lit);
	// (24 - 2) / 2 = 11 is the centered origin.
	try testing.expectEqual([4]u8{ 255, 0, 0, 255 }, cell(&frame, 24, 11, 0));
	try testing.expectEqual([4]u8{ 255, 0, 0, 255 }, cell(&frame, 24, 12, 1));
	try testing.expectEqual([4]u8{ 0, 0, 0, 255 }, cell(&frame, 24, 11, 2));
}

test "scrolling steps whole cells and enters from the right edge" {
	var mask = [_]u8{255} ** (2 * 8);
	var frame: [24 * 8 * 4]u8 = undefined;
	_ = render(params(.{ .speed = 4, .seconds = 0.5 }), &mask, &frame); // origin 22
	try testing.expectEqual(@as(u8, 0), cell(&frame, 24, 21, 0)[0]);
	try testing.expectEqual(@as(u8, 255), cell(&frame, 24, 22, 0)[0]);
	try testing.expectEqual(@as(u8, 255), cell(&frame, 24, 23, 0)[0]);
	_ = render(params(.{ .speed = 4, .seconds = 0.6 }), &mask, &frame); // origin 21.6 -> 21
	try testing.expectEqual(@as(u8, 255), cell(&frame, 24, 21, 0)[0]);
	try testing.expectEqual(@as(u8, 0), cell(&frame, 24, 23, 0)[0]);
}

test "ghost LEDs glow dimly unless true black is chosen; invert swaps lit and unlit" {
	var mask = [_]u8{0} ** (2 * 8);
	mask[0] = 255;
	var frame: [24 * 8 * 4]u8 = undefined;
	_ = render(params(.{ .flags = Flags{ .repeat = true } }), &mask, &frame);
	const ghost = cell(&frame, 24, 0, 0);
	try testing.expect(ghost[0] > 0 and ghost[0] < 64);
	try testing.expectEqual([4]u8{ 255, 0, 0, 255 }, cell(&frame, 24, 11, 0));
	_ = render(params(.{ .flags = Flags{ .repeat = true, .invert = true, .true_black = true } }), &mask, &frame);
	try testing.expectEqual([4]u8{ 255, 0, 0, 255 }, cell(&frame, 24, 0, 0));
	try testing.expectEqual([4]u8{ 0, 0, 0, 255 }, cell(&frame, 24, 11, 0));
}

test "mirror reverses each row; blink blanks the second half of each period" {
	var mask = [_]u8{0} ** (2 * 8);
	mask[0] = 255;
	mask[2 * 3 + 1] = 255;
	var plain: [24 * 8 * 4]u8 = undefined;
	var mirrored: [24 * 8 * 4]u8 = undefined;
	_ = render(params(.{}), &mask, &plain);
	_ = render(params(.{ .flags = Flags{ .repeat = true, .true_black = true, .mirror = true } }), &mask, &mirrored);
	for (0..8) |y| for (0..24) |x|
		try testing.expectEqual(cell(&plain, 24, @intCast(x), @intCast(y)), cell(&mirrored, 24, @intCast(23 - x), @intCast(y)));
	var frame: [24 * 8 * 4]u8 = undefined;
	const blink = Flags{ .repeat = true, .true_black = true, .blink = true };
	_ = render(params(.{ .flags = blink, .seconds = 0.2 }), &mask, &frame);
	try testing.expectEqualSlices(u8, &plain, &frame);
	_ = render(params(.{ .flags = blink, .seconds = 0.8 }), &mask, &frame);
	for (0..frame.len) |i| try testing.expectEqual(@as(u8, if (i % 4 == 3) 255 else 0), frame[i]);
}

test "render refuses invalid parameters and undersized buffers without writing" {
	var mask = [_]u8{255} ** (2 * 8);
	var frame = [_]u8{7} ** (24 * 8 * 4);
	try testing.expectEqual(@as(usize, 0), render(params(.{ .cols = 0 }), &mask, &frame));
	try testing.expectEqual(@as(usize, 0), render(params(.{}), mask[0..15], &frame));
	try testing.expectEqual(@as(usize, 0), render(params(.{}), &mask, frame[0 .. frame.len - 1]));
	for (frame) |b| try testing.expectEqual(@as(u8, 7), b);
}

test "empty message renders a fully dark sign" {
	var frame: [24 * 8 * 4]u8 = undefined;
	try testing.expectEqual(@as(usize, frame.len), render(params(.{ .text_cols = 0 }), &.{}, &frame));
	for (0..frame.len) |i| try testing.expectEqual(@as(u8, if (i % 4 == 3) 255 else 0), frame[i]);
}
