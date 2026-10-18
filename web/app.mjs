// DOM adapter: wires controls, storage, display mode, wake lock, install
// guidance and the service worker around the pure model and WASM sign.
import {
	normalize, restore, save, restoreMessages, saveMessages, addMessage, removeMessage,
	restoreHistory, saveHistory, recordHistory,
	rowsForZoom, viewport, displayLayout, parseShare, shareHash, MAX_TEXT_COLS,
} from './model.mjs';
import { loadModule, Sign } from './led.mjs';

const $ = (id) => document.getElementById(id);
const CONTROLS_VISIBLE_MS = 2500;
const RANGE_KEYS = ['hue', 'saturation', 'brightness', 'speed', 'zoom'];
const SWITCH_KEYS = ['repeat', 'invert', 'mirror', 'trueBlack', 'blink', 'startOnRotation', 'allowPortrait', 'entireScreen'];

function storageOrNull() {
	try {
		const s = window.localStorage;
		const probe = 'led-sign:probe';
		s.setItem(probe, '1');
		s.removeItem(probe);
		return s;
	} catch {
		return null;
	}
}

const storage = storageOrNull();
let settings = restore(storage);
let messages = restoreMessages(storage);
let recent = restoreHistory(storage);
let vibrateOnFinish = false;

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches ||
	window.matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) ||
	(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function persist() {
	save(storage, settings);
}

function ledCss(s) {
	return `hsl(${s.hue} ${Math.round(40 + s.saturation * 55)}% ${Math.round(85 - s.saturation * 27)}%)`;
}

function applyAccent() {
	document.documentElement.style.setProperty('--led', ledCss(settings));
}

// ---- Editor preview -------------------------------------------------------

let previewSign;
let displaySign;
let previewStart = performance.now();

function messageText() {
	return settings.text;
}

function setError(text) {
	const el = $('message-error');
	el.textContent = text;
	el.hidden = !text;
	$('show').disabled = Boolean(text);
}

function loadMessage(sign, rows) {
	const result = sign.setMessage(messageText(), settings.font, rows);
	if (!result.ok) {
		setError(`This message is ${result.cols} LEDs wide; the limit is ${MAX_TEXT_COLS}. Shorten it or make the LEDs bigger.`);
	} else {
		setError('');
	}
	return result.ok;
}

function layoutPreview() {
	const canvas = $('preview-canvas');
	const box = $('preview').getBoundingClientRect();
	if (box.width < 1 || box.height < 1) return;
	const rows = rowsForZoom(settings.zoom);
	try {
		previewSign.setLayout(viewport(box.width, box.height, window.devicePixelRatio || 1, rows), settings.shape);
	} catch {
		return; // Too small to draw; the next resize retries.
	}
	canvas.hidden = false;
	loadMessage(previewSign, rows);
}

function previewFrame(now) {
	if (!display.active && previewSign?.layout) {
		const t = (now - previewStart) / 1000;
		previewSign.draw(t, settings);
		if (previewSign.complete(t, settings)) previewStart = now;
	}
	requestAnimationFrame(previewFrame);
}

// ---- Controls --------------------------------------------------------------

function syncControls() {
	$('message').value = settings.text;
	for (const k of RANGE_KEYS) $(k).value = String(settings[k]);
	for (const k of SWITCH_KEYS) $(k).checked = settings[k];
	for (const el of document.querySelectorAll('input[name="font"]')) el.checked = el.value === settings.font;
	for (const el of document.querySelectorAll('input[name="shape"]')) el.checked = el.value === settings.shape;
	$('speed-out').value = settings.speed === 0 ? 'still' : `${settings.speed} LEDs/s`;
	$('blink-note').hidden = !settings.blink;
	applyAccent();
}

function update(patch) {
	const before = settings;
	settings = normalize({ ...settings, ...patch });
	persist();
	syncControls();
	if (before.zoom !== settings.zoom || before.shape !== settings.shape) layoutPreview();
	else if (before.text !== settings.text || before.font !== settings.font) loadMessage(previewSign, rowsForZoom(settings.zoom));
	if (before.text !== settings.text || before.speed !== settings.speed || before.repeat !== settings.repeat) previewStart = performance.now();
}

// Fills a message list with one show button per entry plus a secondary
// action button (Remove for saved messages, Save for recent ones). Entries
// for which action.done holds show the done label with the button disabled.
function renderList(list, items, action) {
	list.replaceChildren();
	for (const text of items) {
		const li = document.createElement('li');
		const use = document.createElement('button');
		use.type = 'button';
		use.className = 'use';
		use.textContent = text;
		use.title = 'Show this message';
		use.addEventListener('click', () => { update({ text }); showSign(); });
		const extra = document.createElement('button');
		extra.type = 'button';
		extra.className = action.className;
		const done = action.done?.(text) ?? false;
		extra.textContent = done ? action.doneLabel : action.label;
		extra.disabled = done;
		extra.setAttribute('aria-label', `${extra.textContent} ${text}`);
		extra.addEventListener('click', () => action.run(text));
		li.append(use, extra);
		list.append(li);
	}
}

function renderSaved() {
	renderList($('saved'), messages, { className: 'remove', label: 'Remove', run: (text) => {
		messages = removeMessage(messages, text);
		saveMessages(storage, messages);
		renderSaved();
	} });
	$('saved-empty').hidden = messages.length > 0;
	renderRecent();
}

function renderRecent() {
	renderList($('recent'), recent, { className: 'keep', label: 'Save', doneLabel: 'Saved', done: (text) => messages.includes(text), run: (text) => {
		messages = addMessage(messages, text);
		saveMessages(storage, messages);
		renderSaved();
	} });
	$('recent-empty').hidden = recent.length > 0;
	$('recent-clear').hidden = recent.length === 0;
}

function setHistory(list) {
	recent = list;
	saveHistory(storage, recent);
	renderRecent();
}

function bindControls() {
	$('message').addEventListener('input', (e) => update({ text: e.target.value }));
	$('message').addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); showSign(); }
	});
	for (const k of RANGE_KEYS) $(k).addEventListener('input', (e) => update({ [k]: Number(e.target.value) }));
	for (const k of SWITCH_KEYS) $(k).addEventListener('change', (e) => update({ [k]: e.target.checked }));
	for (const el of document.querySelectorAll('input[name="font"], input[name="shape"]')) {
		el.addEventListener('change', (e) => update({ [e.target.name]: e.target.value }));
	}
	$('show').addEventListener('click', showSign);
	$('preview').addEventListener('click', showSign);
	$('save-message').addEventListener('click', () => {
		messages = addMessage(messages, settings.text);
		saveMessages(storage, messages);
		renderSaved();
	});
	$('share').addEventListener('click', shareLink);
	$('recent-clear').addEventListener('click', () => setHistory([]));
	$('settings-open').addEventListener('click', () => $('settings').showModal());
	if ('vibrate' in navigator) {
		$('vibrate-row').hidden = false;
		$('vibrate').addEventListener('change', (e) => { vibrateOnFinish = e.target.checked; });
	}
}

