<script setup>
import { computed, reactive, ref, watch } from "vue";
import {
	WORK_MODE_LABELS,
	buildScannerPageUrl,
	loadSettings,
	saveSettings,
	validateSettingsPatch,
} from "@/lib/settings.js";
import { applyNativeServerConfig, isAndroidDemoShell } from "@/lib/shellBridge.js";

const props = defineProps({
	modelValue: { type: Boolean, default: false },
});
const emit = defineEmits(["update:modelValue", "saved"]);

const draft = reactive({ ...loadSettings() });
const error = ref("");
const savedMsg = ref("");
const inApk = isAndroidDemoShell();

const pageUrlPreview = computed(() =>
	buildScannerPageUrl({ serverUrl: draft.serverUrl, scannerPath: draft.scannerPath })
);

watch(
	() => props.modelValue,
	(open) => {
		if (open) {
			Object.assign(draft, loadSettings());
			error.value = "";
			savedMsg.value = "";
		}
	}
);

function close() {
	emit("update:modelValue", false);
}

function onSave() {
	error.value = "";
	savedMsg.value = "";
	const result = validateSettingsPatch({ ...draft });
	if (!result.ok) {
		error.value = result.error;
		return;
	}
	const next = saveSettings(result.settings);
	Object.assign(draft, next);
	emit("saved", next);

	const target = buildScannerPageUrl(next);
	const originChanged =
		typeof window !== "undefined" &&
		next.serverUrl &&
		window.location.origin !== next.serverUrl;

	if (inApk && target) {
		const applied = applyNativeServerConfig(next.serverUrl, next.scannerPath);
		if (applied) {
			savedMsg.value = "Сохранено — проверка сервера и перезагрузка…";
			return;
		}
		error.value =
			"Мост приложения не ответил. Закройте настройки и нажмите «Открыть сканер» на стартовом экране, либо переустановите APK.";
		return;
	}

	if (originChanged && !inApk) {
		savedMsg.value =
			"Сохранено в браузере. Для смены сайта в TWA нужен другой host при сборке APK + Asset Links.";
	} else {
		savedMsg.value = "Сохранено";
	}
}
</script>

<template>
	<aside v-if="modelValue" class="settings" role="dialog" aria-modal="true" @click.self="close">
		<div class="settings__panel">
			<header class="settings__head">
				<h2>Настройки</h2>
				<button type="button" class="ghost" @click="close">Закрыть</button>
			</header>

			<p v-if="inApk" class="hint apk">
				APK demo: смена URL сервера перезагрузит встроенный WebView без пересборки.
			</p>
			<p v-else class="hint">
				TWA / браузер: URL сохраняется локально для будущих API. Смена origin в TWA требует
				сборки с новым host и Digital Asset Links.
			</p>

			<label class="field">
				<span>URL сервера (HTTPS)</span>
				<input
					v-model="draft.serverUrl"
					type="url"
					inputmode="url"
					autocomplete="url"
					placeholder="https://pos.example.com"
				/>
			</label>

			<label class="field">
				<span>Путь сканера</span>
				<input v-model="draft.scannerPath" type="text" placeholder="/pos-scanner" />
			</label>

			<p v-if="pageUrlPreview" class="preview mono">{{ pageUrlPreview }}</p>

			<fieldset class="field">
				<legend>Режим работы</legend>
				<label class="radio" v-for="(label, key) in WORK_MODE_LABELS" :key="key">
					<input v-model="draft.workMode" type="radio" :value="key" />
					{{ label }}
				</label>
			</fieldset>

			<label class="check">
				<input v-model="draft.soundEnabled" type="checkbox" />
				Звук при распознавании
			</label>
			<label class="check">
				<input v-model="draft.vibrateEnabled" type="checkbox" />
				Вибрация
			</label>
			<label class="check">
				<input v-model="draft.torchDefault" type="checkbox" />
				Включать фонарик при старте камеры (если поддерживается)
			</label>

			<label class="field">
				<span>Язык (заготовка)</span>
				<select v-model="draft.language">
					<option value="ru">Русский</option>
					<option value="ro">Română</option>
					<option value="en">English</option>
				</select>
			</label>

			<p v-if="error" class="err">{{ error }}</p>
			<p v-if="savedMsg" class="ok">{{ savedMsg }}</p>

			<div class="actions">
				<button type="button" class="primary" @click="onSave">Сохранить</button>
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

.settings__panel {
	background: var(--bg-elevated);
	border-radius: 16px 16px 0 0;
	padding: 1.1rem 1rem 1.4rem;
	max-height: 88vh;
	overflow: auto;
	border-top: 1px solid rgba(255, 255, 255, 0.08);
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

.hint.apk {
	color: var(--accent);
}

.field {
	display: grid;
	gap: 0.35rem;
	margin-bottom: 0.75rem;
	border: 0;
	padding: 0;
}

.field span,
.field legend {
	font-size: 0.8rem;
	color: var(--muted);
}

input[type="url"],
input[type="text"],
select {
	background: #0a1020;
	border: 1px solid rgba(148, 163, 184, 0.35);
	border-radius: 10px;
	color: var(--fg);
	padding: 0.7rem 0.8rem;
	font: inherit;
}

.radio,
.check {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	margin: 0.35rem 0;
	font-size: 0.95rem;
}

.preview {
	margin: -0.25rem 0 0.85rem;
	color: var(--accent);
	font-size: 0.8rem;
	word-break: break-all;
}

.mono {
	font-family: var(--mono);
}

.err {
	color: var(--danger);
	font-size: 0.9rem;
}

.ok {
	color: var(--ok);
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
	color: #04201b;
}

.ghost {
	background: transparent;
	color: var(--muted);
}
</style>
