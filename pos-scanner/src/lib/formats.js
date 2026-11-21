/**
 * TZ §5.1 required formats and how we map them to zxing-wasm reader names.
 * Native BarcodeDetector (Chrome Android) is an optional fast-path only.
 */

/** @type {const} */
export const REQUIRED_FORMATS = [
	"EAN-8",
	"EAN-13",
	"UPC-A",
	"UPC-E",
	"Code 39",
	"Code 128",
	"QR Code",
	"Data Matrix",
	"PDF417",
];

/** zxing-wasm / reader format ids we request */
export const ZXING_FORMATS = [
	"EAN-8",
	"EAN-13",
	"UPC-A",
	"UPC-E",
	"Code39",
	"Code128",
	"QRCode",
	"DataMatrix",
	"PDF417",
];

/** BarcodeDetector format strings (Chromium) */
export const NATIVE_FORMATS = [
	"ean_8",
	"ean_13",
	"upc_a",
	"upc_e",
	"code_39",
	"code_128",
	"qr_code",
	"data_matrix",
	"pdf417",
];

/**
 * Normalize library-specific format labels to a stable display name.
 * @param {string} raw
 */
export function normalizeFormatLabel(raw) {
	const key = String(raw || "")
		.replace(/[\s_-]+/g, "")
		.toLowerCase();
	const map = {
		ean8: "EAN-8",
		ean13: "EAN-13",
		upca: "UPC-A",
		upce: "UPC-E",
		code39: "Code 39",
		code128: "Code 128",
		qrcode: "QR Code",
		datamatrix: "Data Matrix",
		pdf417: "PDF417",
	};
	return map[key] || raw || "Unknown";
}
