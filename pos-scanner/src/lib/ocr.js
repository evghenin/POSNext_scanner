import { set as idbSet, get as idbGet } from "idb-keyval";
import { toCanvas } from "./framePixels.js";
import { extractSkuCodes } from "./sku.js";

/** @typedef {{ codes: string[], rawText: string, durationMs: number }} OcrResult */
/** @typedef {'idle' | 'loading' | 'ready' | 'error'} OcrUiStatus */

let workerPromise = null;
let lastOcrError = null;
/** @type {OcrUiStatus} */
let ocrUiStatus = "idle";
/** @type {Set<(s: { status: OcrUiStatus, message: string, detail?: string | null }) => void>} */
const statusListeners = new Set();

const IDB_LANG_KEY = "./eng.traineddata";
const CDN_LANG =
	"https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz";

function isNodeRuntime() {
	return typeof process !== "undefined" && Boolean(process.versions?.node) && typeof window === "undefined";
}

function setOcrUi(status, message, detail = null) {
	ocrUiStatus = status;
	if (status === "error") lastOcrError = detail || message;
	if (status === "ready") lastOcrError = null;
	const payload = { status, message, detail };
	for (const fn of statusListeners) {
		try {
			fn(payload);
		} catch {
			/* ignore listener errors */
		}
	}
}

export function subscribeOcrStatus(fn) {
	statusListeners.add(fn);
	fn({
		status: ocrUiStatus,
		message: ocrStatusLabel(ocrUiStatus, lastOcrError),
		detail: lastOcrError,
	});
	return () => statusListeners.delete(fn);
}

export function ocrStatusLabel(status = ocrUiStatus, detail = lastOcrError) {
	if (status === "ready") return "OCR готов";
	if (status === "loading") return "OCR загружается…";
	if (status === "error") return `OCR ошибка: ${detail || "неизвестная ошибка"}`;
	return "OCR…";
}

export function getOcrUiStatus() {
	return { status: ocrUiStatus, message: ocrStatusLabel(), detail: lastOcrError };
}

/**
 * Resolve tesseract asset URLs for the browser.
 * Prefer same-origin `ocr/` (vendored via `npm run vendor:ocr`).
 * Tessdata is loaded from CF-safe `eng.traineddata.gz.js` (see seedEngLanguageCache).
 */
function assetPaths() {
	const base = import.meta.env?.BASE_URL || "/";
	const localRoot = new URL(
		"ocr/",
		base.startsWith("http") ? base : `https://placeholder.local${base.endsWith("/") ? base : `${base}/`}`
	).pathname;
	const useLocal = Boolean(import.meta.env?.PROD) || import.meta.env?.VITE_OCR_LOCAL === "1";
	if (useLocal) {
		return {
			workerPath: `${localRoot}worker.min.js`,
			langPath: localRoot.replace(/\/$/, ""),
			/** CF-safe: same gzip bytes as eng.traineddata.gz, .js extension bypasses WAF. */
			langDataUrl: `${localRoot}eng.traineddata.gz.js`,
			/** Canonical name (often blocked by Cloudflare bot challenge). */
			langDataUrlBlocked: `${localRoot}eng.traineddata.gz`,
			corePath: `${localRoot}tesseract-core-simd-lstm.wasm.js`,
			source: "local",
		};
	}
	return {
		workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
		langPath: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int",
		langDataUrl: CDN_LANG,
		langDataUrlBlocked: null,
		corePath:
			"https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd-lstm.wasm.js",
		source: "cdn",
	};
}

export function getLastOcrError() {
	return lastOcrError;
}

/**
 * Fetch binary OCR asset; reject Cloudflare HTML challenge pages.
 * @param {string} url
 */
async function fetchOcrBinary(url) {
	const res = await fetch(url, { credentials: "same-origin", cache: "force-cache" });
	if (!res.ok) {
		throw new Error(`HTTP ${res.status} для ${url}`);
	}
	const ct = (res.headers.get("content-type") || "").toLowerCase();
	const buf = new Uint8Array(await res.arrayBuffer());
	if (ct.includes("text/html") || buf.length < 64 || buf[0] === 0x3c /* '<' */) {
		throw new Error(`Cloudflare/HTML вместо файла (${url})`);
	}
	return buf;
}

/**
 * Pre-seed tesseract.js IndexedDB cache so the worker never requests
 * eng.traineddata.gz (blocked by Cloudflare on some hosts).
 * @param {string} langDataUrl
 */
async function seedEngLanguageCache(langDataUrl) {
	try {
		const existing = await idbGet(IDB_LANG_KEY);
		if (existing && (existing.byteLength || existing.length) > 100_000) {
			return "cache-hit";
		}
	} catch {
		/* continue to fetch */
	}

	const candidates = [langDataUrl, CDN_LANG].filter(Boolean);
	let lastErr = null;
	for (const url of candidates) {
		try {
			const data = await fetchOcrBinary(url);
			// Gzipped or raw traineddata both OK — worker gunzips when magic matches.
			await idbSet(IDB_LANG_KEY, data);
			return url === CDN_LANG ? "cdn-seeded" : "local-seeded";
		} catch (e) {
			lastErr = e;
		}
	}
	throw lastErr || new Error("Не удалось загрузить eng.traineddata");
}

