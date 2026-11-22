import { extractSkuCodes } from "./sku.js";

/** @typedef {{ codes: string[], rawText: string, durationMs: number }} OcrResult */

let workerPromise = null;
let lastOcrError = null;

function isNodeRuntime() {
	return typeof process !== "undefined" && Boolean(process.versions?.node) && typeof window === "undefined";
}

/**
 * Resolve tesseract asset URLs for the browser.
 * Prefer same-origin `ocr/` (vendored via `npm run vendor:ocr`); fall back to the
 * correct jsDelivr packages — never `tesseract.js-core/tessdata` (404).
 */
function assetPaths() {
	const base = import.meta.env?.BASE_URL || "/";
	const localRoot = new URL("ocr/", base.startsWith("http") ? base : `https://placeholder.local${base.endsWith("/") ? base : `${base}/`}`).pathname;
	const useLocal = Boolean(import.meta.env?.PROD) || import.meta.env?.VITE_OCR_LOCAL === "1";
	if (useLocal) {
		return {
			workerPath: `${localRoot}worker.min.js`,
			langPath: localRoot.replace(/\/$/, ""),
			corePath: `${localRoot}tesseract-core-simd-lstm.wasm.js`,
			source: "local",
		};
	}
	return {
		workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
		langPath: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int",
		corePath:
			"https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd-lstm.wasm.js",
		source: "cdn",
	};
}

export function getLastOcrError() {
	return lastOcrError;
}

export async function prepareOcrEngine() {
	if (workerPromise) return workerPromise;
	workerPromise = (async () => {
		const Tesseract = await import("tesseract.js");
		/** @type {Record<string, unknown>} */
		const options = { logger: () => {} };
		// Node ships its own worker + core; only pin browser CDN/local paths.
		if (!isNodeRuntime()) {
			const paths = assetPaths();
			options.workerPath = paths.workerPath;
			options.langPath = paths.langPath;
			options.corePath = paths.corePath;
		} else {
			// Correct lang pack for LSTM OEM (same as browser CDN fallback).
			options.langPath =
				"https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int";
		}
		const worker = await Tesseract.createWorker("eng", 1, options);
		await worker.setParameters({
			tessedit_pageseg_mode: "6",
			preserve_interword_spaces: "1",
		});
		lastOcrError = null;
		return worker;
	})().catch((e) => {
		workerPromise = null;
		lastOcrError = e?.message || String(e);
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
 * @param {HTMLCanvasElement | ImageBitmap | OffscreenCanvas | Blob | ArrayBuffer | Buffer | string} image
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

	const { data } = await worker.recognize(image);
	note(data?.text || "", 1);

	if (image && typeof image === "object" && "width" in image) {
		try {
			const boosted = preprocessOcrCanvas(/** @type {HTMLCanvasElement} */ (image), 2);
			const second = await worker.recognize(boosted);
			note(second?.data?.text || "", 2);
		} catch {
			/* preprocess optional */
		}
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
	}
}

export function getOcrCacheHints() {
	return {
		engine: "tesseract.js v5",
		language: "eng",
		approxSize: "WASM core ~3–5 MB + eng.traineddata ~2–4 MB gzipped differently by host",
		offline: "Vendor with npm run vendor:ocr; assets under public/ocr/",
		paths: isNodeRuntime() ? { source: "node-default" } : assetPaths(),
		lastError: lastOcrError,
	};
}
