<script setup>
import { computed, nextTick, onMounted, ref } from "vue";
import ConnectionErrorPanel from "@/components/ConnectionErrorPanel.vue";
import ManualEntry from "@/components/ManualEntry.vue";
import MatchPicker from "@/components/MatchPicker.vue";
import ResultCard from "@/components/ResultCard.vue";
import Reticle from "@/components/Reticle.vue";
import SettingsPanel from "@/components/SettingsPanel.vue";
import { probeScannerEndpoint } from "@/lib/connectionProbe.js";
import { listMockItems } from "@/lib/mockCatalog.js";
import { WORK_MODE_LABELS, loadSettings, saveSettings } from "@/lib/settings.js";
import { isAndroidDemoShell, readNativeServerConfig } from "@/lib/shellBridge.js";
import { useCamera } from "@/composables/useCamera.js";
import { useScanner } from "@/composables/useScanner.js";

const videoRef = ref(null);
const showManual = ref(false);
const showHelp = ref(false);
const showSettings = ref(false);
const started = ref(false);
const settings = ref(loadSettings());
const connectionError = ref(null);
const probing = ref(false);

const camera = useCamera();
const scanner = useScanner(camera);

const sheetOpen = computed(
	() =>
		showManual.value ||
		Boolean(scanner.pendingChoice.value) ||
		Boolean(scanner.result.value)
);

const modeLabel = computed(
	() => WORK_MODE_LABELS[settings.value.workMode] || WORK_MODE_LABELS.immediate
);

const needsServerHint = computed(() => !settings.value.serverUrl);

onMounted(async () => {
	syncFromNativeShell();
	await scanner.warmEngines();
	// First launch convenience: open settings if no server URL yet (e.g. blank APK host)
	if (!settings.value.serverUrl || settings.value.serverUrl.includes("example.com")) {
		if (isAndroidDemoShell()) showSettings.value = true;
	} else if (!isAndroidDemoShell()) {
		// Browser / TWA: soft-check so missing /pos-scanner is explained in our UI
		await runConnectionProbe({ silentOk: true });
	}
});

function syncFromNativeShell() {
	const native = readNativeServerConfig();
	if (!native?.serverUrl) return;
	const next = saveSettings({
		...settings.value,
		serverUrl: native.serverUrl,
		scannerPath: native.scannerPath || settings.value.scannerPath,
	});
	settings.value = next;
}

async function onSettingsSaved(next) {
	settings.value = next;
	connectionError.value = null;
	if (!isAndroidDemoShell()) {
		await runConnectionProbe({ silentOk: true });
	}
}

async function runConnectionProbe({ silentOk = false } = {}) {
	if (!settings.value.serverUrl) return true;
	probing.value = true;
	try {
		const result = await probeScannerEndpoint({
			serverUrl: settings.value.serverUrl,
			scannerPath: settings.value.scannerPath,
		});
		if (!result.ok) {
			connectionError.value = result;
			return false;
		}
		if (!silentOk) connectionError.value = null;
		else connectionError.value = null;
		return true;
	} finally {
		probing.value = false;
	}
}

async function begin() {
	const ok = await runConnectionProbe();
	if (!ok) return;
	await nextTick();
	await camera.start(videoRef.value);
	if (camera.ready.value) {
		started.value = true;
		if (settings.value.torchDefault) {
			await camera.setTorch(true);
		}
		await scanner.startLoop();
	}
}

function openManual() {
	scanner.paused.value = true;
	showManual.value = true;
}

function closeManual() {
	showManual.value = false;
	if (!scanner.result.value && !scanner.pendingChoice.value) {
		scanner.resumeScanning();
	}
}

function openSettings() {
	scanner.paused.value = true;
	connectionError.value = null;
	showSettings.value = true;
}

function closeSettings() {
	showSettings.value = false;
	if (!scanner.result.value && !scanner.pendingChoice.value && !showManual.value) {
		scanner.paused.value = false;
	}
}

async function retryConnection() {
	connectionError.value = null;
	const ok = await runConnectionProbe();
	if (ok && !started.value) {
		/* stay on gate — user can open camera */
	}
}
</script>

