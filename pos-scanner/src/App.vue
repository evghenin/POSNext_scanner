<script setup>
import { computed, onMounted, ref, watch } from "vue";
import ConnectionErrorPanel from "@/components/ConnectionErrorPanel.vue";
import ConnectionStatus from "@/components/ConnectionStatus.vue";
import PairingScreen from "@/components/PairingScreen.vue";
import SettingsPanel from "@/components/SettingsPanel.vue";
import { probeApiEndpoint } from "@/lib/connectionProbe.js";
import { setLanguage, t } from "@/lib/i18n.js";
import { checkActivePairing, loadPairingSession } from "@/lib/pairing.js";
import { hasSavedSettings, loadSettings } from "@/lib/settings.js";
import { applyTheme } from "@/lib/theme.js";

/**
 * @typedef {'boot' | 'settings' | 'probing' | 'connected' | 'error' | 'checking_pair' | 'pair' | 'paired' | 'work_stub'} GatePhase
 */

const settings = ref(loadSettings());
const showSettings = ref(false);
const settingsBlocking = ref(false);
/** @type {import('vue').Ref<GatePhase>} */
const phase = ref("boot");
const justSaved = ref(false);
const connectionError = ref(null);
const probeGen = ref(0);
const pairingSession = ref(loadPairingSession());
const pairingCheckMsg = ref("");

const statusPhase = computed(() => {
	if (phase.value === "connected") return "connected";
	if (justSaved.value) return "saving";
	return "probing";
});

function applyLocaleAndTheme(s) {
	setLanguage(s.language);
	applyTheme(s.theme);
}

watch(settings, (s) => applyLocaleAndTheme(s), { deep: true, immediate: true });

onMounted(async () => {
	if (!hasSavedSettings()) {
		settingsBlocking.value = true;
		showSettings.value = true;
		phase.value = "settings";
		return;
	}
	settings.value = loadSettings();
	await runProbe({ fromSave: false });
});

/**
 * @param {{ fromSave?: boolean }} [opts]
 */
async function runProbe(opts = {}) {
	const fromSave = Boolean(opts.fromSave);
	justSaved.value = fromSave;
	phase.value = "probing";
	connectionError.value = null;
	const gen = ++probeGen.value;
	try {
		const result = await probeApiEndpoint({ serverUrl: settings.value.serverUrl });
		if (gen !== probeGen.value) return;
		if (!result.ok) {
			connectionError.value = result;
			phase.value = "error";
			justSaved.value = false;
			return;
		}
		connectionError.value = null;
		phase.value = "connected";
		justSaved.value = false;
	} catch (e) {
		if (gen !== probeGen.value) return;
		connectionError.value = {
			ok: false,
			kind: "unknown",
			title: t("probeUnknownTitle"),
			description: e?.message || String(e),
			steps: [t("probeStepCheckUrl"), t("probeStepNetwork"), t("probeStepRetry")],
			status: null,
			url: settings.value.serverUrl,
		};
		phase.value = "error";
		justSaved.value = false;
	}
}

function onSettingsSaved(next) {
	settings.value = next;
	settingsBlocking.value = false;
	showSettings.value = false;
	if (phase.value === "pair" || phase.value === "paired" || phase.value === "work_stub") {
		return;
	}
	runProbe({ fromSave: true });
}

function openSettings() {
	settingsBlocking.value = !hasSavedSettings();
	showSettings.value = true;
}

function closeSettings(open) {
	showSettings.value = open;
	if (!open && !hasSavedSettings()) {
		settingsBlocking.value = true;
		showSettings.value = true;
	}
}

function retryConnection() {
	runProbe({ fromSave: false });
}

/** Connected → Start work: check pairing, else QR screen. */
async function startWorkFromConnected() {
	phase.value = "checking_pair";
	pairingCheckMsg.value = t("checkingPairing");
	try {
		const result = await checkActivePairing();
		if (result.paired) {
			pairingSession.value = result.session;
			phase.value = "paired";
			return;
		}
		phase.value = "pair";
	} catch {
		phase.value = "pair";
	}
}

