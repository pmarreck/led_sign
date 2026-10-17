# Plan

## First usable version

- [x] Implement and test a bounded deterministic Zig renderer and its WASM boundary. (2026-10-16 19:55 EDT)
- [x] Implement a phone-first editor, display mode, saved messages and offline assets. (2026-10-16 20:00 EDT)
- [x] Provide Add to Home Screen guidance and test uniform square/round LED scaling across portrait and landscape viewports. (2026-10-16 20:01 EDT)
- [x] Verify Nix package and complete tests, then inspect a real browser rendering (headless Chromium screenshots). (2026-10-16 20:03 EDT)
- [x] BDFN reviewed the running app: layout approved (2026-10-17 00:30 EDT); the Mono font renders unevenly.
- [x] Fix uneven Mono rendering (2026-10-17 00:46 EDT): at about 10 LEDs per character the system monospace font thresholds into mismatched stem widths (H stems 3 and 2 LEDs wide). Approved fix: put Berkeley Mono (BDFN preference) first in the stack, and add a built-in LED pixel font for devices without it. Done; the Nix check pins the pixel branch.
- [x] BDFN approved the pixel font visually (2026-10-17 08:13 EDT).
- [ ] Browser suite teardown hit ENOTEMPTY removing the Chromium profile once (2026-10-17, while CI was building on the same host). Not reproduced in 31 runs, including 8 in parallel; teardown now uses Browser.close. Reopen if it recurs.
- [x] Add a `bin/led-sign` command that serves the built app, with CLI tests in ./test and a matching Nix package layout. (2026-10-17 00:29 EDT)
- [x] Add Mechatron Prime CI targets and the README badge, then provision the webhook. (2026-10-17 00:30 EDT)
- [x] Review history for private details, then publish the repository publicly on GitHub (BDFN approved 2026-10-17) and confirm the first CI build: 74d1a04 passed in 73 s, badge PASSING. (2026-10-17 00:46 EDT)
- [ ] Obtain native iPhone visual, Home Screen, rotation, offline and wake-lock verification.
- [ ] Decide portrait rotation direction (currently 90° clockwise) after on-device check.
- [ ] Host the app on GitHub Pages (BDFN choice, 2026-10-17): verify subpath serving, service worker scope and install there.
- [ ] README: screenshots and a link to the live app.
- [ ] Browser checks on macOS: nixpkgs has no Darwin Chromium; ./test needs LED_SIGN_CHROMIUM or Google Chrome there.
