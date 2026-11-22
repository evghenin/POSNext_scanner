import { callFrappeMethod } from "./apiClient.js";
import { buildApiOrigin, loadSettings } from "./settings.js";

/**
 * Live item lookup against POSNext / ERPNext.
 *
 * @param {string} code
 * @param {{ serverUrl?: string }} [opts]
 * @returns {Promise<{ found: boolean, item: object | null, query: string, source: "api" | "local" }>}
 */
export async function lookupItem(code, opts = {}) {
	const q = String(code || "").trim();
	if (!q) return { found: false, item: null, query: q, source: "local" };

	const settings = loadSettings();
	const origin = buildApiOrigin({
		serverUrl: opts.serverUrl ?? settings.serverUrl,
	});

	if (origin) {
		try {
			const apiHit = await searchByBarcodeApi(origin, q);
			if (apiHit) {
				return { found: true, item: apiHit, query: q, source: "api" };
			}
			return { found: false, item: null, query: q, source: "api" };
		} catch (e) {
			console.warn("[itemLookup] API lookup failed", e?.message || e);
		}
	}

	return { found: false, item: null, query: q, source: "local" };
}

/**
 * @param {string} origin
 * @param {string} barcode
 */
async function searchByBarcodeApi(origin, barcode) {
	let message = null;
	try {
		message = await callFrappeMethod("pos_next.api.items.search_by_barcode", {
			barcode,
		});
	} catch {
		// Guest GET fallback (no phone credentials)
		const url = new URL("/api/method/pos_next.api.items.search_by_barcode", origin);
		url.searchParams.set("barcode", barcode);
		const res = await fetch(url.toString(), {
			method: "GET",
			credentials: "omit",
			headers: { Accept: "application/json" },
		});
		if (!res.ok) return null;
		const json = await res.json();
		message = json?.message;
	}

	if (!message || typeof message !== "object") return null;
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
		barcode: item.barcode || barcode,
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
 * Price per 1 base (stock) unit.
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
