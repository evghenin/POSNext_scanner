import { buildApiOrigin, loadSettings } from "./settings.js";

/**
 * Live item lookup against POSNext / ERPNext.
 * No mock catalog — unknown codes stay provisional until pairing/cart phase.
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
		} catch (e) {
			console.warn("[itemLookup] API lookup failed", e?.message || e);
		}
	}

	const upper = q.toUpperCase();
	return {
		found: false,
		item: {
			item_code: upper,
			item_name: upper,
			barcode: q,
			uom: "Nos",
			uoms: ["Nos"],
			rate: null,
			image: null,
			pending: true,
		},
		query: q,
		source: "local",
	};
}

/**
 * @param {string} origin
 * @param {string} barcode
 */
async function searchByBarcodeApi(origin, barcode) {
	const url = new URL("/api/method/pos_next.api.items.search_by_barcode", origin);
	url.searchParams.set("barcode", barcode);
	const res = await fetch(url.toString(), {
		method: "GET",
		credentials: "omit",
		headers: { Accept: "application/json" },
	});
	if (!res.ok) return null;
	const json = await res.json();
	const message = json?.message;
	if (!message || typeof message !== "object") return null;
	const item = message.item || message;
	const itemCode = item.item_code || item.name;
	if (!itemCode) return null;

	const stockUom = item.stock_uom || item.uom || null;
	const uoms = collectUoms(item, message, stockUom);
	const rate = pickRate(item, message, stockUom);

	return {
		item_code: itemCode,
		item_name: item.item_name || itemCode,
		barcode: item.barcode || barcode,
		uom: stockUom || uoms[0] || "Nos",
		uoms,
		rate,
		image: resolveImageUrl(origin, item.image || item.image_url || null),
	};
}

/**
 * @param {object} item
 * @param {object} message
 * @param {string | null} stockUom
 * @returns {string[]}
 */
function collectUoms(item, message, stockUom) {
	const out = [];
	const push = (u) => {
		const v = String(u || "").trim();
		if (v && !out.includes(v)) out.push(v);
	};
	push(stockUom);
	const lists = [item.item_uoms, item.uoms, message.uom_prices, message.item_uoms];
	for (const list of lists) {
		if (!Array.isArray(list)) continue;
		for (const row of list) {
			if (typeof row === "string") push(row);
			else if (row && typeof row === "object") {
				push(row.uom || row.UOM || row.name);
			}
		}
	}
	if (message.uom_prices && typeof message.uom_prices === "object" && !Array.isArray(message.uom_prices)) {
		for (const key of Object.keys(message.uom_prices)) push(key);
	}
	if (!out.length) push("Nos");
	return out;
}

/**
 * @param {object} item
 * @param {object} message
 * @param {string | null} stockUom
 */
function pickRate(item, message, stockUom) {
	if (item.rate != null) return Number(item.rate);
	if (item.price_list_rate != null) return Number(item.price_list_rate);
	const prices = message.uom_prices;
	if (prices && typeof prices === "object") {
		if (stockUom && prices[stockUom] != null) {
			const p = prices[stockUom];
			return Number(typeof p === "object" ? p.rate ?? p.price_list_rate : p);
		}
		if (Array.isArray(prices) && prices[0]) {
			const p = prices[0];
			return Number(p.rate ?? p.price_list_rate ?? null);
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
