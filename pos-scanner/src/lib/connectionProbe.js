/**
 * Probe configured server + scanner path before treating the site as ready.
 * Used by the Vue gate and (via docs) mirrored by the Android shell.
 */

import { buildScannerPageUrl, normalizeScannerPath, normalizeServerUrl } from "./settings.js";

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
 * @returns {ProbeResult}
 */
export function probeMessage(kind, url, status = null) {
	const base = {
		ok: false,
		kind,
		status,
		url,
		steps: [
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
				description: "Маршрут сканера отвечает.",
				steps: [],
				status,
				url,
			};
		case "not_found":
			return {
				...base,
				kind: "not_found",
				title: "На сервере нет приложения сканера",
				description:
					"Сервер отвечает, но маршрут сканера не найден (часто это страница «Здесь ничего нет» от ERPNext). Нужно установить обновление POSNext с маршрутом /pos-scanner и собрать фронтенд сканера.",
				steps: [
					"Установите/обновите приложение POSNext на сайте (bench get-app / migrate)",
					"Соберите и опубликуйте pos-scanner (npm run build → assets /pos-scanner)",
					"Проверьте в браузере: открывается ли https://ваш-сайт/pos-scanner",
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
				description: "Проверка сервера сканера завершилась с ошибкой.",
				steps: base.steps,
			};
	}
}

/**
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
	// Known built asset when PWA is published under Frappe
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
			// Manifest/asset ok is enough; primary path 200 is ideal
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
		// Hard transport errors on first candidate are definitive
		if (candidate === candidates[0]) {
			return probeMessage(result.kind, url, result.status);
		}
	}

	if (sawNotFound) return probeMessage("not_found", url, lastStatus);
	if (sawServerError) return probeMessage("server_error", url, lastStatus);
	return probeMessage("unknown", url, lastStatus);
}

/**
 * @param {typeof fetch} fetchImpl
 * @param {string} url
 * @param {number} timeoutMs
 */
async function probeOne(fetchImpl, url, timeoutMs) {
	const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
	const timer = setTimeout(() => ctrl?.abort(), timeoutMs);
	try {
		let res;
		try {
			res = await fetchImpl(url, {
				method: "HEAD",
				redirect: "follow",
				cache: "no-store",
				signal: ctrl?.signal,
			});
		} catch {
			// Some hosts disallow HEAD
			res = await fetchImpl(url, {
				method: "GET",
				redirect: "follow",
				cache: "no-store",
				signal: ctrl?.signal,
				headers: { Accept: "text/html,application/json,*/*" },
			});
		}

		const status = res.status;
		if (status >= 200 && status < 400) {
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
			// Browsers often blur DNS vs offline
			if (typeof navigator !== "undefined" && navigator.onLine === false) {
				return { ok: false, kind: /** @type {const} */ ("offline"), status: null };
			}
			return { ok: false, kind: /** @type {const} */ ("dns"), status: null };
		}
		return { ok: false, kind: /** @type {const} */ ("unknown"), status: null };
	} finally {
		clearTimeout(timer);
	}
}
