/**
 * Manual shelf-code model: {PREFIX}{5 digits}, digits enter from the right (odometer).
 */

import { CODE_PREFIXES } from "./sku.js";

export const MANUAL_PREFIXES = [...CODE_PREFIXES];
export const MANUAL_DIGIT_LEN = 5;

/**
 * @typedef {object} ManualCodeState
 * @property {string} prefix
 * @property {string} digits  exactly 5 chars
 */

/** @returns {ManualCodeState} */
export function createManualCodeState(prefix = "SKU") {
	return {
		prefix: normalizePrefix(prefix),
		digits: "0".repeat(MANUAL_DIGIT_LEN),
	};
}

/** @param {unknown} prefix @returns {string} */
export function normalizePrefix(prefix) {
	const p = String(prefix || "SKU").toUpperCase();
	return MANUAL_PREFIXES.includes(p) ? p : "SKU";
}

/** @param {ManualCodeState} state */
export function formatManualCode(state) {
	return `${normalizePrefix(state.prefix)}${String(state.digits || "").padStart(MANUAL_DIGIT_LEN, "0").slice(-MANUAL_DIGIT_LEN)}`;
}

/**
 * Change prefix only; digits preserved.
 * @param {ManualCodeState} state
 * @param {string} prefix
 * @returns {ManualCodeState}
 */
export function setManualPrefix(state, prefix) {
	return {
		prefix: normalizePrefix(prefix),
		digits: String(state.digits || "").padStart(MANUAL_DIGIT_LEN, "0").slice(-MANUAL_DIGIT_LEN),
	};
}

/**
 * Enter one digit from the right: 00000 + 1 → 00001; + 2 → 00012.
 * @param {ManualCodeState} state
 * @param {string | number} digit
 * @returns {ManualCodeState}
 */
export function enterManualDigit(state, digit) {
	const d = String(digit);
	if (!/^\d$/.test(d)) return { ...state };
	const cur = String(state.digits || "").padStart(MANUAL_DIGIT_LEN, "0").slice(-MANUAL_DIGIT_LEN);
	return {
		prefix: normalizePrefix(state.prefix),
		digits: (cur + d).slice(-MANUAL_DIGIT_LEN),
	};
}

/**
 * Clear digits to 00000; prefix kept.
 * @param {ManualCodeState} state
 * @returns {ManualCodeState}
 */
export function clearManualDigits(state) {
	return {
		prefix: normalizePrefix(state.prefix),
		digits: "0".repeat(MANUAL_DIGIT_LEN),
	};
}

/**
 * Backspace: drop last entered digit (shift right / pad left with 0).
 * 00012 → 00001 → 00000
 * @param {ManualCodeState} state
 * @returns {ManualCodeState}
 */
export function backspaceManualDigit(state) {
	const cur = String(state.digits || "").padStart(MANUAL_DIGIT_LEN, "0").slice(-MANUAL_DIGIT_LEN);
	return {
		prefix: normalizePrefix(state.prefix),
		digits: (`0${cur}`).slice(0, MANUAL_DIGIT_LEN),
	};
}
