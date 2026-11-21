<script setup>
import { ref } from "vue";

const emit = defineEmits(["submit", "close"]);
const value = ref("");

function onSubmit() {
	const v = value.value.trim();
	if (!v) return;
	emit("submit", v);
	value.value = "";
}
</script>

<template>
	<form class="manual" @submit.prevent="onSubmit">
		<label class="manual__label" for="manual-code">Ручной ввод кода / артикула</label>
		<div class="manual__row">
			<input
				id="manual-code"
				v-model="value"
				type="text"
				autocomplete="off"
				autocapitalize="characters"
				spellcheck="false"
				placeholder="SKU00673 или штрихкод"
			/>
			<button type="submit" class="btn primary">Найти</button>
			<button type="button" class="btn ghost" @click="emit('close')">✕</button>
		</div>
	</form>
</template>

<style scoped>
.manual {
	background: var(--bg-elevated);
	border-radius: 14px 14px 0 0;
	padding: 0.9rem 1rem 1.1rem;
	border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.manual__label {
	display: block;
	font-size: 0.8rem;
	color: var(--muted);
	margin-bottom: 0.45rem;
}

.manual__row {
	display: flex;
	gap: 0.5rem;
}

input {
	flex: 1;
	min-width: 0;
	background: #0a1020;
	border: 1px solid rgba(148, 163, 184, 0.35);
	border-radius: 10px;
	color: var(--fg);
	padding: 0.7rem 0.8rem;
}

.btn {
	border: 0;
	border-radius: 10px;
	padding: 0.7rem 0.9rem;
	font-weight: 600;
}

.btn.primary {
	background: var(--accent);
	color: #04201b;
}

.btn.ghost {
	background: transparent;
	color: var(--muted);
}
</style>
