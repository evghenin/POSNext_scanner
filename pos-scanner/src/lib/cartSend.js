/**
 * Push local cart to till via mobile_scanner enqueue_commands; clear only after ACK.
 */

import { callFrappeMethod } from "./apiClient.js";
import { clearCartLines, ensurePendingSend, loadCart, saveCart } from "./cart.js";
import { checkActivePairing, loadPairingSession } from "./pairing.js";

/**
 * @typedef {"ok" | "pairing_lost" | "rejected" | "timeout" | "error"} SendOutcomeKind
 */

/**
 * @param {{ pollMs?: number, timeoutMs?: number }} [opts]
 * @returns {Promise<{ kind: SendOutcomeKind, message?: string, cart?: object }>}
 */
export async function sendCartToTill(opts = {}) {
	const pollMs = opts.pollMs ?? 800;
	const timeoutMs = opts.timeoutMs ?? 45000;

	const pairCheck = await checkActivePairing();
	if (!pairCheck.paired || !pairCheck.session?.linkToken) {
		return { kind: "pairing_lost", message: "pairing_lost", cart: loadCart() };
	}

	const session = pairCheck.session;
	const cartGeneration =
		pairCheck.status?.session?.cart_generation ||
		pairCheck.status?.cart_generation ||
		session.sessionInstanceId ||
		"unknown";

	let cart = loadCart();
	if (!cart.lines.length) {
		return { kind: "ok", cart };
	}

	cart = ensurePendingSend(cart, String(cartGeneration));
	const pending = cart.pendingSend;
	if (!pending?.operations?.length) {
		return { kind: "error", message: "no_operations", cart };
	}

	const commands = pending.operations.map((op) => ({
		operation_id: op.operation_id,
		batch_id: pending.batchId,
		command_type: "add_item",
		cart_generation: pending.cartGeneration,
		item_code: op.item_code,
		qty: op.qty,
		uom: op.uom,
	}));

	try {
		await callFrappeMethod("pos_next.api.mobile_scanner.enqueue_commands", {
			link_token: session.linkToken,
			commands: JSON.stringify(commands),
		});
	} catch (e) {
		const msg = String(e?.message || e || "");
		if (/expired|revoked|invalid|Authentication|closed|mismatch/i.test(msg)) {
			return { kind: "pairing_lost", message: msg, cart };
		}
		return { kind: "error", message: msg, cart };
	}

	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		await sleep(pollMs);
		let statuses;
		try {
			statuses = await callFrappeMethod("pos_next.api.mobile_scanner.get_command_status", {
				link_token: session.linkToken,
				batch_id: pending.batchId,
			});
		} catch (e) {
			const msg = String(e?.message || e || "");
			if (/expired|revoked|invalid|Authentication|closed/i.test(msg)) {
				return { kind: "pairing_lost", message: msg, cart: loadCart() };
			}
			continue;
		}

		const list = statuses?.commands || [];
		if (!list.length) continue;

		const byId = new Map(list.map((c) => [c.operation_id, c]));
		const allDone = pending.operations.every((op) => {
			const st = byId.get(op.operation_id)?.status;
			return st === "applied" || st === "rejected" || st === "unknown";
		});
		if (!allDone) continue;

		const rejected = pending.operations.filter((op) => {
			const st = byId.get(op.operation_id)?.status;
			return st === "rejected" || st === "unknown";
		});
		if (rejected.length) {
			return {
				kind: "rejected",
				message: rejected.map((r) => r.item_code).join(", "),
				cart: loadCart(),
			};
		}

		const cleared = clearCartLines(loadCart());
		return { kind: "ok", cart: cleared };
	}

	return { kind: "timeout", message: "ack_timeout", cart: loadCart() };
}

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

/** @returns {import("./pairing.js").PairingSession | null} */
export function currentPairing() {
	return loadPairingSession();
}

export { saveCart };
