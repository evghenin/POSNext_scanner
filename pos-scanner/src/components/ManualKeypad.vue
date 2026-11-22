<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { LOOKUP_ITEM_METHOD, lookupItem } from "@/lib/itemLookup.js";
import {
	MANUAL_PREFIXES,
	backspaceManualDigit,
	clearManualDigits,
	createManualCodeState,
	enterManualDigit,
	formatManualCode,
	setManualPrefix,
} from "@/lib/manualCode.js";
import { t } from "@/lib/i18n.js";

const emit = defineEmits(["select", "close"]);

const state = ref(createManualCodeState());
const lookup = ref(null);
const looking = ref(false);
const code = computed(() => formatManualCode(state.value));

const found = computed(() => {
	const item = lookup.value?.item;
	if (!lookup.value?.found || !item) return false;
	const rate = item.rate;
	return rate != null && Number.isFinite(Number(rate));
});

let debounceTimer = 0;
let lookupGen = 0;

watch(
	code,
	(value) => {
		lookup.value = null;
		looking.value = true;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = window.setTimeout(() => runLookup(value), 280);
	},
	{ immediate: true }
);

onBeforeUnmount(() => {
	if (debounceTimer) clearTimeout(debounceTimer);
	lookupGen += 1;
});

async function runLookup(value) {
	const gen = ++lookupGen;
	looking.value = true;
	try {
		const result = await lookupItem(value);
		if (gen !== lookupGen) return;
		lookup.value = result;
	} catch {
		if (gen !== lookupGen) return;
		lookup.value = { found: false, item: null, query: value, source: "local" };
	} finally {
		if (gen === lookupGen) looking.value = false;
	}
}

function onPrefix(p) {
	state.value = setManualPrefix(state.value, p);
}

function onDigit(d) {
	state.value = enterManualDigit(state.value, d);
}

function onClear() {
	state.value = clearManualDigits(state.value);
}

function onBackspace() {
	state.value = backspaceManualDigit(state.value);
}

function onTapCode() {
	if (!found.value) return;
	emit("select", { code: code.value, lookup: lookup.value });
}

const statusText = computed(() => {
	if (looking.value) return t("lookingUp");
	if (found.value) return t("manualFoundTap");
	if (lookup.value?.error === "lookup_api_missing") {
		return t("lookupApiMissing", { method: LOOKUP_ITEM_METHOD });
	}
	if (lookup.value?.error === "not_connected") return t("pairAgainKeepCart");
	if (lookup.value?.error === "not_for_sale") return t("itemNotForSale");
	if (lookup.value && !lookup.value.found) return t("itemMissing");
	if (lookup.value?.item && (lookup.value.item.rate == null || !Number.isFinite(Number(lookup.value.item.rate)))) {
		return t("itemNoPrice");
	}
	return t("manualEnterCode");
});
</script>

<template>
	<div class="keypad">
		<button
			type="button"
			class="code"
			:class="{ 'code--found': found, 'code--busy': looking }"
			:disabled="!found"
			:aria-disabled="!found"
			@click="onTapCode"
		>
			{{ code }}
		</button>
		<p class="status">{{ statusText }}</p>

		<div class="grid" role="group" :aria-label="t('manual')">
			<button
				v-for="p in MANUAL_PREFIXES"
				:key="p"
				type="button"
				class="key prefix"
				:class="{ active: state.prefix === p }"
				@click="onPrefix(p)"
			>
				{{ p }}
			</button>

			<button v-for="n in [1, 2, 3, 4, 5, 6, 7, 8, 9]" :key="n" type="button" class="key" @click="onDigit(n)">
				{{ n }}
			</button>

			<button type="button" class="key icon" :title="t('clear')" @click="onClear">
				{{ t("clear") }}
			</button>
			<button type="button" class="key" @click="onDigit(0)">0</button>
			<button type="button" class="key icon" :title="t('backspace')" @click="onBackspace">
				⌫
			</button>
		</div>

		<button type="button" class="close" @click="emit('close')">{{ t("backToCamera") }}</button>
	</div>
</template>

<style scoped>
.keypad {
	height: 100%;
	display: grid;
	grid-template-rows: auto auto 1fr auto;
	gap: 0.45rem;
	padding: 0.55rem 0.65rem 0.65rem;
	background: var(--bg-elevated);
	min-height: 0;
}

.code {
	border: 2px solid var(--border);
	border-radius: 14px;
	padding: 0.85rem 0.75rem;
	font-family: var(--mono);
	font-size: 1.55rem;
	font-weight: 700;
	letter-spacing: 0.06em;
	background: var(--input-bg);
	color: var(--muted);
	text-align: center;
	cursor: default;
}

.code:disabled {
	opacity: 1;
}

.code--busy {
	color: var(--fg);
}

.code--found {
	border-color: var(--ok);
	background: rgba(74, 222, 128, 0.12);
	color: var(--ok);
	cursor: pointer;
}

.status {
	margin: 0;
	text-align: center;
	font-size: 0.78rem;
	color: var(--muted);
	min-height: 1.1em;
}

.grid {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 0.4rem;
	align-content: start;
	min-height: 0;
	overflow: auto;
}

.key {
	border: 1px solid var(--border);
	border-radius: 12px;
	padding: 0.7rem 0.35rem;
	min-height: 2.7rem;
	background: var(--input-bg);
	color: var(--fg);
	font-size: 1.15rem;
	font-weight: 700;
}

.key.prefix {
	font-size: 0.95rem;
	letter-spacing: 0.04em;
}

.key.prefix.active {
	background: var(--accent-dim);
	border-color: var(--accent);
	color: var(--accent);
}

.key.icon {
	font-size: 1rem;
	font-weight: 650;
	color: var(--muted);
}

.close {
	border: 0;
	border-radius: 12px;
	padding: 0.7rem;
	background: transparent;
	color: var(--muted);
	font-weight: 650;
}
</style>
