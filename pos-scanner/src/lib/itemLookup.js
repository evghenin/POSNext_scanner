/**
 * Live item lookup for the connected scanner.
 *
 * POST /api/method/pos_next.api.mobile_scanner.lookup_item
 * Args: link_token, code — Guest, no user login.
 */

import { callFrappeMethod } from "./apiClient.js";
import { loadPairingSession } from "./pairing.js";
import { buildApiOrigin, loadSettings } from "./settings.js";

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
 *   reason?: string,
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
		return mapLookupResponse(origin, q, message);
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
 * Map server payload → scanner item model.
 * Exported for unit tests.
 *
 * Found: {found:true, code, item_code, item_name, image, stock_uom, price, currency,
 *         uoms:[{uom, conversion_factor}], matched_by, barcode_uom}
 * Missing: {found:false, code, reason:"not_found"}
 * Not sellable: {found:false, reason:"not_for_sale"}
 *
 * @param {string} origin
 * @param {string} query
 * @param {unknown} message
 */
export function mapLookupResponse(origin, query, message) {
	if (!message || typeof message !== "object") {
		return { found: false, item: null, query, source: "api", error: "item_missing" };
	}

	if (message.found === false) {
		const reason = String(message.reason || "not_found");
		return {
			found: false,
			item: null,
			query,
			source: "api",
			error: reason === "not_for_sale" ? "not_for_sale" : "item_missing",
			reason,
		};
	}

	const itemCode = message.item_code || message.item?.item_code;
	if (!itemCode) {
		return { found: false, item: null, query, source: "api", error: "item_missing" };
	}

	const stockUom = String(message.stock_uom || message.item?.stock_uom || "Nos");
	const uomDetails = collectUomDetails(message, stockUom);
	const uoms = uomDetails.map((u) => u.uom);
	const priceRaw = message.price ?? message.item?.price ?? message.item?.rate;
	const rate =
		priceRaw == null || priceRaw === ""
			? null
			: Number.isFinite(Number(priceRaw))
				? Number(priceRaw)
				: null;

	const defaultUom =
		String(message.barcode_uom || "").trim() ||
		stockUom ||
		uoms[0] ||
		"Nos";

	const item = {
		item_code: itemCode,
		item_name: message.item_name || message.item?.item_name || itemCode,
		barcode: message.code || query,
		uom: defaultUom,
		stock_uom: stockUom,
		uoms,
		uom_details: uomDetails,
		rate,
		currency: message.currency || null,
		matched_by: message.matched_by || null,
		image: resolveImageUrl(origin, message.image || message.item?.image || null),
	};

	return { found: true, item, query, source: "api" };
}

/**
 * @param {object} message
 * @param {string} stockUom
 * @returns {{ uom: string, conversion_factor: number }[]}
 */
function collectUomDetails(message, stockUom) {
	/** @type {Map<string, number>} */
	const map = new Map();
	const push = (u, factor = 1) => {
		const v = String(u || "").trim();
		if (!v) return;
		const f = Number(factor);
		map.set(v, Number.isFinite(f) && f > 0 ? f : map.get(v) || 1);
	};

	push(stockUom, 1);

	const list = message.uoms || message.item?.uoms;
	if (Array.isArray(list)) {
		for (const row of list) {
			if (typeof row === "string") push(row, row === stockUom ? 1 : 1);
			else if (row && typeof row === "object") {
				push(row.uom || row.UOM || row.name, row.conversion_factor ?? row.factor ?? 1);
			}
		}
	}

	if (!map.size) push("Nos", 1);
	return [...map.entries()].map(([uom, conversion_factor]) => ({ uom, conversion_factor }));
}

/**
 * @param {string} message
 * @param {number} status
 * @param {unknown} payload
 */
function isMissingLookupMethod(message, status, payload) {
	const blob = `${message} ${payload?.exc_type || ""} ${JSON.stringify(payload || {})}`;
	if (status === 404) return true;
	if (/MethodNotFound|does not exist|AttributeError|Unknown method/i.test(blob)) return true;
	if (/PermissionError|not permitted|Login required|AuthenticationError|403/i.test(blob)) {
		return true;
	}
	return false;
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
