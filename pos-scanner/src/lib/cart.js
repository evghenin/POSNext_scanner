/**
 * Local scanner cart: persist, merge by item_code+uom, pending send batch ids.
 */

export const CART_KEY = "posnext.scanner.cart";

/**
 * @typedef {object} CartLine
 * @property {string} id
 * @property {string} item_code
 * @property {string} item_name
 * @property {number} qty
 * @property {string} uom
 * @property {number} [conversion_factor]
 * @property {number} rate  price per 1 base unit
 * @property {string | null} [image]
 */

/**
 * @typedef {object} PendingSend
 * @property {string} batchId
 * @property {string} cartGeneration
 * @property {{ operation_id: string, item_code: string, qty: number, uom: string, line_id: string }[]} operations
 */

/**
 * @typedef {object} CartState
 * @property {CartLine[]} lines
 * @property {PendingSend | null} pendingSend
 */

/** @returns {CartState} */
export function emptyCart() {
	return { lines: [], pendingSend: null };
}

/** @returns {CartState} */
export function loadCart() {
	if (typeof localStorage === "undefined") return emptyCart();
	try {
		const raw = localStorage.getItem(CART_KEY);
		if (!raw) return emptyCart();
		const o = JSON.parse(raw);
		const lines = Array.isArray(o.lines) ? o.lines.map(normalizeLine).filter(Boolean) : [];
		return {
			lines,
			pendingSend: o.pendingSend && typeof o.pendingSend === "object" ? o.pendingSend : null,
		};
	} catch {
		return emptyCart();
	}
}

/** @param {CartState} state */
export function saveCart(state) {
	if (typeof localStorage === "undefined") return state;
	localStorage.setItem(
		CART_KEY,
		JSON.stringify({
			lines: state.lines,
			pendingSend: state.pendingSend,
		})
	);
	return state;
}

/** @param {unknown} row @returns {CartLine | null} */
function normalizeLine(row) {
	if (!row || typeof row !== "object") return null;
	const o = /** @type {Record<string, unknown>} */ (row);
	const item_code = String(o.item_code || "").trim();
	if (!item_code) return null;
	const qty = Number(o.qty);
	const rate = Number(o.rate);
	if (!Number.isFinite(qty) || qty <= 0) return null;
	return {
		id: String(o.id || newId()),
		item_code,
		item_name: String(o.item_name || item_code),
		qty,
		uom: String(o.uom || "Nos"),
		conversion_factor: Number(o.conversion_factor) > 0 ? Number(o.conversion_factor) : 1,
		rate: Number.isFinite(rate) ? rate : 0,
		image: o.image ? String(o.image) : null,
	};
}

function newId() {
	return typeof crypto !== "undefined" && crypto.randomUUID
		? crypto.randomUUID()
		: `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Add or merge. Same item_code + uom → increase qty.
 * @param {CartState} state
 * @param {Omit<CartLine, "id"> & { id?: string }} item
 * @returns {CartState}
 */
export function addToCart(state, item) {
	const code = String(item.item_code || "").trim();
	const uom = String(item.uom || "Nos");
	const qty = Number(item.qty);
	if (!code || !Number.isFinite(qty) || qty <= 0) return state;
	if (item.rate == null || !Number.isFinite(Number(item.rate))) return state;

	const lines = state.lines.map((l) => ({ ...l }));
	const idx = lines.findIndex((l) => l.item_code === code && l.uom === uom);
	if (idx >= 0) {
		lines[idx] = { ...lines[idx], qty: lines[idx].qty + qty };
	} else {
		lines.push({
			id: item.id || newId(),
			item_code: code,
			item_name: String(item.item_name || code),
			qty,
			uom,
			conversion_factor: Number(item.conversion_factor) > 0 ? Number(item.conversion_factor) : 1,
			rate: Number(item.rate),
			image: item.image || null,
		});
	}
	const next = { ...state, lines, pendingSend: null };
	return saveCart(next);
}

/**
 * @param {CartState} state
 * @param {string} lineId
 * @param {number} qty
 */
export function setLineQty(state, lineId, qty) {
	const q = Number(qty);
	const lines = state.lines
		.map((l) => {
			if (l.id !== lineId) return l;
			if (!Number.isFinite(q) || q <= 0) return null;
			return { ...l, qty: q };
		})
		.filter(Boolean);
	return saveCart({ ...state, lines, pendingSend: null });
}

/**
 * @param {CartState} state
 * @param {string} lineId
 */
export function removeLine(state, lineId) {
	const lines = state.lines.filter((l) => l.id !== lineId);
	return saveCart({ ...state, lines, pendingSend: null });
}

/** @param {CartState} state */
export function clearCartLines(state) {
	return saveCart({ ...state, lines: [], pendingSend: null });
}

/**
 * Build or reuse pending send ops for idempotent retry.
 * @param {CartState} state
 * @param {string} cartGeneration
 * @returns {CartState}
 */
export function ensurePendingSend(state, cartGeneration) {
	if (state.pendingSend?.operations?.length && state.pendingSend.cartGeneration === cartGeneration) {
		return state;
	}
	const batchId = newId();
	const operations = state.lines.map((l) => ({
		operation_id: newId(),
		item_code: l.item_code,
		qty: l.qty,
		uom: l.uom,
		line_id: l.id,
	}));
	const next = {
		...state,
		pendingSend: { batchId, cartGeneration, operations },
	};
	return saveCart(next);
}

/**
 * @param {CartState} state
 * @param {PendingSend} pending
 */
export function setPendingSend(state, pending) {
	return saveCart({ ...state, pendingSend: pending });
}
