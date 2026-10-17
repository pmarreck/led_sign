const std = @import("std");

pub fn build(b: *std.Build) void {
	const optimize = b.option(std.builtin.OptimizeMode, "optimize", "Optimization mode (default: ReleaseFast)") orelse .ReleaseFast;
	const wasm = b.addExecutable(.{
		.name = "led-sign",
		.root_module = b.createModule(.{
			.root_source_file = b.path("src/wasm.zig"),
			.target = b.resolveTargetQuery(.{ .cpu_arch = .wasm32, .os_tag = .freestanding }),
			.optimize = optimize,
			.strip = optimize != .Debug,
		}),
	});
	wasm.entry = .disabled;
	wasm.rdynamic = true;
	b.installArtifact(wasm);

	const tests = b.addTest(.{ .root_module = b.createModule(.{
		.root_source_file = b.path("src/core.zig"),
		.target = b.graph.host,
		.optimize = .ReleaseSafe,
	}) });
	b.step("test", "Run deterministic native core tests (ReleaseSafe)").dependOn(&b.addRunArtifact(tests).step);
}
