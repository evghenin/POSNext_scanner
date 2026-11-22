/**
 * Versioned scanner settings (localStorage). Schema bumps migrate in place.
 * Settings UI: ERP URL, language, theme only — no phone credentials.
 */

import { normalizeI18nLanguage } from "./i18n.js";
import { normalizeTheme } from "./theme.js";

export const SETTINGS_KEY = "posnext.scanner.settings";
export const SETTINGS_VERSION = 5;

/** Production ERPNext / POSNext API origin (Hotel Life) — placeholder only until first save. */
export const DEFAULT_API_ORIGIN = "https://erp.hotel-life.md";

/** @typedef {"immediate" | "accumulate"} WorkMode */
/** @typedef {"en" | "ro" | "ru"} LanguageCode */
/** @typedef {"dark" | "light" | "system"} ThemeMode */

/**
 * @typedef {object} ScannerSettings
 * @property {number} version
 * @property {boolean} configured User completed at least one Save
 * @property {string} serverUrl HTTPS origin, no trailing slash
 * @property {string} scannerPath path starting with / (optional hosted PWA)
 * @property {WorkMode} workMode
 * @property {boolean} soundEnabled
 * @property {boolean} vibrateEnabled
 * @property {boolean} torchDefault
 * @property {LanguageCode} language
 * @property {ThemeMode} theme
 */

/** Origins that mean "UI is local", not an ERP API host. */
export function isBundledUiOrigin(origin) {
	const o = String(origin || "");
	if (!o || o === "null") return true;
	try {
		const u = new URL(o.includes("://") ? o : `https://${o}`);
		const host = (u.hostname || "").toLowerCase();
		return (
			host === "appassets.androidplatform.net" ||
			host === "localhost" ||
			u.protocol === "file:"
		);
	} catch {
		return o.startsWith("file:");
	}
}

/** @returns {ScannerSettings} */
export function defaultSettings() {
	return {
		version: SETTINGS_VERSION,
		configured: false,
		serverUrl: "",
		scannerPath: "/pos-scanner",
		workMode: "immediate",
		soundEnabled: true,
		vibrateEnabled: true,
		torchDefault: false,
		language: "en",
		theme: "system",
	};
}

/**
 * True when the user has saved settings at least once (localStorage present + configured).
 * @returns {boolean}
 */
export function hasSavedSettings() {
	if (typeof localStorage === "undefined") return false;
	try {
		const raw = localStorage.getItem(SETTINGS_KEY);
		if (!raw) return false;
		const parsed = JSON.parse(raw);
		const s = migrateSettings(parsed);
		return Boolean(s.configured && s.serverUrl);
	} catch {
		return false;
	}
}

/**
 * @param {unknown} raw
 * @returns {ScannerSettings}
 */
export function migrateSettings(raw) {
	const base = defaultSettings();
	if (!raw || typeof raw !== "object") return base;
	const o = /** @type {Record<string, unknown>} */ (raw);
	const version = typeof o.version === "number" ? o.version : 0;

	let serverUrl = normalizeServerUrl(String(o.serverUrl ?? o.siteUrl ?? ""));
	if (serverUrl && isBundledUiOrigin(serverUrl)) serverUrl = "";
	if (serverUrl && serverUrl.includes("example.com")) serverUrl = "";

	/** Pre-v4 installs that already had a real URL count as configured. */
	const hadBlob = version > 0 || o.serverUrl != null || o.siteUrl != null;
	const configured =
		o.configured === true ||
		(hadBlob && Boolean(serverUrl) && version > 0 && version < 4);

	return {
		...base,
		serverUrl,
		scannerPath: normalizeScannerPath(String(o.scannerPath ?? base.scannerPath)),
		workMode: o.workMode === "accumulate" ? "accumulate" : "immediate",
		soundEnabled: o.soundEnabled !== false,
		vibrateEnabled: o.vibrateEnabled !== false,
		torchDefault: Boolean(o.torchDefault),
		language: normalizeLanguage(o.language),
		theme: normalizeTheme(o.theme),
		configured,
		version: SETTINGS_VERSION,
	};
}

