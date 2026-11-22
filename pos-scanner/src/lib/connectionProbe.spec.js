import { describe, expect, it } from "vitest";
import {
	looksLikeFrappeNotFound,
	probeApiEndpoint,
	probeMessage,
	probeScannerEndpoint,
} from "./connectionProbe.js";

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

	it("maps api not_found differently", () => {
		const r = probeMessage("not_found", "https://a.example/api/method/frappe.ping", 404, "api");
		expect(r.title).toMatch(/API/i);
	});

	it("detects Frappe soft-404 HTML", () => {
		expect(
			looksLikeFrappeNotFound(
				'<html>Powered by ERPNext</html><h1>Здесь ничего нет</h1>'
			)
		).toBe(true);
		expect(looksLikeFrappeNotFound("<html>POSNext Scanner</html>")).toBe(false);
	});

	it("treats 404 as not_found", async () => {
		const fetchImpl = async () =>
			/** @type {any} */ ({
				status: 404,
				ok: false,
				text: async () => "",
			});
		const r = await probeScannerEndpoint(
			{ serverUrl: "https://shop.example", scannerPath: "/pos-scanner" },
			{ fetchImpl }
		);
		expect(r.ok).toBe(false);
		expect(r.kind).toBe("not_found");
	});

	it("treats HTTP 200 soft-404 body as not_found", async () => {
		const fetchImpl = async () =>
			/** @type {any} */ ({
				status: 200,
				ok: true,
				text: async () =>
					"Powered by Frappe · Здесь ничего нет · page not found",
			});
		const r = await probeScannerEndpoint(
			{ serverUrl: "https://shop.example", scannerPath: "/pos-scanner" },
			{ fetchImpl }
		);
		expect(r.ok).toBe(false);
		expect(r.kind).toBe("not_found");
	});

	it("ok when primary returns 200 without soft-404", async () => {
		const fetchImpl = async () =>
			/** @type {any} */ ({
				status: 200,
				ok: true,
				text: async () => "<html>POSNext Scanner</html>",
			});
		const r = await probeScannerEndpoint(
			{ serverUrl: "https://shop.example", scannerPath: "/pos-scanner" },
			{ fetchImpl }
		);
		expect(r.ok).toBe(true);
		expect(r.kind).toBe("ok");
	});

	it("probeApiEndpoint hits frappe.ping", async () => {
		/** @type {string[]} */
		const urls = [];
		const fetchImpl = async (url) => {
			urls.push(String(url));
			return /** @type {any} */ ({
				status: 200,
				ok: true,
				text: async () => '{"message":"pong"}',
			});
		};
		const r = await probeApiEndpoint({ serverUrl: "https://shop.example" }, { fetchImpl });
		expect(r.ok).toBe(true);
		expect(urls[0]).toBe("https://shop.example/api/method/frappe.ping");
		expect(r.description).toMatch(/API/i);
	});
});
