/**
 * Mobile pairing session: redeem QR/PIN, persist link_token, status check.
 * APIs: pos_next.api.mobile_scanner.{redeem_pairing,get_session_status}
 */

import { callFrappeMethod, ensureLoggedIn } from "./apiClient.js";

export const PAIRING_KEY = "posnext.scanner.pairing";
export const DEVICE_ID_KEY = "posnext.scanner.device_id";

/**
 * @typedef {object} PairingSession
 * @property {string} linkToken
 * @property {string} deviceId
 * @property {string} [sessionInstanceId]
 * @property {string} [posProfile]
 * @property {string} [company]
 * @property {string} [warehouse]
 * @property {string} [linkExpiresAt]
 * @property {number} pairedAt
 */

/** @returns {string} */
export function getOrCreateDeviceId() {
	if (typeof localStorage === "undefined") {
		return `dev-${Math.random().toString(36).slice(2, 12)}`;
	}
	let id = localStorage.getItem(DEVICE_ID_KEY);
	if (!id) {
		id =
			typeof crypto !== "undefined" && crypto.randomUUID
				? crypto.randomUUID()
				: `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
		localStorage.setItem(DEVICE_ID_KEY, id);
	}
	return id;
}

/** @returns {PairingSession | null} */
export function loadPairingSession() {
	if (typeof localStorage === "undefined") return null;
	try {
		const raw = localStorage.getItem(PAIRING_KEY);
		if (!raw) return null;
		const o = JSON.parse(raw);
		if (!o?.linkToken || !o?.deviceId) return null;
		return {
			linkToken: String(o.linkToken),
			deviceId: String(o.deviceId),
			sessionInstanceId: o.sessionInstanceId ? String(o.sessionInstanceId) : undefined,
			posProfile: o.posProfile ? String(o.posProfile) : undefined,
			company: o.company ? String(o.company) : undefined,
			warehouse: o.warehouse ? String(o.warehouse) : undefined,
			linkExpiresAt: o.linkExpiresAt ? String(o.linkExpiresAt) : undefined,
			pairedAt: Number(o.pairedAt) || Date.now(),
		};
	} catch {
		return null;
	}
}

/** @param {PairingSession} session */
export function savePairingSession(session) {
	if (typeof localStorage === "undefined") return session;
	localStorage.setItem(PAIRING_KEY, JSON.stringify(session));
	return session;
}

export function clearPairingSession() {
	if (typeof localStorage === "undefined") return;
	localStorage.removeItem(PAIRING_KEY);
}

/**
 * Parse till QR payload → qr_token.
 * Accepts: raw token, JSON {qr_token|token}, URL ?qr_token= / ?token=
 * @param {string} raw
 * @returns {string | null}
 */
export function parsePairingQrPayload(raw) {
	const text = String(raw || "").trim();
	if (!text) return null;

	if (text.startsWith("{")) {
		try {
			const o = JSON.parse(text);
			const tok = o.qr_token || o.qrToken || o.token || o.pairing_token;
			if (tok) return String(tok).trim();
		} catch {
			/* fall through */
		}
	}

	try {
		if (text.includes("://") || text.startsWith("http")) {
			const u = new URL(text);
			const tok =
				u.searchParams.get("qr_token") ||
				u.searchParams.get("token") ||
				u.searchParams.get("t");
			if (tok) return tok.trim();
			const pathTail = u.pathname.split("/").filter(Boolean).pop();
			if (pathTail && pathTail.length >= 16) return pathTail;
		}
	} catch {
		/* fall through */
	}

	// Compact `posnext_pair:<token>` or bare token
	const compact = text.match(/^posnext[_-]?pair[:\s]+(.+)$/i);
	if (compact) return compact[1].trim();

	if (/^[A-Za-z0-9_-]{16,}$/.test(text)) return text;
	return null;
}

/**
 * @returns {Promise<{ paired: boolean, session: PairingSession | null, status?: object, error?: string }>}
 */
export async function checkActivePairing() {
	const session = loadPairingSession();
	if (!session?.linkToken) {
		return { paired: false, session: null };
	}
	try {
		await ensureLoggedIn();
		const status = await callFrappeMethod("pos_next.api.mobile_scanner.get_session_status", {
			link_token: session.linkToken,
		});
		const reachable = status?.session?.reachable !== false;
		const closed = status?.session?.status === "Closed";
		if (!reachable || closed) {
			return { paired: false, session, status, error: closed ? "session_closed" : "unreachable" };
		}
		return {
			paired: true,
			session: {
				...session,
				sessionInstanceId: status?.session?.session_instance_id || session.sessionInstanceId,
				posProfile: status?.session?.pos_profile || session.posProfile,
			},
			status,
		};
	} catch (e) {
		const msg = String(e?.message || e || "");
		if (/expired|revoked|invalid|Authentication|login/i.test(msg)) {
			clearPairingSession();
			return { paired: false, session: null, error: msg };
		}
		return { paired: false, session, error: msg };
	}
}

/**
 * @param {string} qrRaw
 * @returns {Promise<PairingSession>}
 */
export async function redeemPairingFromQr(qrRaw) {
	const qrToken = parsePairingQrPayload(qrRaw);
	if (!qrToken) {
		const err = new Error("invalid_qr");
		err.code = "invalid_qr";
		throw err;
	}
	await ensureLoggedIn();
	const deviceId = getOrCreateDeviceId();
	const message = await callFrappeMethod("pos_next.api.mobile_scanner.redeem_pairing", {
		device_id: deviceId,
		qr_token: qrToken,
		// Do not send a device display name to the till.
		device_label: "",
		user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
	});

	const session = savePairingSession({
		linkToken: String(message.link_token),
		deviceId,
		sessionInstanceId: message.session?.session_instance_id,
		posProfile: message.pos_profile || message.session?.pos_profile,
		company: message.company || message.session?.company,
		warehouse: message.warehouse || message.session?.warehouse,
		linkExpiresAt: message.link_token_expires_at
			? String(message.link_token_expires_at)
			: undefined,
		pairedAt: Date.now(),
	});
	return session;
}