/** @param {unknown} lang */
export function normalizeLanguage(lang) {
	return normalizeI18nLanguage(lang);
}

/** @param {string} url */
export function normalizeServerUrl(url) {
	const trimmed = String(url || "").trim().replace(/\/+$/, "");
	if (!trimmed) return "";
	try {
		const u = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
		if (u.protocol !== "https:" && u.protocol !== "http:") return "";
		return `${u.protocol}//${u.host}`;
	} catch {
		return "";
	}
}

/** @param {string} path */
export function normalizeScannerPath(path) {
	let p = String(path || "/pos-scanner").trim() || "/pos-scanner";
	if (!p.startsWith("/")) p = `/${p}`;
	p = p.replace(/\/+$/, "") || "/pos-scanner";
	return p;
}

/**
 * Optional hosted PWA URL (browser / legacy). Not used by the offline APK UI.
 * @param {Pick<ScannerSettings, "serverUrl" | "scannerPath">} s
 */
export function buildScannerPageUrl(s) {
	const origin = normalizeServerUrl(s.serverUrl);
	const path = normalizeScannerPath(s.scannerPath);
	if (!origin) return "";
	return `${origin}${path}`;
}

/**
 * Frappe API origin used for connect / cart methods.
 * @param {Pick<ScannerSettings, "serverUrl">} s
 */
export function buildApiOrigin(s) {
	return normalizeServerUrl(s.serverUrl);
}

/**
 * @param {Partial<ScannerSettings>} patch
 * @param {{ t?: (key: string) => string }} [opts]
 * @returns {{ ok: true, settings: ScannerSettings } | { ok: false, error: string }}
 */
export function validateSettingsPatch(patch, opts = {}) {
	const tr = opts.t || ((k) => k);
	const next = migrateSettings({ ...defaultSettings(), ...patch, version: SETTINGS_VERSION });

	const rawUrl = patch.serverUrl != null ? String(patch.serverUrl) : next.serverUrl;
	if (!String(rawUrl || "").trim()) {
		return { ok: false, error: tr("requiredUrl") };
	}
	const normalized = normalizeServerUrl(String(rawUrl));
	if (!normalized) {
		return { ok: false, error: tr("invalidUrl") };
	}
	if (isBundledUiOrigin(normalized)) {
		return { ok: false, error: tr("bundledUrlError") };
	}
	if (normalized.startsWith("http://") && !isLocalHttpAllowed(normalized)) {
		return { ok: false, error: tr("httpProdError") };
	}
	next.serverUrl = normalized;

	if (patch.scannerPath != null) {
		next.scannerPath = normalizeScannerPath(String(patch.scannerPath));
	}
	if (patch.language != null) next.language = normalizeLanguage(patch.language);
	if (patch.theme != null) next.theme = normalizeTheme(patch.theme);

	next.configured = true;
	return { ok: true, settings: next };
}

function isLocalHttpAllowed(origin) {
	try {
		const host = new URL(origin).hostname;
		return (
			host === "localhost" ||
			host === "127.0.0.1" ||
			host.endsWith(".local") ||
			/^192\.168\./.test(host) ||
			/^10\./.test(host)
		);
	} catch {
		return false;
	}
}

/** @returns {ScannerSettings} */
export function loadSettings() {
	if (typeof localStorage === "undefined") return defaultSettings();
	try {
		const raw = localStorage.getItem(SETTINGS_KEY);
		if (!raw) return defaultSettings();
		return migrateSettings(JSON.parse(raw));
	} catch {
		return defaultSettings();
	}
}

/**
 * @param {ScannerSettings} settings
 * @returns {ScannerSettings}
 */
export function saveSettings(settings) {
	const next = migrateSettings({ ...settings, configured: true });
	next.configured = true;
	if (typeof localStorage !== "undefined") {
		localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
	}
	return next;
}

export const WORK_MODE_LABELS = {
	immediate: "Immediate",
	accumulate: "Accumulate",
};