async function shareLink() {
	const url = new URL(location.href);
	url.hash = shareHash(settings.text, true);
	try {
		if (navigator.share) await navigator.share({ title: 'LED Sign', url: url.href });
		else {
			await navigator.clipboard.writeText(url.href);
			flashButton($('share'), 'Link copied');
		}
	} catch (err) {
		if (err?.name !== 'AbortError') flashButton($('share'), 'Could not share');
	}
}

function flashButton(button, text) {
	const original = button.textContent;
	button.textContent = text;
	setTimeout(() => { button.textContent = original; }, 1800);
}

// ---- Display mode -----------------------------------------------------------

const display = { active: false, paused: false, start: 0, pausedAt: 0, finished: false, hideTimer: 0, wakeLock: null };

function displayTime(now) {
	return ((display.paused ? display.pausedAt : now) - display.start) / 1000;
}

function layoutDisplay() {
	if (!display.active) return;
	const stage = $('display');
	stage.classList.toggle('safe', !settings.entireScreen);
	const style = getComputedStyle(stage);
	const w = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
	const h = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
	const rows = rowsForZoom(settings.zoom);
	let v;
	try {
		v = displayLayout(w, h, window.devicePixelRatio || 1, rows, settings.allowPortrait);
	} catch {
		return;
	}
	displaySign.setLayout(v, settings.shape);
	$('sign-canvas').classList.toggle('rotated', v.rotate);
	loadMessage(displaySign, rows);
	const tooWide = settings.speed === 0 && displaySign.textCols > v.cols;
	$('display-note').textContent = tooWide ? 'This message is wider than the screen. Set a speed to scroll all of it.' : '';
}

function displayFrame(now) {
	if (!display.active) return;
	const t = displayTime(now);
	displaySign.draw(t, settings);
	if (!display.finished && displaySign.complete(t, settings)) {
		display.finished = true;
		if (vibrateOnFinish) navigator.vibrate?.(200);
		showControls(true);
	}
	requestAnimationFrame(displayFrame);
}

async function acquireWakeLock() {
	if (!('wakeLock' in navigator)) {
		$('wake-status').textContent = 'This browser cannot keep the screen awake. Set Auto-Lock to Never while showing the sign.';
		return;
	}
	try {
		display.wakeLock = await navigator.wakeLock.request('screen');
		display.wakeLock.addEventListener('release', () => { display.wakeLock = null; });
	} catch (err) {
		$('display-note').textContent = 'The screen may dim: the browser refused to keep it awake.';
		$('wake-status').textContent = `The browser refused the last request (${err?.name ?? 'error'}). The screen may sleep while showing the sign.`;
	}
}

