import { describe, expect, it } from "vitest";
import { extractSkuCodes, normalizeOcrText } from "./sku.js";

describe("extractSkuCodes", () => {
	it("finds SKU with case fold and uppercases", () => {
		expect(extractSkuCodes("артикул sku00673 на полке")).toEqual(["SKU00673"]);
	});

	it("requires word boundary and exactly 5 digits", () => {
		expect(extractSkuCodes("XSKU00673 Y SKU1234 Z SKU123456")).toEqual([]);
		expect(extractSkuCodes("SKU12345")).toEqual(["SKU12345"]);
	});

	it("dedupes multi-match preserving order", () => {
		expect(extractSkuCodes("SKU00001 and sku00002 then SKU00001")).toEqual([
			"SKU00001",
			"SKU00002",
		]);
	});

	it("recovers common OCR confusions", () => {
		expect(extractSkuCodes("артикул SKUO0776")).toEqual(["SKU00776"]);
		expect(extractSkuCodes("scu00668 on tag")).toEqual(["SKU00668"]);
		expect(extractSkuCodes("SKU 0 0 7 7 6")).toEqual(["SKU00776"]);
	});
});

describe("normalizeOcrText", () => {
	it("folds SCU / spaced SKU prefixes", () => {
		expect(normalizeOcrText("scu00668")).toContain("SKU00668");
		expect(normalizeOcrText("S K U00776")).toContain("SKU");
	});
});
