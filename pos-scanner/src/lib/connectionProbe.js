/**
 * Probe ERPNext/POSNext reachability.
 *
 * Offline APK: probe Frappe API (`frappe.ping`) — UI/OCR is local.
 * Optional hosted PWA: can still probe `/pos-scanner` via probeScannerEndpoint.
 */

import {
	buildApiOrigin,
	buildScannerPageUrl,
	normalizeScannerPath,
	normalizeServerUrl,
} from "./settings.js";

/** @typedef {"ok" | "offline" | "timeout" | "tls" | "dns" | "not_found" | "server_error" | "invalid_url" | "unknown"} ProbeKind */

/**
 * @typedef {object} ProbeResult
 * @property {boolean} ok
 * @property {ProbeKind} kind
 * @property {string} title
 * @property {string} description
 * @property {string[]} steps
 * @property {number | null} status
 * @property {string} url
 */

const TIMEOUT_MS = 12000;

/**
 * @param {ProbeKind} kind
 * @param {string} url
 * @param {number | null} [status]
 * @param {"api" | "scanner"} [mode]
 * @returns {ProbeResult}
 */
export function probeMessage(kind, url, status = null, mode = "scanner") {
	const apiMode = mode === "api";
	const base = {
		ok: false,
		kind,
		status,
		url,
		steps: apiMode
			? [
					"Проверьте URL сервера (API) в настройках",
					"Убедитесь, что сайт открывается по HTTPS",
					"Проверьте сеть (Wi‑Fi / мобильный интернет)",
				]
			: [
					"Проверьте URL сервера и путь сканера в настройках",
					"Убедитесь, что сайт открывается по HTTPS",
					"Проверьте сеть (Wi‑Fi / мобильный интернет)",
				],
	};

	switch (kind) {
		case "ok":
			return {
				ok: true,
				kind: "ok",
				title: "Сервер доступен",
				description: apiMode
					? "API ERPNext/POSNext отвечает (frappe.ping)."
					: "Маршрут сканера отвечает.",
				steps: [],
				status,
				url,
			};
		case "not_found":
			return {
				...base,
				kind: "not_found",
				title: apiMode ? "API не найден" : "На сервере нет приложения сканера",
				description: apiMode
					? "Сервер отвечает, но /api/method/frappe.ping недоступен. Проверьте, что это сайт ERPNext/Frappe."
					: "Сервер отвечает, но маршрут сканера не найден (часто это страница «Здесь ничего нет» от ERPNext). Для APK UI уже встроен — нужен только API. Хостинг /pos-scanner опционален.",
				steps: apiMode
					? [
							"Откройте в браузере: https://ваш-сайт/api/method/frappe.ping",
							"Должен вернуться JSON с message: pong",
							"Затем нажмите «Повторить» в приложении",
						]
					: [
							"Для телефона используйте APK со встроенным UI (OCR/WASM внутри)",
							"На сервере достаточно pairing/cart API POSNext",
							"Опционально: опубликуйте /pos-scanner для браузера",
							"Затем нажмите «Повторить» в приложении",
						],
			};
		case "offline":
			return {
				...base,
				kind: "offline",
				title: "Нет сети",
				description: "Устройство сейчас без доступа в интернет.",
				steps: ["Включите Wi‑Fi или мобильные данные", "Повторите попытку"],
			};
		case "timeout":
			return {
				...base,
				kind: "timeout",
				title: "Сервер не отвечает",
				description: "Превышено время ожидания ответа от сервера.",
				steps: [
					"Проверьте, что сайт доступен в обычном браузере",
					"Проверьте VPN / файрвол",
					"Повторите попытку",
				],
			};
		case "tls":
			return {
				...base,
				kind: "tls",
				title: "Ошибка HTTPS / сертификата",
				description: "Не удалось установить защищённое соединение с сервером.",
				steps: [
					"Проверьте, что URL начинается с https://",
					"Убедитесь, что сертификат сайта действителен",
					"Для локальной отладки HTTP допустим только localhost/LAN",
				],
			};
		case "dns":
			return {
				...base,
				kind: "dns",
				title: "Сервер не найден",
				description: "Не удалось разрешить имя хоста (DNS).",
				steps: ["Проверьте написание домена", "Проверьте DNS / VPN", "Повторите попытку"],
			};
		case "server_error":
			return {
				...base,
				kind: "server_error",
				title: "Ошибка сервера",
				description: `Сервер вернул ошибку${status ? ` (HTTP ${status})` : ""}.`,
				steps: ["Попробуйте позже", "Обратитесь к администратору сайта", "Повторите попытку"],
			};
		case "invalid_url":
			return {
				...base,
				kind: "invalid_url",
				title: "Некорректный URL",
				description: "Укажите адрес сайта вида https://pos.example.com.",
				steps: ["Откройте настройки и исправьте URL сервера"],
			};
		default:
			return {
				...base,
				kind: "unknown",
				title: "Не удалось подключиться",
				description: apiMode
					? "Проверка API сервера завершилась с ошибкой."
					: "Проверка сервера сканера завершилась с ошибкой.",
				steps: base.steps,
			};
	}
}

