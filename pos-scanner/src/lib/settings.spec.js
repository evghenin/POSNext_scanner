import { describe, expect, it } from "vitest";
import {
	buildApiOrigin,
	buildScannerPageUrl,
	defaultSettings,
	isBundledUiOrigin,
	migrateSettings,
	normalizeScannerPath,
	normalizeServerUrl,
	validateSettingsPatch,
} from "./settings.js";

describe("settings", () => {
	it("normalizes server URL and path", () => {
		expect(normalizeServerUrl("https://pos.example.com/")).toBe("https://pos.example.com");
		expect(normalizeServerUrl("pos.example.com")).toBe("https://pos.example.com");
		expect(normalizeScannerPath("pos-scanner")).toBe("/pos-scanner");
		expect(normalizeScannerPath("/pos-scanner/")).toBe("/pos-scanner");
	});

	it("migrates unversioned blobs to current version", () => {
		const s = migrateSettings({
			siteUrl: "https://a.example/",
			workMode: "accumulate",
			soundEnabled: false,
		});
		expect(s.version).toBe(3);
		expect(s.serverUrl).toBe("https://a.example");
		expect(s.workMode).toBe("accumulate");
		expect(s.soundEnabled).toBe(false);
		expect(s.scannerPath).toBe("/pos-scanner");
	});

	it("replaces bundled UI origins / example.com with live ERP default", () => {
		const s = migrateSettings({
			version: 1,
			serverUrl: "https://appassets.androidplatform.net",
		});
		expect(s.serverUrl).toBe("https://erp.hotel-life.md");
		expect(isBundledUiOrigin("https://appassets.androidplatform.net")).toBe(true);
		const demo = migrateSettings({ version: 2, serverUrl: "https://example.com" });
		expect(demo.serverUrl).toBe("https://erp.hotel-life.md");
	});

	it("builds page and API URLs", () => {
		expect(
			buildScannerPageUrl({ serverUrl: "https://a.example", scannerPath: "/pos-scanner" })
		).toBe("https://a.example/pos-scanner");
		expect(buildApiOrigin({ serverUrl: "https://a.example/" })).toBe("https://a.example");
	});

	it("rejects invalid server URL and bundled origins", () => {
		expect(validateSettingsPatch({ ...defaultSettings(), serverUrl: "not a url" }).ok).toBe(
			false
		);
		expect(
			validateSettingsPatch({
				...defaultSettings(),
				serverUrl: "https://appassets.androidplatform.net",
			}).ok
		).toBe(false);
	});
});
