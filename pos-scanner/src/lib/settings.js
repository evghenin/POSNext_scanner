/**
 * Versioned scanner settings (localStorage). Schema bumps migrate in place.
 * Cart/pairing stay out of scope — workMode is persisted for later wiring.
 */

export const SETTINGS_KEY = "posnext.scanner.settings";
export const SETTINGS_VERSION = 1;

/** @typedef {"immediate" | "accumulate"} WorkMode */
/** @typedef {"ru" | "en" | "ro"} LanguageCode */

/**
 * @typedef {object} ScannerSettings
 * @property {number} version
 * @property {string} serverUrl HTTPS origin, no trailing slash (e.g. https://pos.example.com)
 * @property {string} scannerPath path starting with / (default /pos-scanner)
 * @property {WorkMode} workMode
 * @property {boolean} soundEnabled
 * @property {boolean} vibrateEnabled
 * @property {boolean} torchDefault
 * @property {LanguageCode} language
 */

/** @returns {ScannerSettings} */
export function defaultSettings() {
	const origin =
		typeof window !== "undefined" && window.location?.origin
			? window.location.origin
			: "";
	return {
		version: SETTINGS_VERSION,
		serverUrl: origin && origin !== "null" ? origin : "",
		scannerPath: "/pos-scanner",
		workMode: "immediate",
		soundEnabled: true,
		vibrateEnabled: true,
		torchDefault: false,
		language: "ru",
	};
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

	// v0 / unversioned → v1
	if (version < 1) {
		return {
			...base,
			serverUrl: normalizeServerUrl(String(o.serverUrl ?? o.siteUrl ?? base.serverUrl)),
			scannerPath: normalizeScannerPath(String(o.scannerPath ?? base.scannerPath)),
			workMode: o.workMode === "accumulate" ? "accumulate" : "immediate",
			soundEnabled: o.soundEnabled !== false,
			vibrateEnabled: o.vibrateEnabled !== false,
			torchDefault: Boolean(o.torchDefault),
			language: normalizeLanguage(o.language),
			version: SETTINGS_VERSION,
		};
	}

	return {
		...base,
		...o,
		serverUrl: normalizeServerUrl(String(o.serverUrl ?? base.serverUrl)),
		scannerPath: normalizeScannerPath(String(o.scannerPath ?? base.scannerPath)),
		workMode: o.workMode === "accumulate" ? "accumulate" : "immediate",
		soundEnabled: o.soundEnabled !== false,
		vibrateEnabled: o.vibrateEnabled !== false,
		torchDefault: Boolean(o.torchDefault),
		language: normalizeLanguage(o.language),
		version: SETTINGS_VERSION,
	};
}

/** @param {unknown} lang */
export function normalizeLanguage(lang) {
	const v = String(lang || "ru").toLowerCase();
	if (v === "en" || v === "ro") return v;
	return "ru";
}

/** @param {string} url */
export function normalizeServerUrl(url) {
	const trimmed = String(url || "").trim().replace(/\/+$/, "");
	if (!trimmed) return "";
	try {
		const u = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
		if (u.protocol !== "https:" && u.protocol !== "http:") return "";
		// Prefer HTTPS for production; allow http only for local LAN debugging
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
 * @param {Pick<ScannerSettings, "serverUrl" | "scannerPath">} s
 */
export function buildScannerPageUrl(s) {
	const origin = normalizeServerUrl(s.serverUrl);
	const path = normalizeScannerPath(s.scannerPath);
	if (!origin) return "";
	return `${origin}${path}`;
}

/**
 * @param {Partial<ScannerSettings>} patch
 * @returns {{ ok: true, settings: ScannerSettings } | { ok: false, error: string }}
 */
export function validateSettingsPatch(patch) {
	const next = migrateSettings({ ...defaultSettings(), ...patch, version: SETTINGS_VERSION });
	if (patch.serverUrl != null && patch.serverUrl !== "") {
		const normalized = normalizeServerUrl(String(patch.serverUrl));
		if (!normalized) {
			return { ok: false, error: "Укажите корректный URL сервера (https://…)" };
		}
		if (normalized.startsWith("http://") && !isLocalHttpAllowed(normalized)) {
			return {
				ok: false,
				error: "Для продакшена нужен HTTPS. HTTP допустим только для localhost/LAN.",
			};
		}
		next.serverUrl = normalized;
	}
	if (patch.scannerPath != null) {
		next.scannerPath = normalizeScannerPath(String(patch.scannerPath));
	}
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
	const next = migrateSettings(settings);
	if (typeof localStorage !== "undefined") {
		localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
	}
	return next;
}

export const WORK_MODE_LABELS = {
	immediate: "Сразу в POSNext",
	accumulate: "Накопление",
};
