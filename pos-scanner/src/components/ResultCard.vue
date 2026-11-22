<script setup>
import { computed, ref, watch } from "vue";

const props = defineProps({
	result: { type: Object, required: true },
});
const emit = defineEmits(["add", "dismiss"]);

const item = computed(() => props.result?.lookup?.item || null);
const uoms = computed(() => {
	const list = item.value?.uoms;
	if (Array.isArray(list) && list.length) return list;
	if (item.value?.uom) return [item.value.uom];
	return ["Nos"];
});
const showUomPicker = computed(() => uoms.value.length > 1);

const qty = ref(1);
const uom = ref("Nos");

watch(
	() => props.result,
	(r) => {
		qty.value = Number(r?.qty) > 0 ? Number(r.qty) : 1;
		uom.value = r?.uom || item.value?.uom || uoms.value[0] || "Nos";
	},
	{ immediate: true }
);

const priceLabel = computed(() => {
	const rate = item.value?.rate;
	if (rate == null || Number.isNaN(Number(rate))) return null;
	return Number(rate).toFixed(2);
});

function onConfirm() {
	const q = Number(qty.value);
	emit("add", {
		qty: Number.isFinite(q) && q > 0 ? q : 1,
		uom: uom.value || uoms.value[0] || "Nos",
	});
}
</script>

<template>
	<div class="card" role="dialog" aria-modal="true">
		<div class="badge" :data-source="result.source">
			{{ result.source === "ocr" ? "OCR" : result.source === "manual" ? "Ручной" : "Штрихкод" }}
			· {{ result.format }}
		</div>
		<p class="code">{{ result.value }}</p>

		<template v-if="item">
			<div class="hero" :class="{ 'hero--photo': Boolean(item.image) }">
				<img
					v-if="item.image"
					class="photo"
					:src="item.image"
					:alt="item.item_name || item.item_code"
				/>
				<div class="hero__text">
					<h2>{{ item.item_name || item.item_code }}</h2>
					<p class="meta">{{ item.item_code }}</p>
					<p v-if="priceLabel != null" class="price">{{ priceLabel }}</p>
					<p v-else class="meta">Цена появится после pairing</p>
				</div>
			</div>
			<p v-if="item.pending" class="warn">
				Код распознан. Название и цена с кассы появятся после pairing.
			</p>

			<template v-if="!result.added">
				<label class="field">
					<span>Количество</span>
					<input v-model.number="qty" type="number" min="0.001" step="any" inputmode="decimal" />
				</label>
				<label v-if="showUomPicker" class="field">
					<span>Ед. изм.</span>
					<select v-model="uom">
						<option v-for="u in uoms" :key="u" :value="u">{{ u }}</option>
					</select>
				</label>
				<p v-else-if="uom" class="meta uom-one">Ед. изм.: {{ uom }}</p>
			</template>
		</template>

		<div class="actions">
			<button v-if="!result.added" type="button" class="primary" @click="onConfirm">
				Подтвердить
			</button>
			<p v-else class="ok">
				Подтверждено · {{ result.qty }} {{ result.uom }} · отправка в корзину — следующий этап
			</p>
			<button type="button" class="ghost" @click="emit('dismiss')">
				{{ result.added ? "Сканировать дальше" : "Отмена" }}
			</button>
		</div>
	</div>
</template>

<style scoped>
.card {
	background: var(--bg-elevated);
	border-radius: 16px 16px 0 0;
	padding: 1.1rem 1rem 1.3rem;
	border-top: 1px solid rgba(255, 255, 255, 0.08);
	max-height: min(78vh, 640px);
	overflow: auto;
}

.badge {
	display: inline-block;
	font-size: 0.72rem;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	padding: 0.2rem 0.55rem;
	border-radius: 999px;
	background: var(--accent-dim);
	color: var(--accent);
	margin-bottom: 0.45rem;
}

.badge[data-source="ocr"] {
	background: rgba(245, 158, 11, 0.15);
	color: var(--warn);
}

.code {
	font-family: var(--mono);
	font-size: 1.1rem;
	margin: 0 0 0.65rem;
}

.hero {
	display: grid;
	grid-template-columns: 1fr;
	gap: 0.75rem;
	align-items: start;
	margin-bottom: 0.65rem;
}

.hero--photo {
	grid-template-columns: 88px 1fr;
}

.photo {
	width: 88px;
	height: 88px;
	object-fit: cover;
	border-radius: 12px;
	background: rgba(255, 255, 255, 0.06);
}

h2 {
	margin: 0 0 0.2rem;
	font-size: 1.15rem;
	font-weight: 650;
}

.meta,
.warn,
.ok,
.uom-one {
	margin: 0 0 0.55rem;
	color: var(--muted);
	font-size: 0.9rem;
}

.price {
	margin: 0.2rem 0 0;
	font-size: 1.25rem;
	font-weight: 700;
	color: var(--ok, #34d399);
}

.warn {
	color: var(--warn);
}

.ok {
	color: var(--ok);
}

.field {
	display: grid;
	gap: 0.35rem;
	margin-bottom: 0.65rem;
	font-size: 0.85rem;
	color: var(--muted);
}

.field input,
.field select {
	border: 1px solid rgba(255, 255, 255, 0.12);
	border-radius: 12px;
	padding: 0.75rem 0.85rem;
	background: rgba(0, 0, 0, 0.25);
	color: inherit;
	font-size: 1.05rem;
}

.actions {
	display: grid;
	gap: 0.5rem;
	margin-top: 0.35rem;
}

button {
	border: 0;
	border-radius: 12px;
	padding: 0.85rem 1rem;
	font-weight: 650;
}

.primary {
	background: var(--accent);
	color: #04201b;
}

.ghost {
	background: transparent;
	color: var(--muted);
}
</style>
