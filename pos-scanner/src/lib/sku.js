/** Case-insensitive printed article match; always normalize to uppercase. */
export const SKU_REGEX = /\bSKU\d{5}\b/gi;

/**
 * Extract unique SKU##### tokens from OCR (or any) text.
 * @param {string} text
 * @returns {string[]} uppercase unique matches in discovery order
 */
export function extractSkuCodes(text) {
	if (!text) return [];
	const seen = new Set();
	const out = [];
	for (const match of String(text).matchAll(SKU_REGEX)) {
		const code = match[0].toUpperCase();
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
