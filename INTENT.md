# LED Sign

A locally rendered, installable web LED marquee for phones, especially iOS.
The owner wants a practical replacement for a paid scrolling-sign application.
Messages remain on the device; no accounts, subscriptions, analytics or server
processing are needed. The requested implementation is Zig compiled to WASM,
with browser APIs at the boundary.

## Desired behavior

Enter a message, preview it, and display it across the screen. Configure hue,
color intensity, speed, zoom, font, round/square LEDs, inversion, mirroring,
blinking, repeat and true-black background. Save reusable messages locally.
Respect safe areas unless the person chooses the entire screen. Offer portrait
display and opt-in start on rotation. Support offline use after installation
from HTTPS. Never silently truncate an oversized message.

Provide an obvious Add to Home Screen action with iOS-specific installation
instructions. The installed app should fill the available display. Preserve a
single uniform pixel scale through resizing, orientation and device pixel ratio
changes: every LED cell has equal displayed width and height. Both square and
round LED shapes are offered; square lights stay square and round dots stay
circular, never stretched to fit a canvas with a different aspect.

The four owner-supplied screenshots are feature references, not licensed assets
or a requirement to copy the original interface or its twenty font designs.
Use system fonts initially, rasterized by the browser for Unicode shaping;
Zig owns deterministic LED rendering and animation. Tests inject elapsed time
and glyph masks. No external font or image download at runtime.

## Browser boundaries

Hardware brightness, native iOS share extensions, camera-flash feedback and
continuous haptics are not promised. Explain unavailable capabilities instead
of showing fake controls. Request screen wake lock while displaying, release it
when leaving, and handle refusal and visibility changes. Browser fullscreen and
Home Screen standalone mode are separate capabilities. Native iPhone testing is
required before claiming iOS feature parity.

## Success evidence

One ./test runs native core tests, actual WASM ABI tests and web-adapter tests.
./build produces a self-contained static website; ./run serves a local preview.
Exercise long/empty/Unicode text, repeat boundaries, pause/stop, resizing,
denied browser features and unavailable local storage. Validate appearance with
the owner before treating visual snapshots as approved. Keep flashing off by
default. No public deployment or fleet-wide changes are part of this initial build.

