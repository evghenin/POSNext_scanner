import { onBeforeUnmount, ref, shallowRef } from "vue";

/**
 * getUserMedia camera with torch/flashlight when the track supports it.
 */
export function useCamera() {
	const videoEl = shallowRef(null);
	const stream = shallowRef(null);
	const error = ref(null);
	const ready = ref(false);
	const torchOn = ref(false);
	const torchSupported = ref(false);
	const facingMode = ref("environment");

	async function start(el) {
		stop();
		error.value = null;
		ready.value = false;
		videoEl.value = el || videoEl.value;
		if (!videoEl.value) {
			error.value = "Нет элемента video";
			return;
		}
		if (!navigator.mediaDevices?.getUserMedia) {
			error.value = "Камера недоступна в этом браузере (нужен HTTPS или localhost)";
			return;
		}

		try {
			const media = await navigator.mediaDevices.getUserMedia({
				audio: false,
				video: {
					facingMode: { ideal: facingMode.value },
					width: { ideal: 1280 },
					height: { ideal: 720 },
				},
			});
			stream.value = media;
			videoEl.value.srcObject = media;
			await videoEl.value.play();
			ready.value = true;
			await refreshTorchCapability();
		} catch (e) {
			if (e?.name === "NotAllowedError" || e?.name === "PermissionDeniedError") {
				error.value =
					"Доступ к камере запрещён. Разрешите камеру для POSNext Scanner в настройках Android и нажмите «Открыть камеру» снова.";
			} else if (e?.name === "NotFoundError") {
				error.value = "Камера не найдена на устройстве.";
			} else if (e?.name === "NotReadableError") {
				error.value = "Камера занята другим приложением. Закройте его и повторите.";
			} else {
				error.value = e?.message || "Не удалось открыть камеру";
			}
			ready.value = false;
		}
	}

	function stop() {
		torchOn.value = false;
		torchSupported.value = false;
		if (stream.value) {
			for (const track of stream.value.getTracks()) track.stop();
			stream.value = null;
		}
		if (videoEl.value) {
			videoEl.value.srcObject = null;
		}
		ready.value = false;
	}

	function getVideoTrack() {
		return stream.value?.getVideoTracks?.()[0] || null;
	}

	async function refreshTorchCapability() {
		const track = getVideoTrack();
		torchSupported.value = false;
		if (!track) return;
		const caps = typeof track.getCapabilities === "function" ? track.getCapabilities() : {};
		torchSupported.value = Boolean(caps.torch);
	}

	async function setTorch(on) {
		const track = getVideoTrack();
		if (!track || !torchSupported.value) return false;
		try {
			await track.applyConstraints({ advanced: [{ torch: Boolean(on) }] });
			torchOn.value = Boolean(on);
			return true;
		} catch {
			torchSupported.value = false;
			torchOn.value = false;
			return false;
		}
	}

	async function toggleTorch() {
		return setTorch(!torchOn.value);
	}

	/**
	 * Crop the center reticle region from the current video frame into a canvas.
	 * @param {HTMLCanvasElement} canvas
	 * @param {{ widthRatio?: number, heightRatio?: number }} [opts]
	 */
	function captureReticle(canvas, { widthRatio = 0.72, heightRatio = 0.28 } = {}) {
		const video = videoEl.value;
		if (!video || !ready.value || video.readyState < 2) return null;

		const vw = video.videoWidth;
		const vh = video.videoHeight;
		if (!vw || !vh) return null;

		const rw = Math.floor(vw * widthRatio);
		const rh = Math.floor(vh * heightRatio);
		const sx = Math.floor((vw - rw) / 2);
		const sy = Math.floor((vh - rh) / 2);

		canvas.width = rw;
		canvas.height = rh;
		const ctx = canvas.getContext("2d", { willReadFrequently: true });
		ctx.drawImage(video, sx, sy, rw, rh, 0, 0, rw, rh);
		return { canvas, sx, sy, rw, rh, vw, vh };
	}

	onBeforeUnmount(stop);

	return {
		videoEl,
		stream,
		error,
		ready,
		torchOn,
		torchSupported,
		facingMode,
		start,
		stop,
		setTorch,
		toggleTorch,
		captureReticle,
		getVideoTrack,
	};
}
