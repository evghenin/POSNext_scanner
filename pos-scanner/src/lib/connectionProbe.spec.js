import { describe, expect, it } from "vitest";
import { probeMessage, probeScannerEndpoint } from "./connectionProbe.js";

describe("connectionProbe", () => {
	it("returns invalid_url for empty config", async () => {
		const r = await probeScannerEndpoint({ serverUrl: "" });
		expect(r.ok).toBe(false);
		expect(r.kind).toBe("invalid_url");
	});

	it("maps not_found message for missing scanner", () => {
		const r = probeMessage("not_found", "https://a.example/pos-scanner", 404);
		expect(r.title).toMatch(/нет приложения сканера/i);
		expect(r.steps.length).toBeGreaterThan(1);
	});

	it("treats 404 as not_found", async () => {
		const fetchImpl = async () =>
			/** @type {any} */ ({
				status: 404,
				ok: false,
			});
		const r = await probeScannerEndpoint(
			{ serverUrl: "https://shop.example", scannerPath: "/pos-scanner" },
			{ fetchImpl }
		);
		expect(r.ok).toBe(false);
		expect(r.kind).toBe("not_found");
	});

	it("ok when primary returns 200", async () => {
		const fetchImpl = async () =>
			/** @type {any} */ ({
				status: 200,
				ok: true,
			});
		const r = await probeScannerEndpoint(
			{ serverUrl: "https://shop.example", scannerPath: "/pos-scanner" },
			{ fetchImpl }
		);
		expect(r.ok).toBe(true);
		expect(r.kind).toBe("ok");
	});
});
