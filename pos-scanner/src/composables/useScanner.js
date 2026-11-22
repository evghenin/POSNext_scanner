import { computed, onBeforeUnmount, ref, shallowRef } from "vue";
import { decodeBarcodes, getBarcodeEngineInfo, prepareBarcodeEngine } from "@/lib/barcode.js";
import { createDedupe } from "@/lib/dedupe.js";
import { feedback } from "@/lib/feedback.js";
import { lookupItem } from "@/lib/itemLookup.js";
import { isTransientFrameError } from "@/lib/framePixels.js";
import {
	getLastOcrError,
	getOcrCacheHints,
	ocrStatusLabel,
	prepareOcrEngine,
	recognizeSkuInRegion,
	subscribeOcrStatus,
} from "@/lib/ocr.js";

/**
 * Continuous barcode scan; OCR only on explicit user tap (capture current frame).
 * Multi match → picker; single hit → confirm sheet (qty / UOM).
 */
export function useScanner(camera) {
	const running = ref(false);
	const paused = ref(false);
	const status = ref("idle");
	const lastError = ref(null);
	const engineInfo = ref(null);
	const ocrHints = ref(null);
	const ocrReady = ref(false);
	/** @type {import("vue").Ref<'idle' | 'loading' | 'ready' | 'error'>} */
	const ocrStatus = ref("idle");
	const ocrStatusText = ref(ocrStatusLabel("idle"));
	const fpsHint = ref(0);
	const lastDecodeMs = ref(0);
	const ocrBusy = ref(false);

	/** @type {import("vue").Ref<null | { kind: string, candidates: any[], source: string }>} */
	const pendingChoice = ref(null);
	const result = shallowRef(null);
	const lookingUp = ref(false);

	const cropCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
	const dedupe = createDedupe({ ttlMs: 2800 });

	let raf = 0;
	let busy = false;
	let lastFrameAt = 0;
	const BARCODE_INTERVAL_MS = 120;

	const unsubOcr = subscribeOcrStatus((payload) => {
		ocrStatus.value = payload.status;
		ocrStatusText.value = payload.message;
		ocrReady.value = payload.status === "ready";
		if (payload.status === "error") {
			lastError.value = payload.message;
		}
	});

	const hasPending = computed(() => Boolean(pendingChoice.value || result.value));

	async function warmEngines() {
		status.value = "loading";
		try {
			await prepareBarcodeEngine();
			engineInfo.value = await getBarcodeEngineInfo();
			prepareOcrEngine()
				.then(() => {
					ocrReady.value = true;
					ocrHints.value = getOcrCacheHints();
					if (lastError.value?.startsWith("OCR")) lastError.value = null;
				})
				.catch((e) => {
					ocrReady.value = false;
					ocrHints.value = getOcrCacheHints();
					const msg = e?.message || getLastOcrError() || String(e);
					console.warn("[scanner] OCR warm failed", msg);
					lastError.value = `OCR ошибка: ${msg}`;
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
		if (lastError.value && !String(lastError.value).startsWith("OCR")) {
			lastError.value = null;
		}
		paused.value = false;
		if (running.value) schedule();
	}

	function schedule() {
		if (!running.value) return;
		raf = requestAnimationFrame(tick);
	}

	/** Continuous barcode only — OCR waits for {@link captureOcrNow}. */
	async function tick(ts) {
		if (!running.value) return;
		if (paused.value || hasPending.value || busy || ocrBusy.value) {
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
			}
		} catch (e) {
			if (isTransientFrameError(e)) {
				console.warn("[scanner] transient frame skip", e?.message || e);
			} else {
				const msg = e?.message || String(e);
				lastError.value = msg.startsWith("OCR") ? msg : `Ошибка сканера: ${msg}`;
			}
		} finally {
			busy = false;
			schedule();
		}
	}

	/**
	 * User-triggered OCR: capture current reticle frame once.
	 */
	async function captureOcrNow() {
		if (ocrBusy.value || paused.value || hasPending.value) return;
		if (!camera.ready.value || !cropCanvas) {
			lastError.value = "Камера не готова";
			return;
		}
		if (!ocrReady.value) {
			try {
				await prepareOcrEngine();
				ocrReady.value = true;
			} catch (e) {
				lastError.value = `OCR ошибка: ${e?.message || getLastOcrError() || e}`;
				return;
			}
		}

		ocrBusy.value = true;
		status.value = "ocr";
		const t0 = performance.now();
		try {
			const ocrFrame =
				typeof camera.captureOcrReticle === "function"
					? camera.captureOcrReticle(cropCanvas)
					: camera.captureReticle(cropCanvas);
			if (!ocrFrame?.canvas) {
				lastError.value = "Не удалось снять кадр";
				return;
			}
			const ocr = await recognizeSkuInRegion(ocrFrame.canvas);
			lastDecodeMs.value = ocr.durationMs || Math.round(performance.now() - t0);
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
			} else {
				feedback("error");
				lastError.value = "Код не распознан — наведите прицел и нажмите ещё раз";
			}
		} catch (e) {
			if (isTransientFrameError(e)) {
				console.warn("[scanner] OCR frame skip", e?.message || e);
				lastError.value = "Кадр не готов — повторите";
			} else {
				const msg = e?.message || String(e);
				lastError.value = msg.startsWith("OCR") ? msg : `OCR ошибка: ${msg}`;
			}
		} finally {
			ocrBusy.value = false;
			if (!hasPending.value && running.value) status.value = "scanning";
		}
	}

	async function emitRecognition(payload) {
		if (!dedupe.accept(payload.value)) return;
		pauseForUi();
		feedback("recognized");
		lookingUp.value = true;
		try {
			const lookup = await lookupItem(payload.value);
			const item = lookup?.item || null;
			const found = Boolean(lookup?.found && item);
			const rate = item?.rate;
			if (!found || rate == null || !Number.isFinite(Number(rate))) {
				feedback("error");
				lastError.value = !found ? "item_missing" : "item_no_price";
				dedupe.forget(payload.value);
				result.value = null;
				pendingChoice.value = null;
				paused.value = false;
				return;
			}
			const uoms = item?.uoms?.length ? item.uoms : item?.uom ? [item.uom] : [];
			const defaultUom = item?.uom || uoms[0] || "Nos";
			result.value = {
				...payload,
				lookup,
				qty: 1,
				uom: defaultUom,
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

	/**
	 * @param {{ qty?: number, uom?: string }} [opts]
	 */
	function confirmAdd(opts = {}) {
		if (!result.value) return;
		const qty = Number(opts.qty ?? result.value.qty ?? 1);
		const uom = String(opts.uom || result.value.uom || "Nos");
		feedback("added");
		const code = result.value.value;
		result.value = {
			...result.value,
			qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
			uom,
			added: true,
		};
		setTimeout(() => dedupe.forget(code), 600);
	}

	function dismiss() {
		if (result.value?.value) dedupe.forget(result.value.value);
		resumeScanning();
	}

	onBeforeUnmount(() => {
		stopLoop();
		unsubOcr();
	});

	return {
		running,
		paused,
		status,
		lastError,
		engineInfo,
		ocrHints,
		ocrReady,
		ocrStatus,
		ocrStatusText,
		fpsHint,
		lastDecodeMs,
		ocrBusy,
		pendingChoice,
		result,
		lookingUp,
		warmEngines,
		startLoop,
		stopLoop,
		resumeScanning,
		captureOcrNow,
		chooseCandidate,
		submitManual,
		confirmAdd,
		dismiss,
	};
}
