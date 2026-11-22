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

	it("finds NSU##### case-insensitively", () => {
		expect(extractSkuCodes("shelf nsu00001")).toEqual(["NSU00001"]);
		expect(extractSkuCodes("NSU00001")).toEqual(["NSU00001"]);
		expect(extractSkuCodes("XNSU00001 Y NSU1234 Z NSU123456")).toEqual([]);
		expect(extractSkuCodes("NSU 0 0 0 0 1")).toEqual(["NSU00001"]);
	});

	it("finds SRV##### case-insensitively", () => {
		expect(extractSkuCodes("service srv00001")).toEqual(["SRV00001"]);
		expect(extractSkuCodes("SRV00001")).toEqual(["SRV00001"]);
		expect(extractSkuCodes("XSRV00001 Y SRV1234 Z SRV123456")).toEqual([]);
		expect(extractSkuCodes("SRV 0 0 0 0 1")).toEqual(["SRV00001"]);
	});

	it("extracts mixed SKU / NSU / SRV in discovery order", () => {
		expect(extractSkuCodes("sku00776 and nsu00001 then srv00001")).toEqual([
			"SKU00776",
			"NSU00001",
			"SRV00001",
		]);
	});
});

describe("normalizeOcrText", () => {
	it("folds SCU / spaced SKU prefixes", () => {
		expect(normalizeOcrText("scu00668")).toContain("SKU00668");
		expect(normalizeOcrText("S K U00776")).toContain("SKU");
	});

	it("folds spaced NSU / SRV prefixes", () => {
		expect(normalizeOcrText("N S U00001")).toContain("NSU");
		expect(normalizeOcrText("nsuo0001")).toContain("NSU0");
		expect(normalizeOcrText("S R V00001")).toContain("SRV");
		expect(normalizeOcrText("srvo0001")).toContain("SRV0");
	});
});
