/**
 * Frappe API client: prefers native HttpURLConnection on APK (cookies + CSRF),
 * falls back to fetch in browser.
 *
 * No phone-side ERPNext user / password / API key. Session link comes from QR
 * connect (`link_token`); methods that need it receive it as a form param.
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
 * @param {{ serverUrl?: string }} [opts]
 */
export async function callFrappeMethod(methodPath, params = {}, opts = {}) {
	const settings = loadSettings();
	const origin = buildApiOrigin({ serverUrl: opts.serverUrl ?? settings.serverUrl });
	if (!origin) throw new Error("missing_server");

	const url = `${origin}/api/method/${methodPath}`;
	const body = encodeForm(params);
	/** @type {Record<string, string>} */
	const headers = {};
	const csrf = readCsrf();
	if (csrf) headers["X-Frappe-CSRF-Token"] = csrf;

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

	// Frappe sometimes returns HTTP 200 with exc / _server_messages on failure.
	if (!raw.ok || hasFrappeException(json)) {
		const msg = extractFrappeMessage(json, raw);
		const err = new Error(msg);
		err.status = raw.status;
		err.payload = json;
		err.excType = json?.exc_type || null;
		throw err;
	}

	return json?.message !== undefined ? json.message : json;
}

/**
 * @param {unknown} json
 * @param {{ status?: number, error?: string, body?: string }} raw
 */
function extractFrappeMessage(json, raw) {
	if (json && typeof json === "object") {
		const serverMsgs = parseServerMessages(json._server_messages);
		if (serverMsgs) return serverMsgs;
		if (typeof json.message === "string" && json.message) return json.message;
		if (json._error_message) return String(json._error_message);
		if (json.exc_type) {
			const tip = typeof json.exception === "string" ? json.exception.split("\n")[0] : "";
			return tip || String(json.exc_type);
		}
	}
	return raw?.error || `HTTP ${raw?.status || 0}`;
}

/** @param {unknown} json */
function hasFrappeException(json) {
	if (!json || typeof json !== "object") return false;
	if (json.exc_type) return true;
	if (typeof json.exc === "string" && json.exc.length) return true;
	return false;
}

/** @param {unknown} raw */
function parseServerMessages(raw) {
	if (!raw) return "";
	try {
		const list = typeof raw === "string" ? JSON.parse(raw) : raw;
		if (!Array.isArray(list)) return "";
		const parts = list.map((row) => {
			try {
				const o = typeof row === "string" ? JSON.parse(row) : row;
				return o?.message || o?.title || "";
			} catch {
				return typeof row === "string" ? row : "";
			}
		});
		return parts.filter(Boolean).join(" — ");
	} catch {
		return typeof raw === "string" ? raw : "";
	}
}

/**
 * @param {unknown} err
 * @param {string} [method]
 */
export function formatFrappeError(err, method = "") {
	const payload = err?.payload;
	const excType = err?.excType || payload?.exc_type || "";
	const base = String(err?.message || err || "error");
	const bits = [method, excType, base].filter(Boolean);
	// de-dupe if message already contains method
	const message = bits.filter((b, i) => bits.indexOf(b) === i).join(": ");
	return { message, method: method || null, excType: excType || null };
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
		credentials: "omit",
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
