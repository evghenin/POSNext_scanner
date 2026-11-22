/**
 * Optional bridge to the Android WebView shell (POSNextScannerAPK).
 */

import { isBundledUiOrigin } from "./settings.js";

export function isAndroidDemoShell() {
	if (typeof navigator === "undefined") return false;
	return /POSNextScannerAPK/i.test(navigator.userAgent || "");
}

export function isOfflineBundledUi() {
	if (isAndroidDemoShell()) return true;
	if (typeof window === "undefined") return false;
	return isBundledUiOrigin(window.location?.origin || "");
}

function native() {
	if (typeof window === "undefined") return null;
	return window.PosNextShell || null;
}

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
const callbacks = new Map();
let seq = 0;
let hooksInstalled = false;

function ensureHooks() {
	if (hooksInstalled || typeof window === "undefined") return;
	hooksInstalled = true;
	const finish = (mapKey) => (callbackId, json) => {
		const cb = callbacks.get(String(callbackId));
		if (!cb) return;
		callbacks.delete(String(callbackId));
		try {
			cb(typeof json === "string" ? JSON.parse(json) : json);
		} catch {
			cb({ ok: false });
		}
	};
	window.__posNextProbeDone = finish("probe");
	window.__posNextHttpDone = finish("http");
}

function waitCallback(timeoutMs = 20000) {
	ensureHooks();
	const id = String(++seq);
	return {
		id,
		promise: new Promise((resolve) => {
			const timer = setTimeout(() => {
				if (callbacks.has(id)) {
					callbacks.delete(id);
					resolve({ ok: false, error: "timeout", status: 0, body: "" });
				}
			}, timeoutMs);
			callbacks.set(id, (payload) => {
				clearTimeout(timer);
				resolve(payload || { ok: false });
			});
		}),
	};
}

/**
 * @param {string} serverUrl
 * @returns {Promise<{ ok: boolean, kind: string, status: number | null, url: string } | null>}
 */
export function probeApiNative(serverUrl) {
	const bridge = native();
	if (!bridge?.probeApi) return Promise.resolve(null);
	const { id, promise } = waitCallback(15000);
	try {
		bridge.probeApi(String(serverUrl || ""), id);
	} catch (e) {
		callbacks.delete(id);
		console.warn("[shellBridge] probeApi failed", e);
		return Promise.resolve(null);
	}
	return promise.then((payload) => ({
		ok: Boolean(payload?.ok),
		kind: String(payload?.kind || "unknown"),
		status: payload?.status == null ? null : Number(payload.status),
		url: String(payload?.url || ""),
	}));
}

/**
 * Cookie-aware native HTTP. Returns null if bridge missing.
 * @param {{ method?: string, url: string, body?: string, contentType?: string, headers?: Record<string, string> }} req
 * @returns {Promise<{ ok: boolean, status: number, body: string, url: string, csrfToken?: string, error?: string } | null>}
 */
export function httpRequestNative(req) {
	const bridge = native();
	if (!bridge?.httpRequest) return Promise.resolve(null);
	const { id, promise } = waitCallback(25000);
	try {
		bridge.httpRequest(
			req.method || "GET",
			req.url,
			req.body || "",
			req.contentType || "",
			JSON.stringify(req.headers || {}),
			id
		);
	} catch (e) {
		callbacks.delete(id);
		console.warn("[shellBridge] httpRequest failed", e);
		return Promise.resolve(null);
	}
	return promise.then((payload) => ({
		ok: Boolean(payload?.ok),
		status: Number(payload?.status || 0),
		body: String(payload?.body || ""),
		url: String(payload?.url || req.url),
		csrfToken: payload?.csrfToken ? String(payload.csrfToken) : undefined,
		error: payload?.error ? String(payload.error) : undefined,
	}));
}
