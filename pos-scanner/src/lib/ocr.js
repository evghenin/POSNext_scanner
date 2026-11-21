import { extractSkuCodes } from "./sku.js";

/** @typedef {{ codes: string[], rawText: string, durationMs: number }} OcrResult */

let workerPromise = null;

/**
 * Resolve tesseract asset URLs so the traineddata + WASM can be pre-cached
 * by a service worker (same-origin in production builds).
 */
function assetPaths() {
	const base = import.meta.env.BASE_URL || "/";
	return {
		// CDN in dev keeps install small; production PWA should mirror under public/ocr/
		workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js",
		langPath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tessdata",
		corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core-simd.wasm.js",
		// Hint for SW precache docs — eng.traineddata ~2–4 MB compressed.
		note: `Serve/cached from ${base}ocr/ in production`,
	};
}

export async function prepareOcrEngine() {
	if (workerPromise) return workerPromise;
	workerPromise = (async () => {
		const Tesseract = await import("tesseract.js");
		const paths = assetPaths();
		const worker = await Tesseract.createWorker("eng", 1, {
			workerPath: paths.workerPath,
			langPath: paths.langPath,
			corePath: paths.corePath,
			logger: () => {},
		});
		await worker.setParameters({
			tessedit_pageseg_mode: "6", // assume a uniform block of text in the reticle
			preserve_interword_spaces: "1",
		});
		return worker;
	})();
	return workerPromise;
}

/**
 * OCR limited to the provided canvas/image (caller crops to reticle).
 * Never silently picks among multiple SKU matches — returns all.
 *
 * @param {HTMLCanvasElement | ImageBitmap | OffscreenCanvas} image
 * @returns {Promise<OcrResult>}
 */
export async function recognizeSkuInRegion(image) {
	const started = performance.now();
	const worker = await prepareOcrEngine();
	const { data } = await worker.recognize(image);
	const rawText = data?.text || "";
	const codes = extractSkuCodes(rawText);
	return {
		codes,
		rawText,
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
		offline: "Must precache worker, core, and traineddata before offline OCR; see README",
		paths: assetPaths(),
	};
}
