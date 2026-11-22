/** Case-insensitive printed article match; always normalize to uppercase. */
export const SKU_REGEX = /\bSKU\d{5}\b/gi;

/**
 * Normalize OCR noise that commonly corrupts Hotel Life shelf-tag print.
 * @param {string} text
 */
export function normalizeOcrText(text) {
	return String(text || "")
		.toUpperCase()
		.replace(/[\u041E\u043E]/g, "0") // Cyrillic O → 0 inside digit runs later
		.replace(/\bS\s*K\s*U(?=\d|\b)/g, "SKU")
		.replace(/\bSCU/g, "SKU")
		.replace(/\bSKV/g, "SKU")
		.replace(/\b5KU/g, "SKU")
		.replace(/\bSKUO/g, "SKU0")
		.replace(/\bSKU[OQ]/g, "SKU0");
}

/**
 * Extract unique SKU##### tokens from OCR (or any) text.
 * @param {string} text
 * @returns {string[]} uppercase unique matches in discovery order
 */
export function extractSkuCodes(text) {
	if (!text) return [];
	const normalized = normalizeOcrText(text);
	const seen = new Set();
	const out = [];
	for (const match of normalized.matchAll(SKU_REGEX)) {
		const code = match[0].toUpperCase();
		if (!seen.has(code)) {
			seen.add(code);
			out.push(code);
		}
	}
	// Spaced digits: SKU 0 0 7 7 6
	for (const match of normalized.matchAll(/\bSKU\s*(\d)\s*(\d)\s*(\d)\s*(\d)\s*(\d)\b/g)) {
		const code = `SKU${match[1]}${match[2]}${match[3]}${match[4]}${match[5]}`;
		if (!seen.has(code)) {
			seen.add(code);
			out.push(code);
		}
	}
	return out;
}

/**
 * Future-friendly mask registry (TZ §5.1). Only SKU is active in v1.
 * @type {Array<{ id: string, label: string, regex: RegExp, normalize: (m: string) => string, enabled: boolean }>}
 */
export const CODE_MASKS = [
	{
		id: "sku",
		label: "SKU#####",
		regex: SKU_REGEX,
		normalize: (m) => m.toUpperCase(),
		enabled: true,
	},
	// Architecture placeholders — not auto-recognized in v1:
	// { id: "nsu", label: "NSU#####", regex: /\bNSU\d{5}\b/gi, normalize: (m) => m.toUpperCase(), enabled: false },
	// { id: "srv", label: "SRV#####", regex: /\bSRV\d{5}\b/gi, normalize: (m) => m.toUpperCase(), enabled: false },
];
