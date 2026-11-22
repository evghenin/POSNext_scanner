<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import CartPanel from "@/components/CartPanel.vue";
import ItemAddCard from "@/components/ItemAddCard.vue";
import ManualKeypad from "@/components/ManualKeypad.vue";
import MatchPicker from "@/components/MatchPicker.vue";
import Reticle from "@/components/Reticle.vue";
import { CAMERA_BLACK_POSTER, useCamera } from "@/composables/useCamera.js";
import { useScanner } from "@/composables/useScanner.js";
import {
	addToCart,
	loadCart,
	removeLine,
	setLineQty,
} from "@/lib/cart.js";
import { sendCartToTill } from "@/lib/cartSend.js";
import { feedback } from "@/lib/feedback.js";
import { LOOKUP_ITEM_METHOD } from "@/lib/itemLookup.js";
import { t } from "@/lib/i18n.js";
import { disconnectSelf } from "@/lib/pairing.js";

defineProps({
	pairing: { type: Object, default: null },
});
const emit = defineEmits(["pair-again", "settings", "disconnected"]);

const videoRef = ref(null);
const camera = useCamera();
const scanner = useScanner(camera);
const cart = ref(loadCart());
const banner = ref("");
const sending = ref(false);
const manualMode = ref(false);
const disconnecting = ref(false);

const statusHint = computed(() => {
	if (scanner.lookingUp.value) return t("lookingUp");
	if (scanner.ocrBusy.value) return t("lookingUp");
	return "";
});

onMounted(async () => {
	await scanner.warmEngines();
	await startCameraStrip();
});

onBeforeUnmount(() => {
	teardownCamera();
});

watch(
	() => scanner.lastError.value,
	(err) => {
		if (!err) return;
		if (err === "item_missing") banner.value = t("itemMissing");
		else if (err === "item_no_price") banner.value = t("itemNoPrice");
		else if (err === "not_for_sale") banner.value = t("itemNotForSale");
		else if (err === "lookup_api_missing") {
			banner.value = t("lookupApiMissing", { method: LOOKUP_ITEM_METHOD });
		} else if (err === "not_connected") banner.value = t("pairAgainKeepCart");
		else banner.value = String(err);
		scanner.lastError.value = null;
	}
);

async function startCameraStrip() {
	manualMode.value = false;
	await nextTick();
	await camera.start(videoRef.value);
	if (camera.ready.value) {
		await scanner.startLoop();
	} else {
		banner.value = camera.error.value || t("pairErrorGeneric");
	}
}

function teardownCamera() {
	scanner.stopLoop();
	camera.stop();
}

async function onCapture() {
	banner.value = "";
	await scanner.captureOcrNow();
}

function openManual() {
	banner.value = "";
	scanner.dismiss();
	teardownCamera();
	manualMode.value = true;
}

async function backFromManual() {
	banner.value = "";
	scanner.dismiss();
	await startCameraStrip();
}

async function onManualSelect({ code }) {
	banner.value = "";
	await scanner.submitManual(code);
}

function onAdd(opts) {
	const result = scanner.result.value;
	const item = result?.lookup?.item;
	if (!item) return;
	cart.value = addToCart(cart.value, {
		item_code: item.item_code,
		item_name: item.item_name,
		qty: opts.qty,
		uom: opts.uom,
		conversion_factor: opts.conversion_factor,
		rate: item.rate,
		image: item.image,
	});
	feedback("added");
	scanner.dismiss();
	banner.value = "";
}

function onDismissItem() {
	scanner.dismiss();
}

function onUpdateQty(id, qty) {
	cart.value = setLineQty(cart.value, id, qty);
}

function onRemove(id) {
	cart.value = removeLine(cart.value, id);
}

async function onSend() {
	sending.value = true;
	banner.value = t("sendingCart");
	try {
		const outcome = await sendCartToTill();
		cart.value = outcome.cart || loadCart();
		if (outcome.kind === "ok") {
			feedback("added");
			banner.value = t("cartSent");
		} else if (outcome.kind === "pairing_lost") {
			banner.value = t("pairAgainKeepCart");
			emit("pair-again");
		} else if (outcome.kind === "rejected") {
			banner.value = t("cartSendRejected");
		} else if (outcome.kind === "timeout") {
			banner.value = t("cartSendTimeout");
		} else {
			banner.value = outcome.message || t("cartSendError");
		}
	} catch (e) {
		banner.value = e?.message || t("cartSendError");
	} finally {
		sending.value = false;
	}
}

async function toggleTorch() {
	await camera.toggleTorch();
}

async function onDisconnect() {
	if (disconnecting.value) return;
	if (typeof window !== "undefined" && !window.confirm(t("confirmDisconnect"))) return;
	disconnecting.value = true;
	banner.value = t("disconnecting");
	teardownCamera();
	try {
		await disconnectSelf();
	} catch (e) {
		console.warn("[work] disconnect", e?.message || e);
	} finally {
		disconnecting.value = false;
		emit("disconnected");
	}
}
</script>

