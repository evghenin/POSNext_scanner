import { describe, expect, it } from "vitest";
import { addToCart, emptyCart, ensurePendingSend, removeLine, setLineQty } from "./cart.js";

describe("cart", () => {
	it("merges same item+uom and keeps different uom separate", () => {
		let s = emptyCart();
		s = addToCart(s, {
			item_code: "SKU1",
			item_name: "Item",
			qty: 1,
			uom: "Nos",
			rate: 10,
		});
		s = addToCart(s, {
			item_code: "SKU1",
			item_name: "Item",
			qty: 2,
			uom: "Nos",
			rate: 10,
		});
		s = addToCart(s, {
			item_code: "SKU1",
			item_name: "Item",
			qty: 1,
			uom: "Box",
			rate: 10,
			conversion_factor: 12,
		});
		expect(s.lines).toHaveLength(2);
		expect(s.lines.find((l) => l.uom === "Nos")?.qty).toBe(3);
		expect(s.lines.find((l) => l.uom === "Box")?.qty).toBe(1);
	});

	it("rejects missing rate", () => {
		let s = emptyCart();
		s = addToCart(s, {
			item_code: "SKU1",
			item_name: "Item",
			qty: 1,
			uom: "Nos",
			rate: null,
		});
		expect(s.lines).toHaveLength(0);
	});

	it("edits and removes lines; pending send is stable for same generation", () => {
		let s = emptyCart();
		s = addToCart(s, {
			item_code: "A",
			item_name: "A",
			qty: 1,
			uom: "Nos",
			rate: 1,
		});
		const id = s.lines[0].id;
		s = setLineQty(s, id, 5);
		expect(s.lines[0].qty).toBe(5);
		s = ensurePendingSend(s, "gen-1");
		const batch = s.pendingSend.batchId;
		const op = s.pendingSend.operations[0].operation_id;
		s = ensurePendingSend(s, "gen-1");
		expect(s.pendingSend.batchId).toBe(batch);
		expect(s.pendingSend.operations[0].operation_id).toBe(op);
		s = removeLine(s, id);
		expect(s.lines).toHaveLength(0);
		expect(s.pendingSend).toBe(null);
	});
});
