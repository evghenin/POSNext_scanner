/** Case-insensitive printed article prefixes; always normalize to uppercase. */
export const CODE_PREFIXES = ["SKU", "NSU", "SRV"];
export const SKU_REGEX = /\bSKU\d{5}\b/gi;
export const NSU_REGEX = /\bNSU\d{5}\b/gi;
export const SRV_REGEX = /\bSRV\d{5}\b/gi;
/** Combined shelf item-code mask: SKU##### | NSU##### | SRV##### */
export const ITEM_CODE_REGEX = /\b(?:SKU|NSU|SRV)\d{5}\b/gi;

/**
 * Normalize OCR noise that commonly corrupts Hotel Life shelf-tag print.
 * @param {string} text
 */
export function normalizeOcrText(text) {
	return String(text || "")
		.toUpperCase()
		.replace(/[\u041E\u043E]/g, "0") // Cyrillic O → 0 inside digit runs later
		.replace(/\bS\s*K\s*U(?=\d|\b)/g, "SKU")
		.replace(/\bN\s*S\s*U(?=\d|\b)/g, "NSU")
		.replace(/\bS\s*R\s*V(?=\d|\b)/g, "SRV")
		.replace(/\bSCU/g, "SKU")
		.replace(/\bSKV/g, "SKU")
		.replace(/\b5KU/g, "SKU")
		.replace(/\bN5U/g, "NSU")
		.replace(/\bMSU/g, "NSU")
		.replace(/\b5RV/g, "SRV")
		.replace(/\bSRY/g, "SRV")
		.replace(/\bSKUO/g, "SKU0")
		.replace(/\bNSUO/g, "NSU0")
		.replace(/\bSRVO/g, "SRV0")
		.replace(/\bSKU[OQ]/g, "SKU0")
		.replace(/\bNSU[OQ]/g, "NSU0")
		.replace(/\bSRV[OQ]/g, "SRV0");
}

/**
 * Extract unique SKU##### / NSU##### / SRV##### tokens from OCR (or any) text.
 * @param {string} text
 * @returns {string[]} uppercase unique matches in discovery order
 */
export function extractSkuCodes(text) {
	if (!text) return [];
	const normalized = normalizeOcrText(text);
	const seen = new Set();
	const out = [];
	for (const match of normalized.matchAll(ITEM_CODE_REGEX)) {
		const code = match[0].toUpperCase();
		if (!seen.has(code)) {
			seen.add(code);
			out.push(code);
		}
	}
	// Spaced digits: SKU 0 0 7 7 6 / NSU 0 0 0 0 1 / SRV 0 0 0 0 1
	for (const match of normalized.matchAll(
		/\b(SKU|NSU|SRV)\s*(\d)\s*(\d)\s*(\d)\s*(\d)\s*(\d)\b/g
	)) {
		const code = `${match[1]}${match[2]}${match[3]}${match[4]}${match[5]}${match[6]}`;
		if (!seen.has(code)) {
			seen.add(code);
			out.push(code);
		}
	}
	return out;
}

/**
 * Mask registry (TZ §5.1). SKU + NSU + SRV active for shelf tags.
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
	{
		id: "nsu",
		label: "NSU#####",
		regex: NSU_REGEX,
		normalize: (m) => m.toUpperCase(),
		enabled: true,
	},
	{
		id: "srv",
		label: "SRV#####",
		regex: SRV_REGEX,
		normalize: (m) => m.toUpperCase(),
		enabled: true,
	},
];
