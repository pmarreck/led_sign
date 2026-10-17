// Offline cache for the static site. The build stamps CACHE_VERSION with a
// digest of the shipped files, so each release replaces the previous cache.
const CACHE = 'led-sign-__CACHE_VERSION__';
const ASSETS = [
	'./', 'index.html', 'style.css', 'app.mjs', 'model.mjs', 'led.mjs', 'raster.mjs',
	'led-sign.wasm', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys()
			.then((keys) => Promise.all(keys.filter((k) => k.startsWith('led-sign-') && k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim()),
	);
});

// Cache first: the site is fully static and versioned as a whole. Navigations
// ignore the query string and fragment so share links open offline.
self.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
	const key = req.mode === 'navigate' ? 'index.html' : req;
	event.respondWith(caches.match(key, { ignoreSearch: req.mode === 'navigate' }).then((hit) => hit ?? fetch(req)));
});
