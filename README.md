# LED Sign

A scrolling LED marquee for your phone that runs entirely on the device. Type a
message, tap Show, and hold the phone up. No account, subscription, analytics or
server-side processing; messages and settings stay in the browser.

The renderer is written in Zig and compiled to a 3 KB WebAssembly module. A thin
HTML/CSS/JavaScript layer handles the page, storage and browser features.

## How it works

1. The browser draws the message with a system font into an alpha mask exactly
   as tall as the sign has LED rows. That gives full Unicode shaping and emoji
   without shipping font files.
2. The WASM core (`src/core.zig`) turns the mask, elapsed time and settings into
   one RGBA value per LED: scroll position, color, ghost LEDs, invert, mirror,
   blink and repeat. It performs no I/O and is tested natively.
3. `web/led.mjs` scales that frame by a whole number of device pixels per LED,
   the same number on both axes, then masks each cell to a square or round
   light. LEDs therefore stay square (or circular) at every window size,
   orientation and device pixel ratio; leftover space is centered, never
   stretched.

## Use it

    ./run          # build and serve http://127.0.0.1:8417/
    ./build        # optimized static site in dist/  (--debug, --test)
    ./test         # every suite: Zig core, model, actual WASM, headless browser

All three enter the Nix dev shell themselves (`flake.nix`). `nix build` produces
the static site; `nix flake check` runs the full suite in the sandbox on Linux.

`dist/` is a plain static site; any HTTPS static host can serve it. Offline use,
screen wake lock and Home Screen installation need HTTPS (or `localhost`).

### Installing on iPhone

Open the site in Safari, tap Share (on newer iOS versions it may sit behind the
••• button), choose Add to Home Screen, keep Open as Web App on, and tap Add.
Websites cannot open that sheet themselves, so the app shows these steps behind
its Add to Home Screen button. Chromium-based browsers that offer an install
prompt get a direct Install button instead.

## Features and browser limits

| Feature | Status |
| --- | --- |
| Hue, color intensity, brightness, speed, LED size | Implemented |
| Fonts | Five system font styles (mono, sans, serif, heavy, rounded) |
| Square or round LEDs, invert, mirror, blink, repeat, true black | Implemented; blink is off by default |
| Saved messages | Implemented, stored locally; works without storage for the session |
| Share | Share link: a URL fragment that opens straight into the sign |
| Start on rotation, allow portrait, use entire screen | Implemented (portrait rotates the sign unless allowed) |
| Offline use | Service worker cache, versioned by a digest of the build |
| Keep screen on | Screen Wake Lock API where available; refusal is reported |
| Fullscreen | Fullscreen API where available; otherwise a page-filling display. Home Screen mode is already full screen |
| Vibrate when finished | Only shown where the Vibration API exists (not iOS Safari) |
| Maximum hardware brightness | Not possible from a web page |
| Camera flash, iOS haptics | Not possible from a web page |
| iOS share extension | Not possible; share links cover the use case |

Messages wider than 8192 LED columns are refused with an explanation rather
than shortened.

### Verified so far

Automated: native Zig tests, model tests, tests against the compiled WASM, and
headless Chromium tests that inspect rendered canvas pixels for uniform square
and circular LEDs in portrait, landscape and several device pixel ratios, plus
offline loading and the install flow under an iPhone user agent.

Not yet verified: Safari on a real iPhone (rendering, Home Screen install,
rotation, wake lock, offline). Until that happens, no iOS behavior should be
considered confirmed.

## Layout

| Path | Purpose |
| --- | --- |
| `src/core.zig` | Pure LED core: timing, color, validation, frame rendering, tests |
| `src/wasm.zig` | WebAssembly exports: static mask/frame buffers, `render`, `complete` |
| `web/model.mjs` | Pure settings, layout, LED tile and storage logic |
| `web/raster.mjs` | System-font text to alpha mask |
| `web/led.mjs` | Canvas painter for one WASM instance |
| `web/app.mjs` | Page wiring: controls, display mode, wake lock, install, service worker |
| `scripts/` | Web build, icon generator, local static server |
| `tests/` | `unit`, `integration` (actual WASM) and `browser` suites |

## License

MIT. See `LICENSE`.
