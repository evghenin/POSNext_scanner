import { describe, expect, it } from "vitest";
import { extractSkuCodes } from "./sku.js";

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
});
