import { describe, expect, it } from "vitest";
import {
	buildApiOrigin,
	buildScannerPageUrl,
	defaultSettings,
	hasSavedSettings,
	isBundledUiOrigin,
	migrateSettings,
	normalizeScannerPath,
	normalizeServerUrl,
	validateSettingsPatch,
} from "./settings.js";

describe("settings", () => {
	it("defaults: empty URL, English, system theme, not configured", () => {
		const s = defaultSettings();
		expect(s.serverUrl).toBe("");
		expect(s.language).toBe("en");
		expect(s.theme).toBe("system");
		expect(s.configured).toBe(false);
		expect(s.version).toBe(4);
	});

	it("normalizes server URL and path", () => {
		expect(normalizeServerUrl("https://pos.example.com/")).toBe("https://pos.example.com");
		expect(normalizeServerUrl("pos.example.com")).toBe("https://pos.example.com");
		expect(normalizeScannerPath("pos-scanner")).toBe("/pos-scanner");
		expect(normalizeScannerPath("/pos-scanner/")).toBe("/pos-scanner");
	});

	it("migrates unversioned blobs; empty example.com; language en default", () => {
		const s = migrateSettings({
			siteUrl: "https://a.example/",
			workMode: "accumulate",
			soundEnabled: false,
		});
		expect(s.version).toBe(4);
		expect(s.serverUrl).toBe("https://a.example");
		expect(s.workMode).toBe("accumulate");
		expect(s.soundEnabled).toBe(false);
		expect(s.language).toBe("en");
		expect(s.theme).toBe("system");
	});

	it("clears bundled UI origins; marks pre-v4 with URL as configured", () => {
		const s = migrateSettings({
			version: 3,
			serverUrl: "https://erp.hotel-life.md",
			language: "ru",
		});
		expect(s.serverUrl).toBe("https://erp.hotel-life.md");
		expect(s.configured).toBe(true);
		expect(s.language).toBe("ru");
		expect(isBundledUiOrigin("https://appassets.androidplatform.net")).toBe(true);
		const cleared = migrateSettings({
			version: 2,
			serverUrl: "https://appassets.androidplatform.net",
		});
		expect(cleared.serverUrl).toBe("");
		expect(cleared.configured).toBe(false);
	});

	it("builds page and API URLs", () => {
		expect(
			buildScannerPageUrl({ serverUrl: "https://a.example", scannerPath: "/pos-scanner" })
		).toBe("https://a.example/pos-scanner");
		expect(buildApiOrigin({ serverUrl: "https://a.example/" })).toBe("https://a.example");
	});

	it("rejects empty / invalid / bundled URLs", () => {
		expect(validateSettingsPatch({ ...defaultSettings(), serverUrl: "" }).ok).toBe(false);
		expect(validateSettingsPatch({ ...defaultSettings(), serverUrl: "not a url" }).ok).toBe(
			false
		);
		expect(
			validateSettingsPatch({
				...defaultSettings(),
				serverUrl: "https://appassets.androidplatform.net",
			}).ok
		).toBe(false);
		const ok = validateSettingsPatch({
			...defaultSettings(),
			serverUrl: "https://erp.hotel-life.md",
			language: "ro",
			theme: "dark",
		});
		expect(ok.ok).toBe(true);
		if (ok.ok) {
			expect(ok.settings.configured).toBe(true);
			expect(ok.settings.language).toBe("ro");
			expect(ok.settings.theme).toBe("dark");
		}
	});

	it("hasSavedSettings is false without localStorage blob", () => {
		expect(hasSavedSettings()).toBe(false);
	});
});