<template>
	<div class="app">
		<header class="top">
			<div>
				<p class="brand">POSNext Scanner</p>
				<p class="sub">{{ modeLabel }} · демо без кассы</p>
			</div>
			<div class="top__actions">
				<button
					v-if="camera.torchSupported.value"
					type="button"
					class="icon-btn"
					:aria-pressed="camera.torchOn.value"
					:title="camera.torchOn.value ? 'Выключить фонарик' : 'Фонарик'"
					@click="camera.toggleTorch()"
				>
					{{ camera.torchOn.value ? "Torch on" : "Torch" }}
				</button>
				<button type="button" class="icon-btn" title="Настройки" @click="openSettings">
					Настр.
				</button>
				<button type="button" class="icon-btn" title="Справка" @click="showHelp = !showHelp">
					?
				</button>
			</div>
		</header>

		<main class="stage">
			<video
				ref="videoRef"
				class="preview"
				playsinline
				muted
				autoplay
			/>
			<Reticle v-if="started && camera.ready.value" />

			<div v-if="!started" class="gate">
				<h1>Камера + штрихкоды + OCR</h1>
				<p>
					Прототип для A03–A05: zxing-wasm (1D/2D) и tesseract.js (SKU##### в
					прицеле). Поиск товаров — mock-каталог.
				</p>
				<p v-if="settings.serverUrl" class="gate-meta mono">
					{{ settings.serverUrl }}{{ settings.scannerPath }}
				</p>
				<p v-if="needsServerHint" class="warn">
					Сначала укажите URL сервера в настройках.
				</p>
				<p v-if="probing" class="gate-meta">Проверка сервера…</p>
				<div class="gate-actions">
					<button
						type="button"
						class="cta"
						:disabled="scanner.status.value === 'loading' || probing"
						@click="begin"
					>
						{{
							probing
								? "Проверка сервера…"
								: scanner.status.value === "loading"
									? "Загрузка движков…"
									: "Открыть камеру"
						}}
					</button>
					<button type="button" class="cta secondary" @click="openSettings">
						Настройки
					</button>
				</div>
				<p v-if="camera.error.value" class="err">{{ camera.error.value }}</p>
				<p v-if="scanner.lastError.value" class="err">{{ scanner.lastError.value }}</p>
			</div>

			<div v-else-if="camera.error.value" class="gate">
				<p class="err">{{ camera.error.value }}</p>
				<button type="button" class="cta" @click="openManual">Ручной ввод</button>
				<button type="button" class="cta secondary" @click="openSettings">Настройки</button>
			</div>

			<div class="hud" v-if="started && camera.ready.value">
				<span>{{ scanner.status.value }}</span>
				<span>{{ modeLabel }}</span>
				<span v-if="scanner.lastDecodeMs.value">{{ scanner.lastDecodeMs.value }} ms</span>
				<span v-if="scanner.engineInfo.value">
					{{ scanner.engineInfo.value.native ? "native+zxing" : "zxing" }}
				</span>
			</div>
		</main>

		<footer class="bar" v-if="started">
			<button type="button" class="bar__btn" @click="openManual">Ручной ввод</button>
			<button type="button" class="bar__btn" @click="openSettings">Настройки</button>
			<button
				type="button"
				class="bar__btn"
				@click="scanner.result.value || scanner.pendingChoice.value ? scanner.dismiss() : null"
			>
				Сброс
			</button>
		</footer>

		<div v-if="sheetOpen" class="sheet">
			<ManualEntry
				v-if="showManual && !scanner.pendingChoice.value && !scanner.result.value"
				@submit="
					(v) => {
						showManual = false;
						scanner.submitManual(v);
					}
				"
				@close="closeManual"
			/>
			<MatchPicker
				v-else-if="scanner.pendingChoice.value"
				:candidates="scanner.pendingChoice.value.candidates"
				:kind="scanner.pendingChoice.value.kind"
				:raw-text="scanner.pendingChoice.value.rawText || ''"
				@choose="scanner.chooseCandidate"
				@cancel="scanner.dismiss"
			/>
			<ResultCard
				v-else-if="scanner.result.value"
				:result="scanner.result.value"
				@add="scanner.confirmAdd"
				@dismiss="scanner.dismiss"
			/>
		</div>

		<SettingsPanel
			:model-value="showSettings"
			@update:model-value="
				(v) => {
					showSettings = v;
					if (!v) closeSettings();
				}
			"
			@saved="onSettingsSaved"
		/>

		<ConnectionErrorPanel
			v-if="connectionError"
			:result="connectionError"
			@retry="retryConnection"
			@settings="openSettings"
			@dismiss="connectionError = null"
		/>

		<aside v-if="showHelp" class="help" @click.self="showHelp = false">
			<div class="help__panel">
				<h2>Движки и демо-каталог</h2>
				<ul>
					<li>1D/2D: <code>zxing-wasm</code> (+ native BarcodeDetector если доступен)</li>
					<li>OCR: <code>tesseract.js</code>, только область прицела, маска <code>SKU#####</code></li>
					<li>Штрихкод имеет приоритет над OCR</li>
					<li>Несколько совпадений → ручной выбор</li>
				</ul>
				<h3>Mock items</h3>
				<ul class="mono">
					<li v-for="item in listMockItems()" :key="item.item_code">
						{{ item.item_code }} · {{ item.barcode }}
					</li>
				</ul>
				<button type="button" class="cta" @click="showHelp = false">Закрыть</button>
			</div>
		</aside>
	</div>
