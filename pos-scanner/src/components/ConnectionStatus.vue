<script setup>
import { computed } from "vue";
import { t } from "@/lib/i18n.js";

const props = defineProps({
	/** @type {import('vue').PropType<'saving' | 'probing' | 'connected'>} */
	phase: { type: String, required: true },
	serverUrl: { type: String, default: "" },
});
defineEmits(["start", "settings"]);

const title = computed(() => {
	if (props.phase === "connected") return t("connected");
	if (props.phase === "saving") return t("settingsSaved");
	return t("checkingConnection");
});

const statusLine = computed(() => {
	if (props.phase === "connected") return t("connectedHint");
	if (props.phase === "saving") return t("checkingConnection");
	return "";
});
</script>

<template>
	<section class="gate" aria-live="polite">
		<p class="brand">{{ t("appName") }}</p>
		<h1>{{ title }}</h1>
		<p v-if="statusLine" class="status" :data-phase="phase">{{ statusLine }}</p>
		<p v-if="serverUrl" class="url mono">{{ serverUrl }}</p>
		<div v-if="phase === 'connected'" class="actions">
			<button type="button" class="primary" @click="$emit('start')">{{ t("startWork") }}</button>
			<button type="button" class="secondary" @click="$emit('settings')">
				{{ t("openSettings") }}
			</button>
		</div>
		<p v-else class="pulse" aria-hidden="true">···</p>
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
}

h1 {
	margin: 0;
	font-size: 1.45rem;
}

.status {
	margin: 0;
	color: var(--muted);
	line-height: 1.45;
}

.status[data-phase="connected"] {
	color: var(--ok);
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

.pulse {
	margin: 0.5rem 0 0;
	letter-spacing: 0.35em;
	color: var(--muted);
	animation: blink 1.2s ease-in-out infinite;
}

@keyframes blink {
	0%,
	100% {
		opacity: 0.35;
	}
	50% {
		opacity: 1;
	}
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
