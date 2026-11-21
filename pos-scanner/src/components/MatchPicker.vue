<script setup>
defineProps({
	candidates: { type: Array, required: true },
	kind: { type: String, default: "barcode" },
	rawText: { type: String, default: "" },
});
const emit = defineEmits(["choose", "cancel"]);
</script>

<template>
	<div class="picker" role="dialog" aria-modal="true" aria-labelledby="picker-title">
		<h2 id="picker-title">
			{{ kind === "ocr" ? "Несколько артикулов" : "Несколько кодов" }}
		</h2>
		<p class="picker__hint">
			Выберите нужный — автоматический выбор отключён (A05).
		</p>
		<ul>
			<li v-for="(c, i) in candidates" :key="`${c.value}-${i}`">
				<button type="button" @click="emit('choose', c)">
					<span class="code">{{ c.value }}</span>
					<span class="meta">{{ c.format }} · {{ c.engine }}</span>
				</button>
			</li>
		</ul>
		<p v-if="rawText" class="raw">OCR: {{ rawText.slice(0, 160) }}</p>
		<button type="button" class="cancel" @click="emit('cancel')">Отмена</button>
	</div>
</template>

<style scoped>
.picker {
	background: var(--bg-elevated);
	border-radius: 16px 16px 0 0;
	padding: 1.1rem 1rem 1.25rem;
	border-top: 1px solid rgba(255, 255, 255, 0.08);
}

h2 {
	margin: 0 0 0.35rem;
	font-size: 1.1rem;
}

.picker__hint,
.raw {
	margin: 0 0 0.85rem;
	color: var(--muted);
	font-size: 0.85rem;
}

ul {
	list-style: none;
	margin: 0;
	padding: 0;
	display: grid;
	gap: 0.5rem;
}

button {
	width: 100%;
	text-align: left;
	background: #0a1020;
	border: 1px solid rgba(94, 234, 212, 0.25);
	border-radius: 12px;
	color: var(--fg);
	padding: 0.75rem 0.9rem;
	display: grid;
	gap: 0.2rem;
}

.code {
	font-family: var(--mono);
	font-size: 1.05rem;
}

.meta {
	color: var(--muted);
	font-size: 0.78rem;
}

.cancel {
	margin-top: 0.75rem;
	background: transparent;
	border: 0;
	color: var(--muted);
	padding: 0.6rem;
}
</style>