</template>

<style scoped>
.app {
	height: 100%;
	display: grid;
	grid-template-rows: auto 1fr auto;
	position: relative;
	background:
		radial-gradient(1200px 600px at 50% -10%, #1a2744 0%, transparent 55%),
		var(--bg);
}

.top {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 0.75rem 1rem;
	padding-top: max(0.75rem, env(safe-area-inset-top));
	z-index: 2;
}

.brand {
	margin: 0;
	font-weight: 700;
	letter-spacing: 0.02em;
}

.sub {
	margin: 0.15rem 0 0;
	color: var(--muted);
	font-size: 0.78rem;
}

.top__actions {
	display: flex;
	gap: 0.35rem;
}

.icon-btn {
	min-width: 2.4rem;
	height: 2.4rem;
	padding: 0 0.65rem;
	border-radius: 999px;
	border: 1px solid rgba(255, 255, 255, 0.12);
	background: rgba(20, 28, 46, 0.8);
	color: var(--fg);
	font-size: 0.72rem;
	font-weight: 600;
}

.stage {
	position: relative;
	overflow: hidden;
	margin: 0 0.75rem;
	border-radius: 18px;
	background: #05080f;
	min-height: 0;
}

.preview {
	width: 100%;
	height: 100%;
	object-fit: cover;
	background: #000;
}

.gate {
	position: absolute;
	inset: 0;
	display: grid;
	align-content: center;
	gap: 0.75rem;
	padding: 1.5rem;
	background:
		linear-gradient(160deg, rgba(20, 40, 60, 0.92), rgba(8, 12, 24, 0.96)),
		url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Cg fill='none' stroke='%231e293b' stroke-width='1'%3E%3Cpath d='M0 40h80M40 0v80'/%3E%3C/g%3E%3C/svg%3E");
}

.gate h1 {
	margin: 0;
	font-size: 1.45rem;
}

.gate p {
	margin: 0;
	color: var(--muted);
	line-height: 1.45;
}

.gate-meta {
	font-size: 0.8rem;
	color: var(--accent);
	word-break: break-all;
}

.gate-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem;
}

.cta {
	justify-self: start;
	border: 0;
	border-radius: 12px;
	padding: 0.85rem 1.15rem;
	background: var(--accent);
	color: #04201b;
	font-weight: 700;
}

.cta.secondary {
	background: transparent;
	color: var(--fg);
	border: 1px solid rgba(255, 255, 255, 0.2);
}

.cta:disabled {
	opacity: 0.6;
}

.err {
	color: var(--danger);
}

.warn {
	color: var(--warn);
}

.hud {
	position: absolute;
	top: 0.65rem;
	left: 0.65rem;
	right: 0.65rem;
	display: flex;
	gap: 0.55rem;
	flex-wrap: wrap;
	font-size: 0.72rem;
	color: var(--fg);
	z-index: 1;
}

.hud span {
	background: rgba(0, 0, 0, 0.45);
	padding: 0.2rem 0.45rem;
	border-radius: 999px;
	backdrop-filter: blur(6px);
}

.bar {
	display: flex;
	gap: 0.5rem;
	padding: 0.75rem 1rem;
	padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
}

.bar__btn {
	flex: 1;
	border-radius: 12px;
	border: 1px solid rgba(255, 255, 255, 0.12);
	background: var(--bg-elevated);
	color: var(--fg);
	padding: 0.85rem;
	font-weight: 600;
}

.sheet {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	z-index: 5;
	animation: up 0.22s ease-out;
}

@keyframes up {
	from {
		transform: translateY(12%);
		opacity: 0.4;
	}
	to {
		transform: translateY(0);
		opacity: 1;
	}
}

.help {
	position: absolute;
	inset: 0;
	background: rgba(0, 0, 0, 0.55);
	z-index: 8;
	display: grid;
	align-items: end;
}

.help__panel {
	background: var(--bg-elevated);
	border-radius: 16px 16px 0 0;
	padding: 1.1rem 1rem 1.4rem;
	max-height: 80vh;
	overflow: auto;
}

.help__panel h2,
.help__panel h3 {
	margin: 0 0 0.5rem;
}

.help__panel ul {
	margin: 0 0 1rem;
	padding-left: 1.1rem;
	color: var(--muted);
}

.mono {
	font-family: var(--mono);
	font-size: 0.85rem;
}

code {
	font-family: var(--mono);
	color: var(--accent);
}
</style>
