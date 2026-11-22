import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./apiClient.js", () => ({
	callFrappeMethod: vi.fn(),
	formatFrappeError: (err, method) => ({
		message: `${method || ""}: ${err?.message || err}`.replace(/^: /, ""),
		method: method || null,
		excType: err?.excType || null,
	}),
}));

vi.mock("./pairing.js", () => ({
	loadPairingSession: vi.fn(),
}));

vi.mock("./cart.js", async () => {
	const actual = await vi.importActual("./cart.js");
	return {
		...actual,
		loadCart: vi.fn(),
		clearCartLines: vi.fn((c) => ({ ...c, lines: [], pendingSend: null })),
		ensurePendingSend: actual.ensurePendingSend,
	};
});

import { callFrappeMethod } from "./apiClient.js";
import { ensurePendingSend, loadCart } from "./cart.js";
import { loadPairingSession } from "./pairing.js";
import { ENQUEUE_COMMANDS_METHOD, sendCartToTill } from "./cartSend.js";

describe("sendCartToTill", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		loadPairingSession.mockReturnValue({
			linkToken: "tok-1",
			deviceId: "dev-1",
			sessionInstanceId: "sess-1",
		});
	});

	it("enqueues with session cart_generation and does not invent fallbacks", async () => {
		loadCart.mockReturnValue(
			ensurePendingSend(
				{
					lines: [
						{
							id: "l1",
							item_code: "SKU1",
							item_name: "Widget",
							qty: 2,
							uom: "Nos",
							conversion_factor: 1,
							rate: 10,
						},
					],
					pendingSend: null,
				},
				"gen-live"
			)
		);
		// ensurePendingSend already saved; reload same
		const pendingCart = loadCart();
		loadCart.mockReturnValue(pendingCart);

		callFrappeMethod
			.mockResolvedValueOnce({
				session: { cart_generation: "gen-live", status: "Active", reachable: false },
			})
			.mockResolvedValueOnce({ results: [{ duplicate: false }] })
			.mockResolvedValue({
				commands: [{ operation_id: pendingCart.pendingSend.operations[0].operation_id, status: "applied" }],
			});

		const outcome = await sendCartToTill({ pollMs: 1, timeoutMs: 50 });
		expect(outcome.kind).toBe("ok");

		const enqueueCall = callFrappeMethod.mock.calls.find((c) => c[0] === ENQUEUE_COMMANDS_METHOD);
		expect(enqueueCall).toBeTruthy();
		const args = enqueueCall[1];
		expect(args.link_token).toBe("tok-1");
		const commands = JSON.parse(args.commands);
		expect(commands[0].cart_generation).toBe("gen-live");
		expect(commands[0].command_type).toBe("add_item");
		expect(commands[0].item_code).toBe("SKU1");
		expect(commands[0].qty).toBe(2);
	});

	it("errors with method when cart_generation missing", async () => {
		loadCart.mockReturnValue({
			lines: [{ id: "l1", item_code: "SKU1", item_name: "W", qty: 1, uom: "Nos", rate: 1 }],
			pendingSend: null,
		});
		callFrappeMethod.mockResolvedValueOnce({
			session: { status: "Active", cart_generation: "", reachable: true },
		});
		const outcome = await sendCartToTill();
		expect(outcome.kind).toBe("error");
		expect(outcome.message).toMatch(/cart_generation/);
	});

	it("still enqueues when till heartbeat is stale (reachable false)", async () => {
		const cart = ensurePendingSend(
			{
				lines: [
					{ id: "l1", item_code: "SKU1", item_name: "W", qty: 1, uom: "Nos", conversion_factor: 1, rate: 1 },
				],
				pendingSend: null,
			},
			"gen-2"
		);
		loadCart.mockReturnValue(cart);
		callFrappeMethod
			.mockResolvedValueOnce({
				session: { cart_generation: "gen-2", status: "Active", reachable: false },
			})
			.mockResolvedValueOnce({ results: [] })
			.mockResolvedValue({
				commands: [{ operation_id: cart.pendingSend.operations[0].operation_id, status: "queued" }],
			});

		const outcome = await sendCartToTill({ pollMs: 1, timeoutMs: 30 });
		expect(outcome.kind).toBe("till_pending");
		expect(callFrappeMethod.mock.calls.some((c) => c[0] === ENQUEUE_COMMANDS_METHOD)).toBe(true);
	});
});
