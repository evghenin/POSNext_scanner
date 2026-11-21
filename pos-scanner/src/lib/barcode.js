import { NATIVE_FORMATS, ZXING_FORMATS, normalizeFormatLabel } from "./formats.js";
import zxingWasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

/** @typedef {{ value: string, format: string, engine: "native" | "zxing" }} BarcodeHit */

let zxingReady = null;
let nativeDetector = null;
let nativeChecked = false;

/**
 * Lazy-load zxing-wasm reader; WASM is same-origin via Vite `?url` import
 * so a service worker can precache it for offline.
 */
export async function prepareBarcodeEngine() {
	if (zxingReady) return zxingReady;
	zxingReady = (async () => {
		const { prepareZXingModule, readBarcodes } = await import("zxing-wasm/reader");
		await prepareZXingModule({
			locateFile: (path, prefix) => {
				if (path.endsWith(".wasm")) return zxingWasmUrl;
				return `${prefix}${path}`;
			},
		});
		return { readBarcodes };
	})();
	return zxingReady;
}

async function getNativeDetector() {
	if (nativeChecked) return nativeDetector;
	nativeChecked = true;
	if (typeof window === "undefined" || typeof window.BarcodeDetector !== "function") {
		return null;
	}
	try {
		const supported =
			typeof window.BarcodeDetector.getSupportedFormats === "function"
				? await window.BarcodeDetector.getSupportedFormats()
				: [];
		const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
		// Need at least retail 1D or QR; Safari may expose a broken constructor.
		if (!formats.includes("ean_13") && !formats.includes("qr_code")) {
			nativeDetector = null;
			return null;
		}
		nativeDetector = new window.BarcodeDetector({ formats });
	} catch {
		nativeDetector = null;
	}
	return nativeDetector;
}

/**
 * Decode barcodes from ImageBitmap / HTMLCanvasElement / ImageData / Blob.
 * Prefers native BarcodeDetector when formats are actually usable; always
 * falls back to zxing-wasm (required for Safari / PDF417 / Data Matrix parity).
 *
 * @param {ImageBitmap | HTMLCanvasElement | ImageData | Blob | HTMLVideoElement} source
 * @param {{ preferNative?: boolean }} [opts]
 * @returns {Promise<BarcodeHit[]>}
 */
export async function decodeBarcodes(source, { preferNative = true } = {}) {
	const hits = [];

	if (preferNative) {
		const detector = await getNativeDetector();
		if (detector) {
			try {
				const detected = await detector.detect(source);
				for (const d of detected) {
					const value = String(d.rawValue || "").trim();
					if (!value) continue;
					hits.push({
						value,
						format: normalizeFormatLabel(d.format),
						engine: "native",
					});
				}
				if (hits.length) return dedupeHits(hits);
			} catch {
				/* fall through to zxing */
			}
		}
	}

	const { readBarcodes } = await prepareBarcodeEngine();
	const results = await readBarcodes(source, {
		tryHarder: true,
		tryInvert: true,
		formats: [...ZXING_FORMATS],
		maxNumberOfSymbols: 4,
	});

	for (const r of results || []) {
		const value = String(r.text || "").trim();
		if (!value) continue;
		hits.push({
			value,
			format: normalizeFormatLabel(r.format),
			engine: "zxing",
		});
	}
	return dedupeHits(hits);
}

/** @param {BarcodeHit[]} hits */
function dedupeHits(hits) {
	const seen = new Set();
	const out = [];
	for (const h of hits) {
		const key = `${h.format}|${h.value}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(h);
	}
	return out;
}

export async function getBarcodeEngineInfo() {
	const native = await getNativeDetector();
	await prepareBarcodeEngine();
	return {
		zxing: true,
		native: Boolean(native),
		formats: ZXING_FORMATS.map(normalizeFormatLabel),
		wasmUrl: zxingWasmUrl,
	};
}
