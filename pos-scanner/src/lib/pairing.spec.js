import { describe, expect, it } from "vitest";
import { parsePairingQrPayload } from "./pairing.js";

describe("parsePairingQrPayload", () => {
	it("parses JSON qr_token", () => {
		expect(parsePairingQrPayload('{"qr_token":"abcDEF1234567890xy"}')).toBe(
			"abcDEF1234567890xy"
		);
		expect(parsePairingQrPayload('{"v":1,"t":"posnext_pair","token":"tok_ABCDEFGHIJKLMNOP"}')).toBe(
			"tok_ABCDEFGHIJKLMNOP"
		);
	});

	it("parses URL query", () => {
		expect(
			parsePairingQrPayload("https://erp.example.com/pair?qr_token=zzzzzzzzzzzzzzzzzz")
		).toBe("zzzzzzzzzzzzzzzzzz");
	});

	it("parses compact and bare tokens", () => {
		expect(parsePairingQrPayload("posnext_pair:abcdefghijklmnop")).toBe("abcdefghijklmnop");
		expect(parsePairingQrPayload("ABCDEFGHIJKLMNOPQRST")).toBe("ABCDEFGHIJKLMNOPQRST");
	});

	it("rejects empty / short noise", () => {
		expect(parsePairingQrPayload("")).toBe(null);
		expect(parsePairingQrPayload("sku00776")).toBe(null);
	});
});