/**
 * Probe Frappe API origin (pairing/cart). Used by offline APK.
 * @param {{ serverUrl: string }} cfg
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [opts]
 * @returns {Promise<ProbeResult>}
 */
export async function probeApiEndpoint(cfg, opts = {}) {
	const origin = buildApiOrigin(cfg);
	const url = origin ? `${origin}/api/method/frappe.ping` : "";

	if (!url) {
		return probeMessage("invalid_url", "", null, "api");
	}

	if (typeof navigator !== "undefined" && navigator.onLine === false) {
		return probeMessage("offline", url, null, "api");
	}

	const fetchImpl = opts.fetchImpl || fetch;
	const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
	const result = await probeOne(fetchImpl, url, timeoutMs, { expectPing: true });
	if (result.ok) {
		return probeMessage("ok", url, result.status, "api");
	}
	return probeMessage(result.kind, url, result.status, "api");
}

/**
 * Probe optional hosted `/pos-scanner` (browser / legacy). Not required for APK OCR.
 * @param {{ serverUrl: string, scannerPath?: string }} cfg
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [opts]
 * @returns {Promise<ProbeResult>}
 */
export async function probeScannerEndpoint(cfg, opts = {}) {
	const origin = normalizeServerUrl(cfg.serverUrl);
	const path = normalizeScannerPath(cfg.scannerPath || "/pos-scanner");
	const url = buildScannerPageUrl({ serverUrl: origin, scannerPath: path });

	if (!url) {
		return probeMessage("invalid_url", "");
	}

	if (typeof navigator !== "undefined" && navigator.onLine === false) {
		return probeMessage("offline", url);
	}

	const fetchImpl = opts.fetchImpl || fetch;
	const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;

	/** @type {string[]} */
	const candidates = [url, url.endsWith("/") ? url.slice(0, -1) : `${url}/`];
	try {
		const u = new URL(url);
		candidates.push(`${u.origin}/assets/pos_next/pos_scanner/manifest.webmanifest`);
		candidates.push(`${u.origin}/assets/pos_next/pos_scanner/index.html`);
	} catch {
		/* ignore */
	}

	let lastStatus = null;
	let sawNotFound = false;
	let sawServerError = false;

	for (const candidate of candidates) {
		const result = await probeOne(fetchImpl, candidate, timeoutMs);
		if (result.ok) {
			return probeMessage("ok", url, result.status);
		}
		if (result.kind === "not_found") {
			sawNotFound = true;
			lastStatus = result.status;
			continue;
		}
		if (result.kind === "server_error") {
			sawServerError = true;
			lastStatus = result.status;
			continue;
		}
		if (candidate === candidates[0]) {
			return probeMessage(result.kind, url, result.status);
		}
	}

	if (sawNotFound) return probeMessage("not_found", url, lastStatus);
	if (sawServerError) return probeMessage("server_error", url, lastStatus);
	return probeMessage("unknown", url, lastStatus);
}

