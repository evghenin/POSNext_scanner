/**
 * Mock item lookup for the recognition prototype.
 * If a Frappe session + POS profile are available later, swap to
 * `pos_next.api.items.search_by_barcode` without changing the UI contract.
 */

const MOCK_ITEMS = [
	{
		item_code: "SKU00673",
		item_name: "Вода негазированная 0.5 л",
		barcode: "4601234567890",
		uom: "Nos",
		rate: 18.5,
		image: null,
	},
	{
		item_code: "SKU00001",
		item_name: "Пакет майка",
		barcode: "2000000000015",
		uom: "Nos",
		rate: 2.0,
		image: null,
	},
	{
		item_code: "SKU00002",
		item_name: "Хлеб белый",
		barcode: "4600000000023",
		uom: "Nos",
		rate: 12.0,
		image: null,
	},
	{
		item_code: "DEMO-QR",
		item_name: "Демо QR-товар",
		barcode: "DEMO-QR-001",
		uom: "Nos",
		rate: 1.0,
		image: null,
	},
];

/**
 * @param {string} code
 * @returns {Promise<{ found: boolean, item: object | null, query: string, source: "mock" }>}
 */
export async function lookupItem(code) {
	const q = String(code || "").trim();
	await delay(80 + Math.random() * 120);
	if (!q) return { found: false, item: null, query: q, source: "mock" };

	const upper = q.toUpperCase();
	const item =
		MOCK_ITEMS.find(
			(i) =>
				i.item_code.toUpperCase() === upper ||
				i.barcode === q ||
				i.barcode.toUpperCase() === upper
		) || null;

	if (item) {
		return { found: true, item: { ...item }, query: q, source: "mock" };
	}

	// Unknown codes still surface as a provisional card so decode UX can be tested.
	return {
		found: false,
		item: {
			item_code: upper,
			item_name: "Не найден в демо-каталоге",
			barcode: q,
			uom: "Nos",
			rate: null,
			image: null,
			unknown: true,
		},
		query: q,
		source: "mock",
	};
}

function delay(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

export function listMockItems() {
	return MOCK_ITEMS.map((i) => ({ ...i }));
}
