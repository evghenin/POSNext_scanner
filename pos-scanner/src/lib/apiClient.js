/**
 * Frappe API client: prefers native HttpURLConnection on APK (cookies + CSRF),
 * falls back to fetch in browser.
 */

import { buildApiOrigin, loadSettings } from "./settings.js";
import { httpRequestNative, isOfflineBundledUi } from "./shellBridge.js";

const CSRF_KEY = "posnext.scanner.csrf";

/** @returns {string} */
function readCsrf() {
	if (typeof localStorage === "undefined") return "";
	return localStorage.getItem(CSRF_KEY) || "";
}

/** @param {string} token */
function writeCsrf(token) {
	if (typeof localStorage === "undefined") return;
	if (token) localStorage.setItem(CSRF_KEY, token);
}

/**
 * @param {string} methodPath e.g. pos_next.api.mobile_scanner.redeem_pairing
 * @param {Record<string, unknown>} [params]
 * @param {{ serverUrl?: string, apiKey?: string, apiSecret?: string }} [opts]
 */
export async function callFrappeMethod(methodPath, params = {}, opts = {}) {
	const settings = loadSettings();
	const origin = buildApiOrigin({ serverUrl: opts.serverUrl ?? settings.serverUrl });
	if (!origin) throw new Error("missing_server");

	const url = `${origin}/api/method/${methodPath}`;
	const apiKey = opts.apiKey ?? settings.apiKey ?? "";
	const apiSecret = opts.apiSecret ?? settings.apiSecret ?? "";
	const body = encodeForm(params);
	/** @type {Record<string, string>} */
	const headers = {};
	if (apiKey && apiSecret) {
		headers.Authorization = `token ${apiKey}:${apiSecret}`;
	} else {
		const csrf = readCsrf();
		if (csrf) headers["X-Frappe-CSRF-Token"] = csrf;
	}

	const raw = await rawRequest({
		method: "POST",
		url,
		body,
		contentType: "application/x-www-form-urlencoded",
		headers,
	});

	if (raw.csrfToken) writeCsrf(raw.csrfToken);

	let json = null;
	try {
		json = raw.body ? JSON.parse(raw.body) : null;
	} catch {
		json = null;
	}

	if (!raw.ok) {
		const msg =
			json?.message ||
			json?._error_message ||
			json?.exc_type ||
			raw.error ||
			`HTTP ${raw.status}`;
		const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
		err.status = raw.status;
		err.payload = json;
		throw err;
	}

	return json?.message !== undefined ? json.message : json;
}

/**
 * Login with ERPNext usr/pwd (sets sid cookie in native CookieManager).
 * @param {{ serverUrl?: string, apiUser?: string, apiPassword?: string }} [opts]
 */
/**
 * @param {{ serverUrl?: string, apiUser?: string, apiPassword?: string, apiKey?: string, apiSecret?: string }} [opts]
 */
export async function ensureLoggedIn(opts = {}) {
	const settings = loadSettings();
	const apiKey = opts.apiKey ?? settings.apiKey ?? "";
	const apiSecret = opts.apiSecret ?? settings.apiSecret ?? "";
	if (apiKey && apiSecret) return { mode: "token" };

	const usr = opts.apiUser ?? settings.apiUser ?? "";
	const pwd = opts.apiPassword ?? settings.apiPassword ?? "";
	if (!usr || !pwd) {
		const err = new Error("login_required");
		err.code = "login_required";
		throw err;
	}

	const origin = buildApiOrigin({ serverUrl: opts.serverUrl ?? settings.serverUrl });
	if (!origin) throw new Error("missing_server");

	const raw = await rawRequest({
		method: "POST",
		url: `${origin}/api/method/login`,
		body: encodeForm({ usr, pwd }),
		contentType: "application/x-www-form-urlencoded",
		headers: {},
	});
	if (raw.csrfToken) writeCsrf(raw.csrfToken);

	if (!raw.ok) {
		const err = new Error("login_failed");
		err.code = "login_failed";
		err.status = raw.status;
		throw err;
	}

	// Refresh CSRF if cookie not yet set
	if (!readCsrf()) {
		try {
			const boot = await rawRequest({
				method: "GET",
				url: `${origin}/api/method/frappe.auth.get_logged_user`,
				headers: {},
			});
			if (boot.csrfToken) writeCsrf(boot.csrfToken);
		} catch {
			/* ignore */
		}
	}
	return { mode: "session" };
}

/**
 * @param {{ method: string, url: string, body?: string, contentType?: string, headers?: Record<string, string> }} req
 */
async function rawRequest(req) {
	if (isOfflineBundledUi()) {
		const native = await httpRequestNative(req);
		if (native) return native;
	}

	/** @type {RequestInit} */
	const init = {
		method: req.method || "GET",
		credentials: "include",
		headers: {
			Accept: "application/json",
			...(req.headers || {}),
		},
	};
	if (req.body && req.method !== "GET") {
		init.body = req.body;
		if (req.contentType) init.headers["Content-Type"] = req.contentType;
	}
	const res = await fetch(req.url, init);
	const body = await res.text();
	return {
		ok: res.ok,
		status: res.status,
		body,
		url: req.url,
	};
}

/** @param {Record<string, unknown>} params */
function encodeForm(params) {
	const parts = [];
	for (const [k, v] of Object.entries(params)) {
		if (v == null || v === "") continue;
		parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
	}
	return parts.join("&");
}