/**
 * Detect ERPNext/Frappe soft-404 HTML served with HTTP 200.
 * @param {string} body
 */
export function looksLikeFrappeNotFound(body) {
	if (!body) return false;
	const lower = body.toLowerCase();
	const frappe =
		lower.includes("powered by erpnext") ||
		lower.includes("powered by frappe") ||
		lower.includes("frappe");
	const missing =
		body.includes("Здесь ничего нет") ||
		lower.includes("not found") ||
		lower.includes("page not found") ||
		lower.includes("не найдено");
	return missing && (frappe || body.includes("Здесь ничего нет"));
}

/**
 * @param {typeof fetch} fetchImpl
 * @param {string} url
 * @param {number} timeoutMs
 * @param {{ expectPing?: boolean }} [opts]
 */
async function probeOne(fetchImpl, url, timeoutMs, opts = {}) {
	const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
	const timer = setTimeout(() => ctrl?.abort(), timeoutMs);
	try {
		let res;
		try {
			res = await fetchImpl(url, {
				method: "GET",
				redirect: "follow",
				cache: "no-store",
				signal: ctrl?.signal,
				headers: { Accept: "application/json,text/html,*/*" },
			});
		} catch (firstErr) {
			try {
				res = await fetchImpl(url, {
					method: "HEAD",
					redirect: "follow",
					cache: "no-store",
					signal: ctrl?.signal,
				});
			} catch {
				throw firstErr;
			}
		}

		const status = res.status;
		if (status >= 200 && status < 400) {
			try {
				if (typeof res.text === "function") {
					const body = await res.text();
					if (looksLikeFrappeNotFound(body)) {
						return { ok: false, kind: /** @type {const} */ ("not_found"), status };
					}
					if (opts.expectPing) {
						const lower = body.toLowerCase();
						if (!lower.includes("pong") && !lower.includes('"message"')) {
							// CORS may empty body; HTTP 200 on ping route is still a good sign
							if (body.trim() && !lower.includes("frappe") && !lower.includes("{")) {
								return { ok: false, kind: /** @type {const} */ ("not_found"), status };
							}
						}
					}
				}
			} catch {
				/* CORS may block body — treat status alone */
			}
			return { ok: true, kind: /** @type {const} */ ("ok"), status };
		}
		if (status === 404 || status === 410) {
			return { ok: false, kind: /** @type {const} */ ("not_found"), status };
		}
		if (status >= 500) {
			return { ok: false, kind: /** @type {const} */ ("server_error"), status };
		}
		return { ok: false, kind: /** @type {const} */ ("unknown"), status };
	} catch (e) {
		const msg = String(e?.message || e || "").toLowerCase();
		const name = String(e?.name || "");
		if (name === "AbortError" || msg.includes("timeout")) {
			return { ok: false, kind: /** @type {const} */ ("timeout"), status: null };
		}
		if (msg.includes("ssl") || msg.includes("tls") || msg.includes("certificate")) {
			return { ok: false, kind: /** @type {const} */ ("tls"), status: null };
		}
		if (
			msg.includes("failed to fetch") ||
			msg.includes("network") ||
			msg.includes("dns") ||
			msg.includes("name not resolved")
		) {
			if (typeof navigator !== "undefined" && navigator.onLine === false) {
				return { ok: false, kind: /** @type {const} */ ("offline"), status: null };
			}
			// Cross-origin from APK asset origin often surfaces as failed to fetch (CORS).
			// Callers that need a definitive API check should use the native shell probe.
			return { ok: false, kind: /** @type {const} */ ("dns"), status: null };
		}
		return { ok: false, kind: /** @type {const} */ ("unknown"), status: null };
	} finally {
		clearTimeout(timer);
	}
}
