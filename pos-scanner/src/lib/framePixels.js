/**
 * Coerce camera / DOM frame sources into forms zxing-wasm and tesseract.js accept.
 *
 * zxing-wasm@2 throws TypeError("Invalid input type") for bare HTMLCanvasElement /
 * HTMLVideoElement / ImageBitmap — it needs ImageData-like `{ width, height, data }`
 * or encoded bytes (Uint8Array / Blob).
 *
 * tesseract.js browser loadImage handles CANVAS via toBlob, but not ImageBitmap /
 * VideoFrame; we always feed it an HTMLCanvasElement (or PNG blob).
 */

/**
 * @param {unknown} source
 * @returns {source is { width: number, height: number, data: ArrayBufferView | ArrayLike<number> }}
 */
export function isImageDataLike(source) {
	return Boolean(
		source &&
			typeof source === "object" &&
			"width" in source &&
			"height" in source &&
			"data" in source &&
			source.data &&
			typeof source.data === "object" &&
			"byteLength" in source.data
	);
}

/**
 * Draw any supported frame source onto a canvas (reuses `target` when provided).
 * @param {unknown} source
 * @param {HTMLCanvasElement} [target]
 * @returns {HTMLCanvasElement | null}
 */
export function toCanvas(source, target) {
	if (source == null) return null;

	if (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) {
		if (!source.width || !source.height) return null;
		if (!target || target === source) return source;
		target.width = source.width;
		target.height = source.height;
		const ctx = target.getContext("2d", { willReadFrequently: true });
		if (!ctx) return null;
		ctx.drawImage(source, 0, 0);
		return target;
	}

	if (typeof OffscreenCanvas !== "undefined" && source instanceof OffscreenCanvas) {
		if (!source.width || !source.height) return null;
		const canvas = target || (typeof document !== "undefined" ? document.createElement("canvas") : null);
		if (!canvas) return null;
		canvas.width = source.width;
		canvas.height = source.height;
		const ctx = canvas.getContext("2d", { willReadFrequently: true });
		if (!ctx) return null;
		ctx.drawImage(source, 0, 0);
		return canvas;
	}

	if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
		if (!source.width || !source.height) return null;
		const canvas = target || (typeof document !== "undefined" ? document.createElement("canvas") : null);
		if (!canvas) return null;
		canvas.width = source.width;
		canvas.height = source.height;
		const ctx = canvas.getContext("2d", { willReadFrequently: true });
		if (!ctx) return null;
		ctx.drawImage(source, 0, 0);
		return canvas;
	}

	if (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement) {
		const vw = source.videoWidth;
		const vh = source.videoHeight;
		if (!vw || !vh || source.readyState < 2) return null;
		const canvas = target || document.createElement("canvas");
		canvas.width = vw;
		canvas.height = vh;
		const ctx = canvas.getContext("2d", { willReadFrequently: true });
		if (!ctx) return null;
		ctx.drawImage(source, 0, 0, vw, vh);
		return canvas;
	}

	// WebCodecs VideoFrame (some Chromium WebViews)
	if (typeof VideoFrame !== "undefined" && source instanceof VideoFrame) {
		const w = source.displayWidth || source.codedWidth;
		const h = source.displayHeight || source.codedHeight;
		if (!w || !h) return null;
		const canvas = target || (typeof document !== "undefined" ? document.createElement("canvas") : null);
		if (!canvas) return null;
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext("2d", { willReadFrequently: true });
		if (!ctx) return null;
		ctx.drawImage(source, 0, 0, w, h);
		return canvas;
	}

	if (isImageDataLike(source)) {
		const w = source.width;
		const h = source.height;
		if (!w || !h) return null;
		const canvas = target || (typeof document !== "undefined" ? document.createElement("canvas") : null);
		if (!canvas) return null;
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext("2d", { willReadFrequently: true });
		if (!ctx) return null;
		const img =
			typeof ImageData !== "undefined" && !(source instanceof ImageData)
				? new ImageData(new Uint8ClampedArray(source.data), w, h)
				: /** @type {ImageData} */ (source);
		ctx.putImageData(img, 0, 0);
		return canvas;
	}

	return null;
}

/**
 * @param {unknown} source
 * @param {HTMLCanvasElement} [scratch]
 * @returns {ImageData | null}
 */
export function toImageData(source, scratch) {
	if (isImageDataLike(source) && typeof ImageData !== "undefined" && source instanceof ImageData) {
		return source;
	}
	if (isImageDataLike(source)) {
		const w = source.width;
		const h = source.height;
		const bytes =
			source.data instanceof Uint8ClampedArray
				? source.data
				: new Uint8ClampedArray(source.data.buffer, source.data.byteOffset, source.data.byteLength);
		return typeof ImageData !== "undefined" ? new ImageData(bytes, w, h) : /** @type {any} */ ({ width: w, height: h, data: bytes });
	}
	const canvas = toCanvas(source, scratch);
	if (!canvas || !canvas.width || !canvas.height) return null;
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) return null;
	try {
		return ctx.getImageData(0, 0, canvas.width, canvas.height);
	} catch {
		return null;
	}
}

/**
 * True for frame-shape / WebView quirks that should not become a sticky HUD error.
 * @param {unknown} err
 */
export function isTransientFrameError(err) {
	const msg = String(err?.message || err || "");
	return /invalid input type|empty (canvas|frame)|no (frame|pixels)|getImageData|tainted|readyState|videoWidth|convert.*frame|cannot capture/i.test(
		msg
	);
}
