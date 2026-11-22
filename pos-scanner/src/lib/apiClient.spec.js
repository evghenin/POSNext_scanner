import { describe, expect, it } from "vitest";
import { formatFrappeError } from "./apiClient.js";

describe("formatFrappeError", () => {
	it("includes method and exc_type", () => {
		const err = new Error("cart_generation mismatch");
		err.excType = "ValidationError";
		err.payload = { exc_type: "ValidationError" };
		const out = formatFrappeError(err, "pos_next.api.mobile_scanner.enqueue_commands");
		expect(out.message).toContain("enqueue_commands");
		expect(out.message).toContain("ValidationError");
		expect(out.message).toContain("cart_generation mismatch");
	});
});
