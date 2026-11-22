/**
 * Optional bridge to the Android demo WebView shell (POSNextScannerAPK).
 * TWA / mobile Safari / desktop: no-ops.
 */

export function isAndroidDemoShell() {
	if (typeof navigator === "undefined") return false;
	return /POSNextScannerAPK/i.test(navigator.userAgent || "");
}

function native() {
	if (typeof window === "undefined") return null;
	return window.PosNextShell || null;
}

/**
 * @returns {{ serverUrl: string, scannerPath: string } | null}
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
		};
	} catch {
		return null;
	}
}

/**
 * Persist host/path in the APK and navigate the WebView to the new scanner URL.
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