/**
 * HEAD/GET sanity check for worker + core (must be reachable as JS).
 * @param {{ workerPath: string, corePath: string }} paths
 */
async function assertCoreAssets(paths) {
	for (const [label, url] of [
		["worker", paths.workerPath],
		["core", paths.corePath],
	]) {
		const res = await fetch(url, { method: "GET", credentials: "same-origin", cache: "force-cache" });
		if (!res.ok) throw new Error(`${label} ${url} → HTTP ${res.status}`);
		const ct = (res.headers.get("content-type") || "").toLowerCase();
		if (ct.includes("text/html")) {
			throw new Error(`${label} заблокирован (HTML challenge): ${url}`);
		}
	}
}

export async function prepareOcrEngine() {
	if (workerPromise) return workerPromise;
	setOcrUi("loading", "OCR загружается…");
	workerPromise = (async () => {
		const Tesseract = await import("tesseract.js");
		/** @type {Record<string, unknown>} */
		const options = { logger: () => {}, cacheMethod: "readOnly" };
		// Node ships its own worker + core; only pin browser CDN/local paths.
		if (!isNodeRuntime()) {
			const paths = assetPaths();
			options.workerPath = paths.workerPath;
			options.langPath = paths.langPath;
			options.corePath = paths.corePath;
			await assertCoreAssets(paths);
			const seed = await seedEngLanguageCache(paths.langDataUrl);
			if (seed === "cdn-seeded") {
				console.info("[ocr] tessdata seeded from CDN fallback (local CF-blocked)");
			}
		} else {
			options.langPath =
				"https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int";
			delete options.cacheMethod;
		}
		const worker = await Tesseract.createWorker("eng", 1, options);
		await worker.setParameters({
			tessedit_pageseg_mode: "6",
			preserve_interword_spaces: "1",
		});
		setOcrUi("ready", "OCR готов");
		return worker;
	})().catch((e) => {
		workerPromise = null;
		const msg = e?.message || String(e);
		lastOcrError = msg;
		setOcrUi("error", ocrStatusLabel("error", msg), msg);
		throw e;
	});
	return workerPromise;
}

/**
 * Upscale + mild contrast boost for small shelf-tag print.
 * @param {HTMLCanvasElement} source
 * @param {number} [scale]
 * @returns {HTMLCanvasElement | OffscreenCanvas}
 */
export function preprocessOcrCanvas(source, scale = 2) {
	const w = Math.max(1, Math.round(source.width * scale));
	const h = Math.max(1, Math.round(source.height * scale));
	/** @type {HTMLCanvasElement | OffscreenCanvas} */
	let target;
	if (typeof document !== "undefined") {
		target = document.createElement("canvas");
		target.width = w;
		target.height = h;
	} else if (typeof OffscreenCanvas !== "undefined") {
		target = new OffscreenCanvas(w, h);
	} else {
		return source;
	}
	return paintPreprocess(source, target, w, h);
}

function paintPreprocess(source, target, w, h) {
	const ctx = target.getContext("2d", { willReadFrequently: true });
	ctx.imageSmoothingEnabled = true;
	if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
	ctx.drawImage(source, 0, 0, w, h);
	try {
		const img = ctx.getImageData(0, 0, w, h);
		const d = img.data;
		const contrast = 1.35;
		const intercept = 128 * (1 - contrast);
		for (let i = 0; i < d.length; i += 4) {
			const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
			const v = Math.max(0, Math.min(255, contrast * y + intercept));
			d[i] = d[i + 1] = d[i + 2] = v;
		}
		ctx.putImageData(img, 0, 0);
	} catch {
		/* tainted canvas — keep upscale only */
	}
	return target;
}

/**
 * OCR limited to the provided canvas/image (caller crops to reticle).
 * Runs raw + preprocessed passes and merges SKU hits (never silent pick among many).
 *
 * Live camera frames are coerced to HTMLCanvasElement first — Android WebView may
 * hand ImageBitmap / VideoFrame / video elements that tesseract.js rejects.
 *
 * @param {HTMLCanvasElement | ImageBitmap | OffscreenCanvas | Blob | ArrayBuffer | Buffer | string | ImageData} image
 * @returns {Promise<OcrResult>}
 */
export async function recognizeSkuInRegion(image) {
	const started = performance.now();
	const worker = await prepareOcrEngine();
	const texts = [];
	const codeOrder = [];
	const seen = new Set();

	/** @type {Map<string, number>} */
	const votes = new Map();
	const note = (rawText, weight) => {
		texts.push(rawText || "");
		for (const code of extractSkuCodes(rawText)) {
			if (!seen.has(code)) {
				seen.add(code);
				codeOrder.push(code);
			}
			votes.set(code, (votes.get(code) || 0) + weight);
		}
	};

	const canvas = coerceOcrInput(image);
	if (!canvas) {
		throw new TypeError("Cannot capture OCR frame (empty canvas)");
	}

	const { data } = await worker.recognize(canvas);
	note(data?.text || "", 1);

	try {
		const boosted = preprocessOcrCanvas(canvas, 2);
		const second = await worker.recognize(boosted);
		note(second?.data?.text || "", 2);
	} catch {
		/* preprocess optional */
	}

	const ranked = codeOrder.length
		? [...votes.entries()]
				.sort((a, b) => b[1] - a[1] || codeOrder.indexOf(a[0]) - codeOrder.indexOf(b[0]))
				.map(([code]) => code)
		: [];

	return {
		codes: ranked,
		rawText: texts.filter(Boolean).join("\n---\n"),
		durationMs: Math.round(performance.now() - started),
	};
}

