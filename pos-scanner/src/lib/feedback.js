/**
 * Distinct feedback hooks for recognized / error / added.
 * Sound + vibration stubs — replace with real assets in production PWA.
 */

const PATTERNS = {
	recognized: { vibe: [18], freq: 880, ms: 60 },
	added: { vibe: [30, 40, 30], freq: 1200, ms: 80 },
	error: { vibe: [60, 40, 60], freq: 220, ms: 140 },
};

let audioCtx = null;

function getCtx() {
	if (typeof window === "undefined") return null;
	const AC = window.AudioContext || window.webkitAudioContext;
	if (!AC) return null;
	if (!audioCtx) audioCtx = new AC();
	return audioCtx;
}

function beep(freq, ms) {
	const ctx = getCtx();
	if (!ctx) return;
	if (ctx.state === "suspended") ctx.resume().catch(() => {});
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = "sine";
	osc.frequency.value = freq;
	gain.gain.value = 0.04;
	osc.connect(gain);
	gain.connect(ctx.destination);
	osc.start();
	osc.stop(ctx.currentTime + ms / 1000);
}

function vibe(pattern) {
	if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
		try {
			navigator.vibrate(pattern);
		} catch {
			/* ignore */
		}
	}
}

/**
 * @param {"recognized" | "added" | "error"} kind
 */
export function feedback(kind) {
	const cfg = PATTERNS[kind] || PATTERNS.recognized;
	vibe(cfg.vibe);
	beep(cfg.freq, cfg.ms);
}
