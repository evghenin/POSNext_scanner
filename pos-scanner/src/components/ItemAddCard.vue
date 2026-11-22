<script setup>
import { computed, ref, watch } from "vue";
import { t } from "@/lib/i18n.js";

const props = defineProps({
	/** Scanner result with lookup.item */
	result: { type: Object, required: true },
});
const emit = defineEmits(["add", "dismiss"]);

const item = computed(() => props.result?.lookup?.item || null);
const uomDetails = computed(() => {
	const details = item.value?.uom_details;
	if (Array.isArray(details) && details.length) return details;
	const list = item.value?.uoms?.length
		? item.value.uoms
		: item.value?.uom
			? [item.value.uom]
			: ["Nos"];
	return list.map((u) => ({ uom: u, conversion_factor: 1 }));
});
const showUomPicker = computed(() => uomDetails.value.length > 1);

const qty = ref(1);
const uom = ref("Nos");

watch(
	() => props.result,
	(r) => {
		qty.value = Number(r?.qty) > 0 ? Number(r.qty) : 1;
		uom.value = r?.uom || item.value?.uom || uomDetails.value[0]?.uom || "Nos";
	},
	{ immediate: true }
);

const priceLabel = computed(() => {
	const rate = item.value?.rate;
	if (rate == null || Number.isNaN(Number(rate))) return null;
	return Number(rate).toFixed(2);
});

const selectedFactor = computed(() => {
	const row = uomDetails.value.find((u) => u.uom === uom.value);
	return row?.conversion_factor || 1;
});

function onAdd() {
	const q = Number(qty.value);
	emit("add", {
		qty: Number.isFinite(q) && q > 0 ? q : 1,
		uom: uom.value || uomDetails.value[0]?.uom || "Nos",
		conversion_factor: selectedFactor.value,
	});
}
</script>

<template>
	<div class="card" v-if="item">
		<div class="hero" :class="{ 'hero--photo': Boolean(item.image) }">
			<img
				v-if="item.image"
				class="photo"
				:src="item.image"
				:alt="item.item_name || item.item_code"
			/>
			<div>
				<h2>{{ item.item_name || item.item_code }}</h2>
				<p class="meta mono">{{ item.item_code }}</p>
				<p v-if="priceLabel != null" class="price">
					{{ priceLabel }}{{ item.currency ? ` ${item.currency}` : "" }}
					<span class="per">/ 1 {{ item.stock_uom || item.uom || "Nos" }}</span>
				</p>
			</div>
		</div>

		<label class="field">
			<span>{{ t("qty") }}</span>
			<input v-model.number="qty" type="number" min="0.001" step="any" inputmode="decimal" />
		</label>

		<div v-if="showUomPicker" class="uoms">
			<span class="field-label">{{ t("uom") }}</span>
			<div class="uom-row">
				<button
					v-for="u in uomDetails"
					:key="u.uom"
					type="button"
					class="uom-btn"
					:class="{ active: uom === u.uom }"
					@click="uom = u.uom"
				>
					{{ u.uom }}
					<small v-if="u.conversion_factor > 1">
						· {{ u.conversion_factor }} {{ item.stock_uom || "pcs" }}
					</small>
				</button>
			</div>
		</div>
		<p v-else class="meta">{{ t("uom") }}: {{ uom }}</p>

		<div class="actions">
			<button type="button" class="primary" @click="onAdd">{{ t("addToCart") }}</button>
			<button type="button" class="ghost" @click="emit('dismiss')">{{ t("cancel") }}</button>
		</div>
	</div>
</template>

<style scoped>
.card {
	padding: 0.75rem 0.85rem;
	border-bottom: 1px solid var(--border);
	background: var(--bg-elevated);
}

.hero {
	display: grid;
	grid-template-columns: 1fr;
	gap: 0.65rem;
	margin-bottom: 0.55rem;
}

.hero--photo {
	grid-template-columns: 72px 1fr;
}

.photo {
	width: 72px;
	height: 72px;
	object-fit: cover;
	border-radius: 10px;
	background: rgba(127, 127, 127, 0.12);
}

h2 {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 650;
}

.meta {
	margin: 0.15rem 0 0;
	color: var(--muted);
	font-size: 0.82rem;
}

.mono {
	font-family: var(--mono);
}

.price {
	margin: 0.35rem 0 0;
	font-size: 1.15rem;
	font-weight: 700;
	color: var(--ok);
}

.per {
	font-size: 0.75rem;
	font-weight: 500;
	color: var(--muted);
}

.field {
	display: grid;
	gap: 0.3rem;
	margin-bottom: 0.55rem;
	font-size: 0.8rem;
	color: var(--muted);
}

.field input {
	border: 1px solid var(--border);
	border-radius: 10px;
	padding: 0.65rem 0.75rem;
	background: var(--input-bg);
	color: inherit;
	font-size: 1.05rem;
}

.field-label {
	display: block;
	font-size: 0.8rem;
	color: var(--muted);
	margin-bottom: 0.35rem;
}

.uom-row {
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem;
	margin-bottom: 0.55rem;
}

.uom-btn {
	border: 1px solid var(--border);
	border-radius: 10px;
	padding: 0.55rem 0.7rem;
	background: transparent;
	color: var(--fg);
	font-weight: 600;
}

.uom-btn.active {
	background: var(--accent-dim);
	border-color: var(--accent);
	color: var(--accent);
}

.uom-btn small {
	display: block;
	font-weight: 500;
	opacity: 0.8;
	font-size: 0.7rem;
}

.actions {
	display: grid;
	grid-template-columns: 1fr auto;
	gap: 0.45rem;
}

button {
	border: 0;
	border-radius: 12px;
	padding: 0.75rem 0.9rem;
	font-weight: 650;
}

.primary {
	background: var(--accent);
	color: var(--accent-fg);
}

.ghost {
	background: transparent;
	color: var(--muted);
}
</style>
