import { describe, expect, it } from "vitest";
import {
	buildScannerPageUrl,
	defaultSettings,
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

	it("migrates unversioned blobs to v1", () => {
		const s = migrateSettings({
			siteUrl: "https://a.example/",
			workMode: "accumulate",
			soundEnabled: false,
		});
		expect(s.version).toBe(1);
		expect(s.serverUrl).toBe("https://a.example");
		expect(s.workMode).toBe("accumulate");
		expect(s.soundEnabled).toBe(false);
		expect(s.scannerPath).toBe("/pos-scanner");
	});

	it("builds page URL", () => {
		expect(
			buildScannerPageUrl({ serverUrl: "https://a.example", scannerPath: "/pos-scanner" })
		).toBe("https://a.example/pos-scanner");
	});

	it("rejects invalid server URL", () => {
		const r = validateSettingsPatch({ ...defaultSettings(), serverUrl: "not a url" });
		expect(r.ok).toBe(false);
	});
});
