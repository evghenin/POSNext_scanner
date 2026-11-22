<script setup>
defineProps({
	result: { type: Object, required: true },
});
defineEmits(["settings", "retry", "dismiss"]);
</script>

<template>
	<aside class="conn" role="dialog" aria-modal="true" aria-labelledby="conn-title">
		<div class="conn__panel">
			<h2 id="conn-title">{{ result.title }}</h2>
			<p class="desc">{{ result.description }}</p>
			<p v-if="result.url" class="url mono">{{ result.url }}</p>
			<ol v-if="result.steps?.length">
				<li v-for="(step, i) in result.steps" :key="i">{{ step }}</li>
			</ol>
			<div class="actions">
				<button type="button" class="primary" @click="$emit('retry')">Повторить</button>
				<button type="button" class="secondary" @click="$emit('settings')">
					Изменить настройки
				</button>
				<button type="button" class="ghost" @click="$emit('dismiss')">Закрыть</button>
			</div>
		</div>
	</aside>
</template>

<style scoped>
.conn {
	position: absolute;
	inset: 0;
	z-index: 10;
	background: rgba(0, 0, 0, 0.6);
	display: grid;
	align-items: end;
}

.conn__panel {
	background: var(--bg-elevated);
	border-radius: 16px 16px 0 0;
	padding: 1.15rem 1rem 1.4rem;
	border-top: 1px solid rgba(255, 255, 255, 0.08);
	max-height: 88vh;
	overflow: auto;
}

h2 {
	margin: 0 0 0.5rem;
	font-size: 1.15rem;
}

.desc {
	margin: 0 0 0.65rem;
	color: var(--muted);
	line-height: 1.45;
}

.url {
	margin: 0 0 0.75rem;
	color: var(--accent);
	font-size: 0.8rem;
	word-break: break-all;
}

.mono {
	font-family: var(--mono);
}

ol {
	margin: 0 0 1rem;
	padding-left: 1.2rem;
	color: var(--muted);
	line-height: 1.45;
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

.secondary {
	background: transparent;
	color: var(--fg);
	border: 1px solid rgba(255, 255, 255, 0.2);
}

.ghost {
	background: transparent;
	color: var(--muted);
}
</style>