<template>
	<section class="work" :class="{ 'work--manual': manualMode }">
		<div class="scanner">
			<template v-if="!manualMode">
				<video
					ref="videoRef"
					class="preview"
					:class="{ 'preview--live': camera.ready.value }"
					playsinline
					muted
					autoplay
					:poster="CAMERA_BLACK_POSTER"
				/>
				<Reticle v-if="camera.ready.value" />
				<div class="scanner__bar">
					<button
						type="button"
						class="capture"
						:disabled="scanner.ocrBusy.value || scanner.lookingUp.value || !camera.ready.value"
						@click="onCapture"
					>
						{{ t("capture") }}
					</button>
					<button type="button" class="manual" @click="openManual">{{ t("manual") }}</button>
					<button
						type="button"
						class="torch"
						:disabled="!camera.torchSupported.value"
						:aria-pressed="camera.torchOn.value"
						@click="toggleTorch"
					>
						{{ camera.torchOn.value ? t("torchOn") : t("torch") }}
					</button>
				</div>
				<p v-if="statusHint" class="hud">{{ statusHint }}</p>
			</template>
			<ManualKeypad v-else @select="onManualSelect" @close="backFromManual" />
		</div>

		<div class="ops">
			<p v-if="banner" class="banner" role="status">{{ banner }}</p>

			<MatchPicker
				v-if="scanner.pendingChoice.value"
				:candidates="scanner.pendingChoice.value.candidates"
				:kind="scanner.pendingChoice.value.kind"
				:raw-text="scanner.pendingChoice.value.rawText || ''"
				@choose="scanner.chooseCandidate"
				@cancel="scanner.dismiss"
			/>

			<ItemAddCard
				v-else-if="scanner.result.value"
				:result="scanner.result.value"
				@add="onAdd"
				@dismiss="onDismissItem"
			/>

			<CartPanel
				v-else
				:lines="cart.lines"
				:sending="sending"
				@update-qty="onUpdateQty"
				@remove="onRemove"
				@send="onSend"
			/>
		</div>

		<footer class="foot">
			<button type="button" class="ghost" @click="emit('settings')">{{ t("settings") }}</button>
			<button
				type="button"
				class="ghost"
				:disabled="disconnecting"
				@click="onDisconnect"
			>
				{{ t("disconnect") }}
			</button>
		</footer>
	</section>
</template>

<style scoped>
.work {
	height: 100%;
	display: grid;
	grid-template-rows: minmax(32%, 38%) 1fr auto;
	min-height: 0;
}

.work--manual {
	grid-template-rows: minmax(52%, 58%) 1fr auto;
}

.scanner {
	position: relative;
	min-height: 0;
	background: #000;
	overflow: hidden;
}

.preview {
	width: 100%;
	height: 100%;
	object-fit: cover;
	background: #000;
	/* Hide empty <video> chrome (Android WebView broken-file icon) until live. */
	opacity: 0;
	visibility: hidden;
}

.preview--live {
	opacity: 1;
	visibility: visible;
}

.scanner__bar {
	position: absolute;
	left: 0.55rem;
	right: 0.55rem;
	bottom: 0.55rem;
	display: grid;
	grid-template-columns: 1fr 1fr 1fr;
	gap: 0.4rem;
	z-index: 3;
}

.capture,
.manual,
.torch {
	width: 100%;
	border: 0;
	border-radius: 999px;
	padding: 0.7rem 0.35rem;
	font-weight: 700;
	font-size: 0.85rem;
	min-width: 0;
}

.capture {
	background: var(--accent);
	color: var(--accent-fg);
}

.manual,
.torch {
	background: rgba(0, 0, 0, 0.55);
	color: #fff;
	border: 1px solid rgba(255, 255, 255, 0.2);
}

.capture:disabled,
.torch:disabled {
	opacity: 0.55;
}

.hud {
	position: absolute;
	top: 0.5rem;
	left: 0.55rem;
	right: 0.55rem;
	margin: 0;
	padding: 0.25rem 0.5rem;
	border-radius: 999px;
	background: rgba(0, 0, 0, 0.45);
	color: #fff;
	font-size: 0.72rem;
	z-index: 2;
	text-align: center;
}

.ops {
	min-height: 0;
	overflow: auto;
	background: var(--bg);
	display: grid;
	grid-template-rows: auto 1fr;
}

.banner {
	margin: 0;
	padding: 0.45rem 0.85rem;
	background: rgba(245, 158, 11, 0.15);
	color: var(--warn);
	font-size: 0.85rem;
	font-weight: 600;
}

.foot {
	display: flex;
	gap: 0.5rem;
	align-items: center;
	min-height: 3.25rem;
	padding: 0.55rem 0.75rem max(0.55rem, env(safe-area-inset-bottom));
	border-top: 1px solid var(--border);
	background: var(--bg-elevated);
}

.ghost {
	flex: 1;
	border: 0;
	background: transparent;
	color: var(--muted);
	font-weight: 600;
	padding: 0.65rem;
}

.ghost:disabled {
	opacity: 0.55;
}
</style>
