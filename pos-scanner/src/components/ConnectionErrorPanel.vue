<script setup>
import { computed } from "vue";
import { t } from "@/lib/i18n.js";

defineProps({
	result: { type: Object, required: true },
});
defineEmits(["settings", "retry"]);

const labels = computed(() => ({
	retry: t("retry"),
	settings: t("openSettings"),
}));
</script>

<template>
	<section class="gate" role="alert" aria-labelledby="conn-title">
		<p class="brand">{{ t("appName") }}</p>
		<h1 id="conn-title">{{ result.title || t("connectionError") }}</h1>
		<p class="desc">{{ result.description }}</p>
		<p v-if="result.url" class="url mono">{{ result.url }}</p>
		<ol v-if="result.steps?.length">
			<li v-for="(step, i) in result.steps" :key="i">{{ step }}</li>
		</ol>
		<div class="actions">
			<button type="button" class="primary" @click="$emit('retry')">{{ labels.retry }}</button>
			<button type="button" class="secondary" @click="$emit('settings')">
				{{ labels.settings }}
			</button>
		</div>
	</section>
</template>

<style scoped>
.gate {
	height: 100%;
	display: grid;
	align-content: center;
	gap: 0.65rem;
	padding: 1.5rem 1.25rem;
	padding-bottom: max(1.5rem, env(safe-area-inset-bottom));
}

.brand {
	margin: 0;
	font-weight: 700;
	letter-spacing: 0.02em;
}

h1 {
	margin: 0;
	font-size: 1.35rem;
}

.desc {
	margin: 0;
	color: var(--muted);
	line-height: 1.45;
}

.url {
	margin: 0;
	color: var(--accent);
	font-size: 0.8rem;
	word-break: break-all;
}

.mono {
	font-family: var(--mono);
}

ol {
	margin: 0;
	padding-left: 1.2rem;
	color: var(--muted);
	line-height: 1.45;
}

.actions {
	display: grid;
	gap: 0.5rem;
	margin-top: 0.5rem;
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
</style>
