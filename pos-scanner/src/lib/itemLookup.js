/**
 * Live item lookup for the connected scanner.
 *
 * Phone has no ERPNext login. Auth is the session `link_token` from QR connect.
 * Calls guest method: pos_next.api.mobile_scanner.lookup_item
 */

import { callFrappeMethod } from "./apiClient.js";
import { loadPairingSession } from "./pairing.js";
import { buildApiOrigin, loadSettings } from "./settings.js";

/** Server method the POSNext worker must expose (Guest + link_token). */
export const LOOKUP_ITEM_METHOD = "pos_next.api.mobile_scanner.lookup_item";

/**
 * @param {string} code
 * @param {{ serverUrl?: string, linkToken?: string }} [opts]
 * @returns {Promise<{
 *   found: boolean,
 *   item: object | null,
 *   query: string,
 *   source: "api" | "local",
 *   error?: string,
 *   method?: string,
 * }>}
 */
export async function lookupItem(code, opts = {}) {
	const q = String(code || "").trim();
	if (!q) return { found: false, item: null, query: q, source: "local" };

	const settings = loadSettings();
	const origin = buildApiOrigin({
		serverUrl: opts.serverUrl ?? settings.serverUrl,
	});
	if (!origin) {
		return { found: false, item: null, query: q, source: "local", error: "missing_server" };
	}

	const session = loadPairingSession();
	const linkToken = opts.linkToken ?? session?.linkToken ?? "";
	if (!linkToken) {
		return { found: false, item: null, query: q, source: "api", error: "not_connected" };
	}

	try {
		const message = await callFrappeMethod(LOOKUP_ITEM_METHOD, {
			link_token: linkToken,
			code: q,
		});
		const item = normalizeLookupMessage(origin, q, message);
		if (item) return { found: true, item, query: q, source: "api" };
		return { found: false, item: null, query: q, source: "api" };
	} catch (e) {
		const msg = String(e?.message || e || "");
		const status = Number(e?.status) || 0;
		if (isMissingLookupMethod(msg, status, e?.payload)) {
			console.warn("[itemLookup] server method missing:", LOOKUP_ITEM_METHOD, msg);
			return {
				found: false,
				item: null,
				query: q,
				source: "api",
				error: "lookup_api_missing",
				method: LOOKUP_ITEM_METHOD,
			};
		}
		console.warn("[itemLookup] API lookup failed", msg);
		return {
			found: false,
			item: null,
			query: q,
			source: "api",
			error: msg || "lookup_failed",
		};
	}
}

/**
 * True when the Guest+link_token lookup endpoint is missing or not callable yet.
 * @param {string} message
 * @param {number} status
 * @param {unknown} payload
 */
function isMissingLookupMethod(message, status, payload) {
	const blob = `${message} ${payload?.exc_type || ""} ${JSON.stringify(payload || {})}`;
	if (status === 404) return true;
	if (/MethodNotFound|does not exist|AttributeError|Unknown method/i.test(blob)) return true;
	// Method not allow_guest / still requires login
	if (/PermissionError|not permitted|Login required|AuthenticationError|403/i.test(blob)) {
		return true;
	}
	return false;
}

/**
 * @param {string} origin
 * @param {string} query
 * @param {unknown} message
 */
function normalizeLookupMessage(origin, query, message) {
	if (!message || typeof message !== "object") return null;
	if (message.found === false) return null;

	const item = message.item || message;
	const itemCode = item.item_code || item.name;
	if (!itemCode) return null;

	const stockUom = item.stock_uom || item.uom || null;
	const uomDetails = collectUomDetails(item, message, stockUom);
	const uoms = uomDetails.map((u) => u.uom);
	const rate = pickBaseRate(item, message, stockUom);

	return {
		item_code: itemCode,
		item_name: item.item_name || itemCode,
		barcode: item.barcode || query,
		uom: stockUom || uoms[0] || "Nos",
		stock_uom: stockUom || uoms[0] || "Nos",
		uoms,
		uom_details: uomDetails,
		rate,
		image: resolveImageUrl(origin, item.image || item.image_url || null),
	};
}

/**
 * @param {object} item
 * @param {object} message
 * @param {string | null} stockUom
 * @returns {{ uom: string, conversion_factor: number }[]}
 */
function collectUomDetails(item, message, stockUom) {
	/** @type {Map<string, number>} */
	const map = new Map();
	const push = (u, factor = 1) => {
		const v = String(u || "").trim();
		if (!v) return;
		const f = Number(factor);
		map.set(v, Number.isFinite(f) && f > 0 ? f : map.get(v) || 1);
	};
	if (stockUom) push(stockUom, 1);

	const lists = [item.item_uoms, item.uoms, message.uom_prices, message.item_uoms];
	for (const list of lists) {
		if (!Array.isArray(list)) continue;
		for (const row of list) {
			if (typeof row === "string") push(row, 1);
			else if (row && typeof row === "object") {
				push(row.uom || row.UOM || row.name, row.conversion_factor ?? row.factor ?? 1);
			}
		}
	}
	if (message.uom_prices && typeof message.uom_prices === "object" && !Array.isArray(message.uom_prices)) {
		for (const [key, val] of Object.entries(message.uom_prices)) {
			const factor =
				typeof val === "object" ? val.conversion_factor ?? val.factor ?? 1 : 1;
			push(key, factor);
		}
	}
	if (!map.size) push("Nos", 1);
	return [...map.entries()].map(([uom, conversion_factor]) => ({ uom, conversion_factor }));
}

/**
 * @param {object} item
 * @param {object} message
 * @param {string | null} stockUom
 */
function pickBaseRate(item, message, stockUom) {
	if (item.rate != null && Number.isFinite(Number(item.rate))) return Number(item.rate);
	if (item.price_list_rate != null && Number.isFinite(Number(item.price_list_rate))) {
		return Number(item.price_list_rate);
	}
	const prices = message.uom_prices;
	if (prices && typeof prices === "object") {
		if (stockUom && prices[stockUom] != null) {
			const p = prices[stockUom];
			const n = Number(typeof p === "object" ? p.rate ?? p.price_list_rate : p);
			if (Number.isFinite(n)) return n;
		}
		if (Array.isArray(prices) && prices[0]) {
			const p = prices[0];
			const n = Number(p.rate ?? p.price_list_rate ?? null);
			if (Number.isFinite(n)) return n;
		}
	}
	return null;
}

/**
 * @param {string} origin
 * @param {string | null} image
 */
function resolveImageUrl(origin, image) {
	if (!image) return null;
	const s = String(image);
	if (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("data:")) return s;
	try {
		return new URL(s.startsWith("/") ? s : `/${s}`, origin).toString();
	} catch {
		return s;
	}
}
