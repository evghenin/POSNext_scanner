/**
 * Optional bridge to the Android demo WebView shell (POSNextScannerAPK).
 * Offline APK loads the Vue UI from WebViewAssetLoader (appassets…/www/).
 * TWA / mobile Safari / desktop: no-ops.
 */

import { isBundledUiOrigin } from "./settings.js";

export function isAndroidDemoShell() {
	if (typeof navigator === "undefined") return false;
	return /POSNextScannerAPK/i.test(navigator.userAgent || "");
}

/** True when the scanner UI is served from APK assets (not remote /pos-scanner). */
export function isOfflineBundledUi() {
	if (isAndroidDemoShell()) return true;
	if (typeof window === "undefined") return false;
	return isBundledUiOrigin(window.location?.origin || "");
}

function native() {
	if (typeof window === "undefined") return null;
	return window.PosNextShell || null;
}

/**
 * @returns {{ serverUrl: string, scannerPath: string, offlineBundle?: boolean } | null}
 */
export function readNativeServerConfig() {
	const bridge = native();
	if (!bridge?.getServerConfigJson) return null;
	try {
		const raw = bridge.getServerConfigJson();
		const parsed = JSON.parse(raw || "{}");
		return {
			serverUrl: String(parsed.serverUrl || ""),
			scannerPath: String(parsed.scannerPath || "/pos-scanner"),
			offlineBundle: Boolean(parsed.offlineBundle),
		};
	} catch {
		return null;
	}
}

/**
 * Persist API host in the APK. Offline shell keeps the local UI loaded.
 * @param {string} serverUrl
 * @param {string} scannerPath
 * @returns {boolean} true if the native shell accepted the request
 */
export function applyNativeServerConfig(serverUrl, scannerPath) {
	const bridge = native();
	if (!bridge?.applyServerConfig) return false;
	try {
		bridge.applyServerConfig(serverUrl, scannerPath);
		return true;
	} catch (e) {
		console.warn("[shellBridge] applyServerConfig failed", e);
		return false;
	}
}
