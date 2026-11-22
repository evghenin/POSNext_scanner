<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { prepareBarcodeEngine, decodeBarcodes } from "@/lib/barcode.js";
import { t } from "@/lib/i18n.js";
import { redeemPairingFromQr } from "@/lib/pairing.js";
import { useCamera } from "@/composables/useCamera.js";

const emit = defineEmits(["paired", "settings", "back"]);

const videoRef = ref(null);
const camera = useCamera();
const status = ref("booting");
const busy = ref(false);
const lastError = ref("");
const cropCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;

let raf = 0;
let alive = true;

onMounted(async () => {
	status.value = "prepare";
	try {
		await prepareBarcodeEngine();
	} catch (e) {
		lastError.value = e?.message || String(e);
	}
	await nextTick();
	await camera.start(videoRef.value);
	if (!camera.ready.value) {
		lastError.value = camera.error.value || t("pairErrorGeneric");
		status.value = "error";
		return;
	}
	status.value = "scanning";
	schedule();
});

onBeforeUnmount(() => {
	alive = false;
	if (raf) cancelAnimationFrame(raf);
	camera.stop();
});

function schedule() {
	if (!alive) return;
	raf = requestAnimationFrame(tick);
}

async function tick() {
	if (!alive || busy.value || status.value === "error") {
		schedule();
		return;
	}
	if (!camera.ready.value || !cropCanvas) {
		schedule();
		return;
	}
	const frame = camera.captureReticle(cropCanvas, { widthRatio: 0.85, heightRatio: 0.55 });
	if (!frame) {
		schedule();
		return;
	}
	try {
		const hits = await decodeBarcodes(frame.canvas);
		const qr = hits.find(
			(h) => /qr/i.test(h.format) || String(h.value || "").length >= 16
		);
		if (qr?.value) {
			await redeem(qr.value);
			return;
		}
	} catch (e) {
		console.warn("[pair] decode", e?.message || e);
	}
	schedule();
}

async function redeem(raw) {
	busy.value = true;
	status.value = "redeeming";
	try {
		const session = await redeemPairingFromQr(raw);
		camera.stop();
		emit("paired", session);
	} catch (e) {
		const code = e?.code || "";
		const msg = String(e?.message || e || "");
		if (code === "invalid_qr" || msg === "invalid_qr") {
			lastError.value = t("pairErrorInvalidQr");
			busy.value = false;
			status.value = "scanning";
			schedule();
			return;
		}
		lastError.value = msg || t("pairErrorGeneric");
		status.value = "error";
		busy.value = false;
		camera.stop();
	}
}

function tryAgain() {
	lastError.value = "";
	busy.value = false;
	status.value = "scanning";
	alive = true;
	nextTick(async () => {
		await camera.start(videoRef.value);
		if (camera.ready.value) schedule();
		else {
			lastError.value = camera.error.value || t("pairErrorGeneric");
			status.value = "error";
		}
	});
}
</script>

<template>
	<section class="pair">
		<header class="pair__head">
			<p class="brand">{{ t("appName") }}</p>
			<h1>{{ t("pairTitle") }}</h1>
			<p class="desc">{{ t("pairBody") }}</p>
		</header>

		<div class="pair__stage">
			<video ref="videoRef" class="preview" playsinline muted autoplay />
			<div class="frame" aria-hidden="true" />
			<p class="hud">
				{{
					status === "redeeming"
						? t("pairRedeeming")
						: status === "scanning"
							? t("pairScanning")
							: status === "error"
								? t("pairErrorTitle")
								: t("checkingPairing")
				}}
			</p>
		</div>

		<p v-if="lastError" class="err" role="alert">{{ lastError }}</p>

		<div class="actions">
			<button v-if="status === 'error'" type="button" class="primary" @click="tryAgain">
				{{ t("pairTryAgain") }}
			</button>
			<button type="button" class="secondary" @click="emit('settings')">
				{{ t("openSettings") }}
			</button>
			<button type="button" class="ghost" @click="emit('back')">{{ t("backToConnected") }}</button>
		</div>
	</section>
</template>

<style scoped>
.pair {
	height: 100%;
	display: grid;
	grid-template-rows: auto 1fr auto;
	gap: 0.75rem;
	padding: 1rem 1rem max(1rem, env(safe-area-inset-bottom));
}

.brand {
	margin: 0;
	font-weight: 700;
}

h1 {
	margin: 0.25rem 0 0;
	font-size: 1.35rem;
}

.desc {
	margin: 0.35rem 0 0;
	color: var(--muted);
	line-height: 1.4;
	font-size: 0.92rem;
}

.pair__stage {
	position: relative;
	min-height: 0;
	border-radius: 16px;
	overflow: hidden;
	background: #000;
}

.preview {
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.frame {
	position: absolute;
	inset: 18% 8%;
	border: 2px solid var(--reticle);
	border-radius: 12px;
	box-shadow: 0 0 0 999px rgba(0, 0, 0, 0.35);
	pointer-events: none;
}

.hud {
	position: absolute;
	left: 0.75rem;
	right: 0.75rem;
	bottom: 0.75rem;
	margin: 0;
	padding: 0.45rem 0.65rem;
	border-radius: 999px;
	background: rgba(0, 0, 0, 0.55);
	color: #fff;
	font-size: 0.85rem;
	text-align: center;
}

.err {
	margin: 0;
	color: var(--danger);
	font-size: 0.9rem;
}

.actions {
	display: grid;
	gap: 0.5rem;
}

button {
	border: 0;
	border-radius: 12px;
	padding: 0.85rem 1rem;
	font-weight: 650;
}

.primary {
	background: var(--accent);
	color: var(--accent-fg);
}

.secondary {
	background: transparent;
	color: var(--fg);
	border: 1px solid var(--border);
}

.ghost {
	background: transparent;
	color: var(--muted);
}
</style>
