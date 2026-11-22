/**
 * Optional bridge to the Android WebView shell (POSNextScannerAPK).
 * Offline APK loads the Vue UI from WebViewAssetLoader (appassets…/www/).
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
			scannerPath: String(parsed.scannerPath || ""),
			offlineBundle: Boolean(parsed.offlineBundle),
		};
	} catch {
		return null;
	}
}

/**
 * Persist API host in the APK. Offline shell keeps the local UI loaded.
 * @param {string} serverUrl
 * @param {string} [scannerPath]
 * @returns {boolean}
 */
export function applyNativeServerConfig(serverUrl, scannerPath = "") {
	const bridge = native();
	if (!bridge?.applyServerConfig) return false;
	try {
		bridge.applyServerConfig(serverUrl, scannerPath || "");
		return true;
	} catch (e) {
		console.warn("[shellBridge] applyServerConfig failed", e);
		return false;
	}
}

/** @type {Map<string, (payload: object) => void>} */
const probeCallbacks = new Map();
let probeSeq = 0;
let probeHookInstalled = false;

function ensureProbeHook() {
	if (probeHookInstalled || typeof window === "undefined") return;
	probeHookInstalled = true;
	window.__posNextProbeDone = (callbackId, json) => {
		const cb = probeCallbacks.get(String(callbackId));
		if (!cb) return;
		probeCallbacks.delete(String(callbackId));
		try {
			cb(typeof json === "string" ? JSON.parse(json) : json);
		} catch (e) {
			cb({ ok: false, kind: "unknown", status: null, url: "" });
		}
	};
}

/**
 * Native HttpURLConnection probe (no CORS). Returns null if bridge missing.
 * @param {string} serverUrl
 * @returns {Promise<{ ok: boolean, kind: string, status: number | null, url: string } | null>}
 */
export function probeApiNative(serverUrl) {
	const bridge = native();
	if (!bridge?.probeApi) return Promise.resolve(null);
	ensureProbeHook();
	const id = String(++probeSeq);
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			if (probeCallbacks.has(id)) {
				probeCallbacks.delete(id);
				resolve({ ok: false, kind: "timeout", status: null, url: serverUrl });
			}
		}, 15000);
		probeCallbacks.set(id, (payload) => {
			clearTimeout(timer);
			resolve({
				ok: Boolean(payload?.ok),
				kind: String(payload?.kind || "unknown"),
				status: payload?.status == null ? null : Number(payload.status),
				url: String(payload?.url || ""),
			});
		});
		try {
			bridge.probeApi(String(serverUrl || ""), id);
		} catch (e) {
			clearTimeout(timer);
			probeCallbacks.delete(id);
			console.warn("[shellBridge] probeApi failed", e);
			resolve(null);
		}
	});
}