function showControls(stay = false) {
	const el = $('display-controls');
	el.classList.add('visible');
	clearTimeout(display.hideTimer);
	if (!stay) display.hideTimer = setTimeout(() => el.classList.remove('visible'), CONTROLS_VISIBLE_MS);
}

function showSign() {
	if ($('show').disabled || display.active) return;
	setHistory(recordHistory(recent, settings.text));
	display.active = true;
	display.paused = false;
	display.finished = false;
	display.start = performance.now();
	$('pause').textContent = 'Pause';
	$('display-note').textContent = '';
	$('display').hidden = false;
	document.body.classList.add('showing');
	const stage = $('display');
	if (!isStandalone() && document.fullscreenEnabled && !document.fullscreenElement) {
		stage.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
	}
	layoutDisplay();
	acquireWakeLock();
	showControls();
	requestAnimationFrame(displayFrame);
}

function exitSign() {
	if (!display.active) return;
	display.active = false;
	clearTimeout(display.hideTimer);
	$('display').hidden = true;
	$('display-controls').classList.remove('visible');
	document.body.classList.remove('showing');
	display.wakeLock?.release().catch(() => {});
	display.wakeLock = null;
	if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
	previewStart = performance.now();
}

function togglePause() {
	const now = performance.now();
	if (display.finished) {
		display.finished = false;
		display.paused = false;
		display.start = now;
	} else if (display.paused) {
		display.start += now - display.pausedAt;
		display.paused = false;
	} else {
		display.pausedAt = now;
		display.paused = true;
	}
	$('pause').textContent = display.paused ? 'Resume' : 'Pause';
	showControls(display.paused);
}

function bindDisplay() {
	$('exit').addEventListener('click', (e) => { e.stopPropagation(); exitSign(); });
	$('pause').addEventListener('click', (e) => { e.stopPropagation(); togglePause(); });
	$('display').addEventListener('click', () => showControls());
	document.addEventListener('keydown', (e) => {
		if (!display.active) return;
		if (e.key === 'Escape') exitSign();
		else if (e.key === ' ') { e.preventDefault(); togglePause(); }
	});
	document.addEventListener('fullscreenchange', () => {
		if (!document.fullscreenElement && display.active && !isStandalone()) showControls();
	});
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible' && display.active && !display.wakeLock) acquireWakeLock();
	});
	const landscape = window.matchMedia('(orientation: landscape)');
	landscape.addEventListener('change', (e) => {
		if (e.matches && settings.startOnRotation && !display.active) showSign();
	});
	let pending = 0;
	const relayout = () => {
		cancelAnimationFrame(pending);
		pending = requestAnimationFrame(() => { layoutPreview(); layoutDisplay(); });
	};
	window.addEventListener('resize', relayout);
	window.visualViewport?.addEventListener('resize', relayout);
	new ResizeObserver(relayout).observe($('preview'));
}

// ---- Installation -----------------------------------------------------------

function bindInstall() {
	if (isStandalone()) return;
	let deferred = null;
	$('install-open').hidden = false;
	$('install-ios').hidden = !isIOS();
	$('install-other').hidden = isIOS();
	window.addEventListener('beforeinstallprompt', (e) => {
		e.preventDefault();
		deferred = e;
		$('install-prompt').hidden = false;
		$('install-other').hidden = true;
	});
	$('install-now').addEventListener('click', async () => {
		if (!deferred) return;
		deferred.prompt();
		await deferred.userChoice.catch(() => null);
		deferred = null;
		$('install').close();
	});
	window.addEventListener('appinstalled', () => { $('install-open').hidden = true; });
	$('install-open').addEventListener('click', () => $('install').showModal());
}

function registerServiceWorker() {
	if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
	navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ---- Startup ----------------------------------------------------------------

async function main() {
	const shared = parseShare(location.hash);
	if (shared) {
		settings = normalize({ ...settings, text: shared.text });
		history.replaceState(null, '', location.pathname + location.search);
	}
	$('storage-note').hidden = storage !== null;
	syncControls();
	renderSaved(); // also renders Recent, whose Save state depends on it
	bindControls();
	bindDisplay();
	bindInstall();
	registerServiceWorker();
	const module = await loadModule('led-sign.wasm');
	previewSign = await Sign.create(module, $('preview-canvas'));
	displaySign = await Sign.create(module, $('sign-canvas'));
	layoutPreview();
	previewStart = performance.now();
	requestAnimationFrame(previewFrame);
	document.documentElement.dataset.ready = '1';
	if (shared?.show) showSign();
}

main().catch((err) => {
	setError(`The sign could not start: ${err.message}`);
	document.documentElement.dataset.ready = 'error';
});
