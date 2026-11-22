import { describe, expect, it } from "vitest";
import { mapLookupResponse } from "./itemLookup.js";

describe("mapLookupResponse", () => {
	it("maps a found payload with price and uoms", () => {
		const r = mapLookupResponse("https://erp.example.com", "SKU00012", {
			found: true,
			code: "SKU00012",
			item_code: "SKU00012",
			item_name: "Widget",
			image: "/files/w.png",
			stock_uom: "Nos",
			price: 12.5,
			currency: "MDL",
			uoms: [
				{ uom: "Nos", conversion_factor: 1 },
				{ uom: "Box", conversion_factor: 12 },
			],
			matched_by: "item_code",
			barcode_uom: "Nos",
		});
		expect(r.found).toBe(true);
		expect(r.item.item_code).toBe("SKU00012");
		expect(r.item.rate).toBe(12.5);
		expect(r.item.uom_details).toEqual([
			{ uom: "Nos", conversion_factor: 1 },
			{ uom: "Box", conversion_factor: 12 },
		]);
		expect(r.item.image).toBe("https://erp.example.com/files/w.png");
	});

	it("keeps found item with null price (caller must not add)", () => {
		const r = mapLookupResponse("https://erp.example.com", "SKU1", {
			found: true,
			item_code: "SKU1",
			item_name: "No price",
			stock_uom: "Nos",
			price: null,
			uoms: [{ uom: "Nos", conversion_factor: 1 }],
		});
		expect(r.found).toBe(true);
		expect(r.item.rate).toBeNull();
	});

	it("maps not_found and not_for_sale", () => {
		expect(
			mapLookupResponse("https://erp.example.com", "X", {
				found: false,
				code: "X",
				reason: "not_found",
			})
		).toMatchObject({ found: false, error: "item_missing", reason: "not_found" });

		expect(
			mapLookupResponse("https://erp.example.com", "Y", {
				found: false,
				reason: "not_for_sale",
			})
		).toMatchObject({ found: false, error: "not_for_sale", reason: "not_for_sale" });
	});
});
