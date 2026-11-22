<script setup>
import { computed, reactive, ref, watch } from "vue";
import { setLanguage, t } from "@/lib/i18n.js";
import {
	DEFAULT_API_ORIGIN,
	loadSettings,
	saveSettings,
	validateSettingsPatch,
} from "@/lib/settings.js";
import { applyNativeServerConfig, isAndroidDemoShell, isOfflineBundledUi } from "@/lib/shellBridge.js";
import { applyTheme } from "@/lib/theme.js";

const props = defineProps({
	modelValue: { type: Boolean, default: false },
	/** First-run / blocking: no dismiss without save */
	blocking: { type: Boolean, default: false },
});
const emit = defineEmits(["update:modelValue", "saved"]);

const draft = reactive({ ...loadSettings() });
const error = ref("");
const inApk = isAndroidDemoShell();
const offlineUi = isOfflineBundledUi();

const labels = computed(() => {
	void draft.language;
	return {
		title: t("settings"),
		close: t("close"),
		save: t("save"),
		serverUrl: t("serverUrl"),
		hint: t("serverUrlHint"),
		placeholder: t("serverUrlPlaceholder"),
		language: t("language"),
		theme: t("theme"),
		langEn: t("langEn"),
		langRo: t("langRo"),
		langRu: t("langRu"),
		themeSystem: t("themeSystem"),
		themeDark: t("themeDark"),
		themeLight: t("themeLight"),
		apiUser: t("apiUser"),
		apiPassword: t("apiPassword"),
		apiKey: t("apiKey"),
		apiSecret: t("apiSecret"),
		apiAuthHint: t("apiAuthHint"),
	};
});

watch(
	() => props.modelValue,
	(open) => {
		if (open) {
			Object.assign(draft, loadSettings());
			error.value = "";
		}
	},
	{ immediate: true }
);

watch(
	() => [draft.language, draft.theme],
	() => {
		setLanguage(draft.language);
		applyTheme(draft.theme);
	}
);

function close() {
	if (props.blocking) return;
	emit("update:modelValue", false);
}

function onSave() {
	error.value = "";
	const result = validateSettingsPatch({ ...draft }, { t });
	if (!result.ok) {
		error.value = result.error;
		return;
	}
	const next = saveSettings(result.settings);
	Object.assign(draft, next);
	if (inApk || offlineUi) {
		const applied = applyNativeServerConfig(next.serverUrl, "");
		if (!applied && inApk) {
			error.value = t("bridgeError");
			return;
		}
	}
	emit("saved", next);
}
</script>

<template>
	<aside
		v-if="modelValue"
		class="settings"
		:class="{ 'settings--blocking': blocking }"
		role="dialog"
		aria-modal="true"
		@click.self="close"
	>
		<div class="settings__panel">
			<header class="settings__head">
				<h2>{{ labels.title }}</h2>
				<button v-if="!blocking" type="button" class="ghost" @click="close">
					{{ labels.close }}
				</button>
			</header>

			<p class="hint">{{ labels.hint }}</p>

			<label class="field">
				<span>{{ labels.serverUrl }}</span>
				<input
					v-model="draft.serverUrl"
					type="url"
					inputmode="url"
					autocomplete="url"
					:placeholder="labels.placeholder || DEFAULT_API_ORIGIN"
				/>
			</label>

			<label class="field">
				<span>{{ labels.language }}</span>
				<select v-model="draft.language">
					<option value="en">{{ labels.langEn }}</option>
					<option value="ro">{{ labels.langRo }}</option>
					<option value="ru">{{ labels.langRu }}</option>
				</select>
			</label>

			<label class="field">
				<span>{{ labels.theme }}</span>
				<select v-model="draft.theme">
					<option value="system">{{ labels.themeSystem }}</option>
					<option value="dark">{{ labels.themeDark }}</option>
					<option value="light">{{ labels.themeLight }}</option>
				</select>
			</label>

			<p class="hint">{{ labels.apiAuthHint }}</p>
			<label class="field">
				<span>{{ labels.apiUser }}</span>
				<input v-model="draft.apiUser" type="text" autocomplete="username" />
			</label>
			<label class="field">
				<span>{{ labels.apiPassword }}</span>
				<input v-model="draft.apiPassword" type="password" autocomplete="current-password" />
			</label>
			<label class="field">
				<span>{{ labels.apiKey }}</span>
				<input v-model="draft.apiKey" type="text" autocomplete="off" />
			</label>
			<label class="field">
				<span>{{ labels.apiSecret }}</span>
				<input v-model="draft.apiSecret" type="password" autocomplete="off" />
			</label>

			<p v-if="error" class="err">{{ error }}</p>

			<div class="actions">
				<button type="button" class="primary" @click="onSave">{{ labels.save }}</button>
			</div>
		</div>
	</aside>
</template>

<style scoped>
.settings {
	position: absolute;
	inset: 0;
	background: rgba(0, 0, 0, 0.55);
	z-index: 9;
	display: grid;
	align-items: end;
}

.settings--blocking {
	background: var(--bg);
	align-items: stretch;
}

.settings--blocking .settings__panel {
	border-radius: 0;
	max-height: none;
	height: 100%;
	border-top: 0;
}

.settings__panel {
	background: var(--bg-elevated);
	border-radius: 16px 16px 0 0;
	padding: 1.1rem 1rem 1.4rem;
	max-height: 88vh;
	overflow: auto;
	border-top: 1px solid var(--border);
}

.settings__head {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 0.75rem;
}

.settings__head h2 {
	margin: 0;
	font-size: 1.15rem;
}

.hint {
	margin: 0 0 0.9rem;
	color: var(--muted);
	font-size: 0.82rem;
	line-height: 1.4;
}

.field {
	display: grid;
	gap: 0.35rem;
	margin-bottom: 0.75rem;
	border: 0;
	padding: 0;
}

.field span {
	font-size: 0.8rem;
	color: var(--muted);
}

input[type="url"],
input[type="text"],
input[type="password"],
select {
	background: var(--input-bg);
	border: 1px solid var(--border);
	border-radius: 10px;
	color: var(--fg);
	padding: 0.7rem 0.8rem;
	font: inherit;
}

.err {
	color: var(--danger);
	font-size: 0.9rem;
}

.actions {
	margin-top: 0.75rem;
}

.primary,
.ghost {
	border: 0;
	border-radius: 12px;
	padding: 0.85rem 1rem;
	font-weight: 650;
}

.primary {
	width: 100%;
	background: var(--accent);
	color: var(--accent-fg);
}

.ghost {
	background: transparent;
	color: var(--muted);
}
</style>
