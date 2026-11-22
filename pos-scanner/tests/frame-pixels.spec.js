/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { isImageDataLike, isTransientFrameError } from "../src/lib/framePixels.js";

describe("framePixels helpers", () => {
	it("flags zxing Invalid input type as transient", () => {
		expect(isTransientFrameError(new TypeError("Invalid input type"))).toBe(true);
		expect(isTransientFrameError(new Error("Cannot capture OCR frame (empty canvas)"))).toBe(true);
		expect(isTransientFrameError(new Error("tessdata missing"))).toBe(false);
	});

	it("detects ImageData-like pixel buffers", () => {
		const data = new Uint8ClampedArray(4);
		expect(isImageDataLike({ width: 1, height: 1, data })).toBe(true);
		expect(isImageDataLike({ width: 1, height: 1 })).toBe(false);
		expect(isImageDataLike(null)).toBe(false);
	});
});