/**
 * @param {unknown} image
 * @returns {HTMLCanvasElement | OffscreenCanvas | Blob | ArrayBuffer | Buffer | string | null}
 */
function coerceOcrInput(image) {
	if (image == null) return null;
	// Encoded stills (fixtures / Node) — pass through for tesseract.
	if (typeof image === "string") return image;
	if (typeof Buffer !== "undefined" && Buffer.isBuffer?.(image)) return image;
	if (image instanceof ArrayBuffer) return image;
	if (ArrayBuffer.isView(image) && !(typeof ImageData !== "undefined" && image instanceof ImageData)) {
		return image;
	}
	if (typeof Blob !== "undefined" && image instanceof Blob) return image;

	const canvas = toCanvas(image);
	if (canvas && canvas.width > 0 && canvas.height > 0) return canvas;
	return null;
}

/**
 * Node / fixture helper: OCR a still image with reticle-like crops.
 * Tries a few crop/scale variants (same idea as live raw + preprocess passes).
 *
 * @param {Uint8Array | ArrayBuffer | Buffer} bytes
 * @param {{ crop?: boolean, widthRatio?: number, heightRatio?: number, scale?: number }} [opts]
 * @returns {Promise<OcrResult>}
 */
export async function recognizeSkuFromStillBytes(bytes, opts = {}) {
	const started = performance.now();
	const { crop = true } = opts;
	const { Jimp } = await import("jimp");
	const worker = await prepareOcrEngine();
	const source = Buffer.from(bytes);

	/** @type {{ widthRatio: number, heightRatio: number, scale: number, contrast: boolean }[]} */
	const variants = crop
		? [
				{ widthRatio: 0.72, heightRatio: 0.28, scale: 1, contrast: false },
				{ widthRatio: 0.78, heightRatio: 0.36, scale: 2, contrast: true },
				{ widthRatio: 0.85, heightRatio: 0.4, scale: 2, contrast: true },
			]
		: [{ widthRatio: 1, heightRatio: 1, scale: 2, contrast: true }];

	const texts = [];
	/** @type {Map<string, number>} */
	const votes = new Map();
	/** @type {string[]} */
	const discovery = [];

	for (const v of variants) {
		const img = await Jimp.read(source);
		if (crop && (v.widthRatio < 1 || v.heightRatio < 1)) {
			const rw = Math.floor(img.width * v.widthRatio);
			const rh = Math.floor(img.height * v.heightRatio);
			const sx = Math.floor((img.width - rw) / 2);
			const sy = Math.floor((img.height - rh) / 2);
			img.crop({ x: sx, y: sy, w: rw, h: rh });
		}
		if (v.scale > 1) {
			img.resize({ w: img.width * v.scale, h: img.height * v.scale });
		}
		if (v.contrast) {
			img.greyscale();
			img.contrast(0.25);
		}
		const png = await img.getBuffer("image/png");
		const { data } = await worker.recognize(png);
		const rawText = data?.text || "";
		texts.push(rawText);
		// Prefer sharpened / upscaled passes when soft focus flips 6↔8.
		const weight = v.scale > 1 || v.contrast ? 2 : 1;
		for (const code of extractSkuCodes(rawText)) {
			if (!votes.has(code)) discovery.push(code);
			votes.set(code, (votes.get(code) || 0) + weight);
		}
	}

	const codes = [...votes.entries()]
		.sort((a, b) => b[1] - a[1] || discovery.indexOf(a[0]) - discovery.indexOf(b[0]))
		.map(([code]) => code);

	return {
		codes,
		rawText: texts.filter(Boolean).join("\n---\n"),
		durationMs: Math.round(performance.now() - started),
	};
}

export async function terminateOcr() {
	if (!workerPromise) return;
	try {
		const worker = await workerPromise;
		await worker.terminate();
	} catch {
		/* ignore */
	} finally {
		workerPromise = null;
		ocrUiStatus = "idle";
	}
}

export function getOcrCacheHints() {
	return {
		engine: "tesseract.js v5",
		language: "eng",
		approxSize: "WASM core ~3–5 MB + eng.traineddata ~2–4 MB gzipped differently by host",
		offline: "Vendor with npm run vendor:ocr; assets under public/ocr/ (incl. *.gz.js for CF)",
		paths: isNodeRuntime() ? { source: "node-default" } : assetPaths(),
		lastError: lastOcrError,
		uiStatus: ocrUiStatus,
	};
}
