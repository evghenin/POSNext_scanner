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
			uom: null,
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
	return {
		item_code: itemCode,
		item_name: item.item_name || itemCode,
		barcode: item.barcode || barcode,
		uom: item.stock_uom || item.uom || null,
		rate: item.rate ?? item.price_list_rate ?? null,
		image: item.image || null,
	};
}
