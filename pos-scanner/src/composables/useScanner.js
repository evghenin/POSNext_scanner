import { computed, onBeforeUnmount, ref, shallowRef } from "vue";
import { decodeBarcodes, getBarcodeEngineInfo, prepareBarcodeEngine } from "@/lib/barcode.js";
import { createDedupe } from "@/lib/dedupe.js";
import { feedback } from "@/lib/feedback.js";
import { lookupItem } from "@/lib/mockCatalog.js";
import { getOcrCacheHints, prepareOcrEngine, recognizeSkuInRegion } from "@/lib/ocr.js";

/**
 * Recognition loop: barcode first; OCR only when no barcode in the reticle.
 * Multi OCR / multi barcode → user choice, never silent wrong pick.
 */
export function useScanner(camera) {
	const running = ref(false);
	const paused = ref(false);
	const status = ref("idle");
	const lastError = ref(null);
	const engineInfo = ref(null);
	const ocrHints = ref(null);
	const fpsHint = ref(0);
	const lastDecodeMs = ref(0);

	/** @type {import("vue").Ref<null | { kind: string, candidates: any[], source: string }>} */
	const pendingChoice = ref(null);
	const result = shallowRef(null);
	const lookingUp = ref(false);

	const cropCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
	const dedupe = createDedupe({ ttlMs: 2800 });

	let raf = 0;
	let busy = false;
	let lastFrameAt = 0;
	let ocrEvery = 0;
	const BARCODE_INTERVAL_MS = 180;
	const OCR_EVERY_N_PASSES = 4; // OCR is heavier — throttle

	const hasPending = computed(() => Boolean(pendingChoice.value || result.value));

	async function warmEngines() {
		status.value = "loading";
		try {
			await prepareBarcodeEngine();
			engineInfo.value = await getBarcodeEngineInfo();
			// OCR warm is optional at start — kick in background
			prepareOcrEngine()
				.then(() => {
					ocrHints.value = getOcrCacheHints();
				})
				.catch((e) => {
					console.warn("[scanner] OCR warm failed", e);
				});
			status.value = "ready";
		} catch (e) {
			lastError.value = e?.message || String(e);
			status.value = "error";
			feedback("error");
		}
	}

	async function startLoop() {
		if (running.value) return;
		running.value = true;
		paused.value = false;
		status.value = "scanning";
		schedule();
	}

	function stopLoop() {
		running.value = false;
		if (raf) cancelAnimationFrame(raf);
		raf = 0;
	}

	function pauseForUi() {
		paused.value = true;
	}

	function resumeScanning() {
		pendingChoice.value = null;
		result.value = null;
		lastError.value = null;
		paused.value = false;
		if (running.value) schedule();
	}

	function schedule() {
		if (!running.value) return;
		raf = requestAnimationFrame(tick);
	}

	async function tick(ts) {
		if (!running.value) return;
		if (paused.value || hasPending.value || busy) {
			schedule();
			return;
		}
		if (ts - lastFrameAt < BARCODE_INTERVAL_MS) {
			schedule();
			return;
		}
		lastFrameAt = ts;

		if (!camera.ready.value || !cropCanvas) {
			schedule();
			return;
		}

		const frame = camera.captureReticle(cropCanvas);
		if (!frame) {
			schedule();
			return;
		}

		busy = true;
		const t0 = performance.now();
		try {
			const barcodes = await decodeBarcodes(frame.canvas);
			lastDecodeMs.value = Math.round(performance.now() - t0);
			fpsHint.value = Math.min(30, Math.round(1000 / Math.max(lastDecodeMs.value, BARCODE_INTERVAL_MS)));

			if (barcodes.length === 1) {
				await emitRecognition({
					value: barcodes[0].value,
					format: barcodes[0].format,
					source: "barcode",
					engine: barcodes[0].engine,
				});
			} else if (barcodes.length > 1) {
				pauseForUi();
				pendingChoice.value = {
					kind: "barcode",
					source: "barcode",
					candidates: barcodes.map((b) => ({
						value: b.value,
						format: b.format,
						engine: b.engine,
					})),
				};
				feedback("recognized");
			} else {
				// No barcode → OCR on reticle (throttled)
				ocrEvery = (ocrEvery + 1) % OCR_EVERY_N_PASSES;
				if (ocrEvery === 0) {
					const ocr = await recognizeSkuInRegion(frame.canvas);
					if (ocr.codes.length === 1) {
						await emitRecognition({
							value: ocr.codes[0],
							format: "OCR SKU",
							source: "ocr",
							engine: "tesseract",
							rawText: ocr.rawText,
							durationMs: ocr.durationMs,
						});
					} else if (ocr.codes.length > 1) {
						pauseForUi();
						pendingChoice.value = {
							kind: "ocr",
							source: "ocr",
							candidates: ocr.codes.map((code) => ({
								value: code,
								format: "OCR SKU",
								engine: "tesseract",
							})),
							rawText: ocr.rawText,
						};
						feedback("recognized");
					}
				}
			}
		} catch (e) {
			lastError.value = e?.message || String(e);
		} finally {
			busy = false;
			schedule();
		}
	}

	async function emitRecognition(payload) {
		if (!dedupe.accept(payload.value)) return;
		pauseForUi();
		feedback("recognized");
		lookingUp.value = true;
		try {
			const lookup = await lookupItem(payload.value);
			result.value = {
				...payload,
				lookup,
				at: Date.now(),
			};
		} catch (e) {
			feedback("error");
			lastError.value = e?.message || String(e);
			dedupe.forget(payload.value);
			paused.value = false;
		} finally {
			lookingUp.value = false;
		}
	}

	async function chooseCandidate(candidate) {
		pendingChoice.value = null;
		await emitRecognition({
			value: candidate.value,
			format: candidate.format,
			source: candidate.engine === "tesseract" ? "ocr" : "barcode",
			engine: candidate.engine,
		});
	}

	async function submitManual(code) {
		const value = String(code || "").trim();
		if (!value) return;
		dedupe.forget(value);
		await emitRecognition({
			value,
			format: "Manual",
			source: "manual",
			engine: "manual",
		});
	}

	function confirmAdd() {
		if (!result.value) return;
		feedback("added");
		const code = result.value.value;
		result.value = {
			...result.value,
			added: true,
		};
		// After intentional add, allow rescan of same code after short TTL
		setTimeout(() => dedupe.forget(code), 600);
	}

	function dismiss() {
		if (result.value?.value) dedupe.forget(result.value.value);
		resumeScanning();
	}

	onBeforeUnmount(stopLoop);

	return {
		running,
		paused,
		status,
		lastError,
		engineInfo,
		ocrHints,
		fpsHint,
		lastDecodeMs,
		pendingChoice,
		result,
		lookingUp,
		warmEngines,
		startLoop,
		stopLoop,
		resumeScanning,
		chooseCandidate,
		submitManual,
		confirmAdd,
		dismiss,
	};
}
