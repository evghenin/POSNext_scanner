/**
 * Push local cart to till via Guest + link_token:
 *   pos_next.api.mobile_scanner.enqueue_commands
 *   pos_next.api.mobile_scanner.get_command_status
 *
 * Clear cart only after terminal ACK (applied). Server accept ≠ applied.
 */

import { callFrappeMethod, formatFrappeError } from "./apiClient.js";
import { clearCartLines, ensurePendingSend, loadCart } from "./cart.js";
import { loadPairingSession } from "./pairing.js";

export const ENQUEUE_COMMANDS_METHOD = "pos_next.api.mobile_scanner.enqueue_commands";
export const GET_COMMAND_STATUS_METHOD = "pos_next.api.mobile_scanner.get_command_status";
export const GET_SESSION_STATUS_METHOD = "pos_next.api.mobile_scanner.get_session_status";

/**
 * @typedef {"ok" | "pairing_lost" | "rejected" | "timeout" | "till_pending" | "error"} SendOutcomeKind
 */

/**
 * @param {{ pollMs?: number, timeoutMs?: number }} [opts]
 * @returns {Promise<{ kind: SendOutcomeKind, message?: string, method?: string, cart?: object }>}
 */
export async function sendCartToTill(opts = {}) {
	const pollMs = opts.pollMs ?? 800;
	const timeoutMs = opts.timeoutMs ?? 45000;

	const session = loadPairingSession();
	if (!session?.linkToken) {
		return { kind: "pairing_lost", message: "not_connected", cart: loadCart() };
	}

	let status;
	try {
		status = await callFrappeMethod(GET_SESSION_STATUS_METHOD, {
			link_token: session.linkToken,
		});
	} catch (e) {
		const formatted = formatFrappeError(e, GET_SESSION_STATUS_METHOD);
		if (isAuthLost(formatted.message)) {
			return { kind: "pairing_lost", message: formatted.message, method: GET_SESSION_STATUS_METHOD, cart: loadCart() };
		}
		return {
			kind: "error",
			message: formatted.message,
			method: GET_SESSION_STATUS_METHOD,
			cart: loadCart(),
		};
	}

	if (status?.session?.status === "Closed") {
		return {
			kind: "pairing_lost",
			message: "session_closed",
			method: GET_SESSION_STATUS_METHOD,
			cart: loadCart(),
		};
	}

	// Do NOT require session.reachable here. Till may not heartbeat; enqueue still
	// accepts with a valid link_token (server parks commands for POS ACK).
	const cartGeneration = String(status?.session?.cart_generation || "").trim();
	if (!cartGeneration) {
		return {
			kind: "error",
			message: `${GET_SESSION_STATUS_METHOD}: missing session.cart_generation — till must register_session / heartbeat with a cart_generation`,
			method: GET_SESSION_STATUS_METHOD,
			cart: loadCart(),
		};
	}

	let cart = loadCart();
	if (!cart.lines.length) {
		return { kind: "ok", cart };
	}

	cart = ensurePendingSend(cart, cartGeneration);
	const pending = cart.pendingSend;
	if (!pending?.operations?.length) {
		return { kind: "error", message: "no_operations", cart };
	}

	/** Matches develop enqueue_commands → enqueue_command fields. */
	const commands = pending.operations.map((op) => {
		const line = cart.lines.find((l) => l.id === op.line_id);
		return {
			operation_id: op.operation_id,
			batch_id: pending.batchId,
			command_type: "add_item",
			cart_generation: cartGeneration,
			item_code: op.item_code,
			qty: op.qty,
			uom: op.uom,
			conversion_factor: line?.conversion_factor || 1,
			rate: line?.rate,
			item_name: line?.item_name,
		};
	});

	try {
		await callFrappeMethod(ENQUEUE_COMMANDS_METHOD, {
			link_token: session.linkToken,
			commands: JSON.stringify(commands),
		});
	} catch (e) {
		const formatted = formatFrappeError(e, ENQUEUE_COMMANDS_METHOD);
		if (isAuthLost(formatted.message)) {
			return {
				kind: "pairing_lost",
				message: formatted.message,
				method: ENQUEUE_COMMANDS_METHOD,
				cart: loadCart(),
			};
		}
		return {
			kind: "error",
			message: formatted.message,
			method: ENQUEUE_COMMANDS_METHOD,
			cart: loadCart(),
		};
	}

	const deadline = Date.now() + timeoutMs;
	let sawQueued = false;
	while (Date.now() < deadline) {
		await sleep(pollMs);
		let statuses;
		try {
			statuses = await callFrappeMethod(GET_COMMAND_STATUS_METHOD, {
				link_token: session.linkToken,
				batch_id: pending.batchId,
			});
		} catch (e) {
			const formatted = formatFrappeError(e, GET_COMMAND_STATUS_METHOD);
			if (isAuthLost(formatted.message)) {
				return {
					kind: "pairing_lost",
					message: formatted.message,
					method: GET_COMMAND_STATUS_METHOD,
					cart: loadCart(),
				};
			}
			continue;
		}

		const list = statuses?.commands || [];
		if (!list.length) continue;

		const byId = new Map(list.map((c) => [c.operation_id, c]));
		const states = pending.operations.map((op) => byId.get(op.operation_id)?.status || null);
		if (states.some((st) => st === "queued" || st === "delivered")) sawQueued = true;

		const allTerminal = pending.operations.every((op) => {
			const st = byId.get(op.operation_id)?.status;
			return st === "applied" || st === "rejected" || st === "unknown";
		});
		if (!allTerminal) continue;

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

	if (sawQueued) {
		return {
			kind: "till_pending",
			message: `${ENQUEUE_COMMANDS_METHOD}: accepted (queued) but till did not ACK via poll_commands/ack_command within ${Math.round(timeoutMs / 1000)}s — cart kept`,
			method: ENQUEUE_COMMANDS_METHOD,
			cart: loadCart(),
		};
	}

	return {
		kind: "timeout",
		message: `${GET_COMMAND_STATUS_METHOD}: no command status for batch — cart kept`,
		method: GET_COMMAND_STATUS_METHOD,
		cart: loadCart(),
	};
}

function isAuthLost(message) {
	return /expired|revoked|invalid|Authentication|closed|Permission|login|link_token/i.test(
		String(message || "")
	);
}

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

export { loadCart };
