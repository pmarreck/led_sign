//! WebAssembly boundary for the LED core. The browser writes a glyph alpha mask
//! into `mask` (pointer + capacity exported), calls `render`, then reads
//! `cols * rows * 4` RGBA bytes from `frame`. Buffers are static: no allocator.
const core = @import("core.zig");

var mask = [_]u8{0} ** core.mask_capacity;
var frame = [_]u8{0} ** core.frame_capacity;

export fn mask_ptr() [*]u8 {
	return &mask;
}

export fn mask_capacity() usize {
	return mask.len;
}

export fn frame_ptr() [*]u8 {
	return &frame;
}

export fn frame_capacity() usize {
	return frame.len;
}

/// Renders one frame; returns bytes written to `frame`, or 0 when any argument
/// is out of range (see core.valid) so the caller keeps its previous frame.
export fn render(seconds: f64, cols: u32, rows: u32, text_cols: u32, speed: f64, hue: f64, saturation: f64, brightness: f64, flags: u32) usize {
	return core.render(.{
		.seconds = seconds,
		.cols = cols,
		.rows = rows,
		.text_cols = text_cols,
		.speed = speed,
		.hue = hue,
		.saturation = saturation,
		.brightness = brightness,
		.flags = @bitCast(flags),
	}, mask[0..], frame[0..]);
}

/// 1 once a non-repeating scroll has fully exited, for end-of-message feedback.
export fn complete(seconds: f64, cols: u32, text_cols: u32, speed: f64, flags: u32) u32 {
	const f: core.Flags = @bitCast(flags);
	return @intFromBool(core.isComplete(@floatFromInt(cols), @floatFromInt(text_cols), seconds, speed, f.repeat));
}
