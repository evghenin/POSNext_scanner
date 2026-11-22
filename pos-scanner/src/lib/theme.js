/**
 * Theme: dark | light | system (follows prefers-color-scheme).
 * @typedef {"dark" | "light" | "system"} ThemeMode
 */

/** @type {MediaQueryList | null} */
let mq = null;
/** @type {((e: MediaQueryListEvent) => void) | null} */
let mqHandler = null;

/** @param {unknown} theme @returns {ThemeMode} */
export function normalizeTheme(theme) {
	const v = String(theme || "system").toLowerCase();
	if (v === "dark" || v === "light") return v;
	return "system";
}

/** @param {ThemeMode} theme */
export function resolveTheme(theme) {
	const mode = normalizeTheme(theme);
	if (mode === "system") {
		if (typeof window !== "undefined" && window.matchMedia) {
			return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
		}
		return "dark";
	}
	return mode;
}

/** @param {ThemeMode | string} theme */
export function applyTheme(theme) {
	const mode = normalizeTheme(theme);
	const resolved = resolveTheme(mode);
	if (typeof document !== "undefined") {
		document.documentElement.dataset.theme = resolved;
		document.documentElement.style.colorScheme = resolved;
	}
	if (typeof window === "undefined" || !window.matchMedia) return;
	if (mq && mqHandler) {
		mq.removeEventListener("change", mqHandler);
		mq = null;
		mqHandler = null;
	}
	if (mode === "system") {
		mq = window.matchMedia("(prefers-color-scheme: light)");
		mqHandler = () => applyTheme("system");
		mq.addEventListener("change", mqHandler);
	}
}