function onPaired(session) {
	pairingSession.value = session;
	phase.value = "paired";
}

/** Paired → Start work → work stub (layout later). */
function startWorkFromPaired() {
	phase.value = "work_stub";
}

function backToConnected() {
	phase.value = "connected";
}

function openPairAgain() {
	phase.value = "pair";
}
</script>

<template>
	<div class="app">
		<main class="stage">
			<ConnectionStatus
				v-if="phase === 'probing' || phase === 'connected'"
				:phase="statusPhase"
				:server-url="settings.serverUrl"
				@start="startWorkFromConnected"
				@settings="openSettings"
			/>

			<ConnectionErrorPanel
				v-else-if="phase === 'error' && connectionError"
				:result="connectionError"
				@retry="retryConnection"
				@settings="openSettings"
			/>

			<section v-else-if="phase === 'checking_pair'" class="gate">
				<p class="brand">{{ t("appName") }}</p>
				<p class="desc">{{ pairingCheckMsg || t("checkingPairing") }}</p>
			</section>

			<PairingScreen
				v-else-if="phase === 'pair'"
				@paired="onPaired"
				@settings="openSettings"
				@back="backToConnected"
			/>

			<section v-else-if="phase === 'paired'" class="gate">
				<p class="brand">{{ t("appName") }}</p>
				<h1>{{ t("pairedTitle") }}</h1>
				<p class="desc ok">{{ t("pairedBody") }}</p>
				<p v-if="pairingSession?.posProfile" class="meta mono">
					{{ pairingSession.posProfile }}
					<template v-if="pairingSession.sessionInstanceId">
						· {{ pairingSession.sessionInstanceId.slice(0, 8) }}…
					</template>
				</p>
				<div class="actions">
					<button type="button" class="primary" @click="startWorkFromPaired">
						{{ t("startWork") }}
					</button>
					<button type="button" class="secondary" @click="openPairAgain">
						{{ t("pairTitle") }}
					</button>
					<button type="button" class="ghost" @click="openSettings">
						{{ t("openSettings") }}
					</button>
				</div>
			</section>

			<section v-else-if="phase === 'work_stub'" class="gate">
				<p class="brand">{{ t("appName") }}</p>
				<h1>{{ t("workStubTitle") }}</h1>
				<p class="desc">{{ t("workStubBody") }}</p>
				<div class="actions">
					<button type="button" class="primary" @click="backToConnected">
						{{ t("backToConnected") }}
					</button>
					<button type="button" class="secondary" @click="openSettings">
						{{ t("openSettings") }}
					</button>
				</div>
			</section>

			<section v-else-if="phase === 'boot' || phase === 'settings'" class="gate boot">
				<p class="brand">{{ t("appName") }}</p>
				<p class="desc">{{ t("checkingConnection") }}</p>
			</section>
		</main>

		<SettingsPanel
			:model-value="showSettings"
			:blocking="settingsBlocking"
			@update:model-value="closeSettings"
			@saved="onSettingsSaved"
		/>
	</div>
</template>

<style scoped>
.app {
	height: 100%;
	display: grid;
	grid-template-rows: 1fr;
	position: relative;
	background:
		radial-gradient(1200px 600px at 50% -10%, var(--hero-glow) 0%, transparent 55%),
		var(--bg);
}

.stage {
	position: relative;
	overflow: auto;
	min-height: 0;
}

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

.desc {
	margin: 0;
	color: var(--muted);
	line-height: 1.45;
}

.desc.ok {
	color: var(--ok);
}

.meta {
	margin: 0;
	color: var(--accent);
	font-size: 0.8rem;
	word-break: break-all;
}

.mono {
	font-family: var(--mono);
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

.ghost {
	background: transparent;
	color: var(--muted);
}
</style>
