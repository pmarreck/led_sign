# Plan

## First usable version

- [x] Implement and test a bounded deterministic Zig renderer and its WASM boundary. (2026-10-16 19:55 EDT)
- [x] Implement a phone-first editor, display mode, saved messages and offline assets. (2026-10-16 20:00 EDT)
- [x] Provide Add to Home Screen guidance and test uniform square/round LED scaling across portrait and landscape viewports. (2026-10-16 20:01 EDT)
- [x] Verify Nix package and complete tests, then inspect a real browser rendering (headless Chromium screenshots). (2026-10-16 20:03 EDT)
- [ ] Get BDFN visual approval of the editor and display screenshots.
- [ ] Obtain native iPhone visual, Home Screen, rotation, offline and wake-lock verification.
- [ ] Decide portrait rotation direction (currently 90° clockwise) after on-device check.
- [ ] Choose HTTPS hosting and configure Mechatron Prime CI before publication.
- [ ] Browser checks on macOS: nixpkgs has no Darwin Chromium; ./test needs LED_SIGN_CHROMIUM or Google Chrome there.
