<script setup>
import { computed, ref } from "vue";
import { t } from "@/lib/i18n.js";

const props = defineProps({
	lines: { type: Array, default: () => [] },
	sending: { type: Boolean, default: false },
});
const emit = defineEmits(["update-qty", "remove", "send"]);

const confirmOpen = ref(false);

const totalLines = computed(() => props.lines.length);

function askSend() {
	if (!props.lines.length || props.sending) return;
	confirmOpen.value = true;
}

function confirmSend() {
	confirmOpen.value = false;
	emit("send");
}
</script>

<template>
	<div class="cart">
		<header class="cart__head">
			<h3>{{ t("cart") }}</h3>
			<span class="count">{{ totalLines }}</span>
		</header>

		<p v-if="!lines.length" class="empty">{{ t("cartEmpty") }}</p>

		<ul v-else class="list">
			<li v-for="line in lines" :key="line.id" class="line">
				<div class="line__main">
					<p class="name">{{ line.item_name }}</p>
					<p class="meta mono">{{ line.item_code }} · {{ line.uom }}</p>
				</div>
				<input
					class="qty"
					type="number"
					min="0.001"
					step="any"
					:value="line.qty"
					:disabled="sending"
					@change="emit('update-qty', line.id, Number($event.target.value))"
				/>
				<button
					type="button"
					class="rm"
					:disabled="sending"
					:title="t('remove')"
					@click="emit('remove', line.id)"
				>
					×
				</button>
			</li>
		</ul>

		<button
			type="button"
			class="send"
			:disabled="!lines.length || sending"
			@click="askSend"
		>
			{{ sending ? t("sendingCart") : t("sendCart") }}
		</button>

		<div v-if="confirmOpen" class="confirm" role="dialog" aria-modal="true">
			<p>{{ t("confirmSendCart") }}</p>
			<div class="confirm__actions">
				<button type="button" class="primary" @click="confirmSend">{{ t("sendCart") }}</button>
				<button type="button" class="ghost" @click="confirmOpen = false">{{ t("cancel") }}</button>
			</div>
		</div>
	</div>
</template>

<style scoped>
.cart {
	display: grid;
	grid-template-rows: auto 1fr auto;
	min-height: 0;
	height: 100%;
	padding: 0.65rem 0.85rem 0.85rem;
	position: relative;
}

.cart__head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 0.4rem;
}

h3 {
	margin: 0;
	font-size: 0.95rem;
}

.count {
	font-size: 0.75rem;
	color: var(--muted);
	background: rgba(127, 127, 127, 0.12);
	padding: 0.15rem 0.45rem;
	border-radius: 999px;
}

.empty {
	margin: 0.5rem 0;
	color: var(--muted);
	font-size: 0.9rem;
}

.list {
	list-style: none;
	margin: 0;
	padding: 0;
	overflow: auto;
	min-height: 0;
}

.line {
	display: grid;
	grid-template-columns: 1fr 4.2rem 2.2rem;
	gap: 0.35rem;
	align-items: center;
	padding: 0.45rem 0;
	border-bottom: 1px solid var(--border);
}

.name {
	margin: 0;
	font-weight: 600;
	font-size: 0.9rem;
}

.meta {
	margin: 0.1rem 0 0;
	color: var(--muted);
	font-size: 0.72rem;
}

.mono {
	font-family: var(--mono);
}

.qty {
	border: 1px solid var(--border);
	border-radius: 8px;
	padding: 0.4rem;
	background: var(--input-bg);
	color: inherit;
	width: 100%;
}

.rm {
	border: 0;
	background: transparent;
	color: var(--danger);
	font-size: 1.25rem;
	line-height: 1;
	padding: 0.25rem;
}

.send {
	margin-top: 0.55rem;
	border: 0;
	border-radius: 12px;
	padding: 0.85rem 1rem;
	font-weight: 700;
	background: var(--accent);
	color: var(--accent-fg);
}

.send:disabled {
	opacity: 0.5;
}

.confirm {
	position: absolute;
	inset: auto 0.5rem 3.5rem;
	background: var(--bg-elevated);
	border: 1px solid var(--border);
	border-radius: 14px;
	padding: 0.9rem;
	box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}

.confirm p {
	margin: 0 0 0.65rem;
	font-size: 0.95rem;
}

.confirm__actions {
	display: grid;
	gap: 0.4rem;
}

.primary {
	border: 0;
	border-radius: 10px;
	padding: 0.7rem;
	background: var(--accent);
	color: var(--accent-fg);
	font-weight: 650;
}

.ghost {
	border: 0;
	border-radius: 10px;
	padding: 0.7rem;
	background: transparent;
	color: var(--muted);
	font-weight: 650;
}
</style>
