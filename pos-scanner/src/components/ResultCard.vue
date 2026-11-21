<script setup>
defineProps({
	result: { type: Object, required: true },
});
const emit = defineEmits(["add", "dismiss"]);
</script>

<template>
	<div class="card" role="dialog" aria-modal="true">
		<div class="badge" :data-source="result.source">
			{{ result.source === "ocr" ? "OCR" : result.source === "manual" ? "Ручной" : "Штрихкод" }}
			· {{ result.format }}
		</div>
		<p class="code">{{ result.value }}</p>
		<template v-if="result.lookup?.item">
			<h2>{{ result.lookup.item.item_name }}</h2>
			<p class="meta">
				{{ result.lookup.item.item_code }}
				<span v-if="result.lookup.item.uom"> · {{ result.lookup.item.uom }}</span>
				<span v-if="result.lookup.item.rate != null">
					· {{ Number(result.lookup.item.rate).toFixed(2) }}</span
				>
			</p>
			<p v-if="result.lookup.item.unknown" class="warn">
				Демо-каталог не знает этот код — проверка распознавания всё равно успешна.
			</p>
		</template>
		<div class="actions">
			<button
				v-if="!result.added"
				type="button"
				class="primary"
				@click="emit('add')"
			>
				Добавить (демо)
			</button>
			<p v-else class="ok">Добавлено локально · без отправки на кассу</p>
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
	font-size: 1.25rem;
	margin: 0 0 0.35rem;
}

h2 {
	margin: 0 0 0.25rem;
	font-size: 1.15rem;
	font-weight: 650;
}

.meta,
.warn,
.ok {
	margin: 0 0 0.75rem;
	color: var(--muted);
	font-size: 0.9rem;
}

.warn {
	color: var(--warn);
}

.ok {
	color: var(--ok);
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
	color: #04201b;
}

.ghost {
	background: transparent;
	color: var(--muted);
}
</style>
