import { describe, expect, it } from "vitest";
import { createDedupe } from "./dedupe.js";

describe("createDedupe", () => {
	it("accepts first then suppresses within TTL", () => {
		const d = createDedupe({ ttlMs: 1000 });
		expect(d.accept("EAN123", 1000)).toBe(true);
		expect(d.accept("ean123", 1500)).toBe(false);
		expect(d.accept("EAN123", 2100)).toBe(true);
	});

	it("forget allows immediate rescan", () => {
		const d = createDedupe({ ttlMs: 5000 });
		expect(d.accept("SKU00001", 0)).toBe(true);
		d.forget("sku00001");
		expect(d.accept("SKU00001", 10)).toBe(true);
	});
});
