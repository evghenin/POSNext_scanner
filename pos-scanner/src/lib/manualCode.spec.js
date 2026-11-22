import { describe, expect, it } from "vitest";
import {
	backspaceManualDigit,
	clearManualDigits,
	createManualCodeState,
	enterManualDigit,
	formatManualCode,
	setManualPrefix,
} from "./manualCode.js";

describe("manualCode odometer", () => {
	it("defaults to SKU00000", () => {
		expect(formatManualCode(createManualCodeState())).toBe("SKU00000");
	});

	it("enters digits from the right", () => {
		let s = createManualCodeState();
		s = enterManualDigit(s, 1);
		expect(formatManualCode(s)).toBe("SKU00001");
		s = enterManualDigit(s, 2);
		expect(formatManualCode(s)).toBe("SKU00012");
		s = enterManualDigit(s, 3);
		expect(formatManualCode(s)).toBe("SKU00123");
	});

	it("keeps digits when prefix changes", () => {
		let s = createManualCodeState();
		s = enterManualDigit(s, 7);
		s = enterManualDigit(s, 7);
		s = setManualPrefix(s, "NSU");
		expect(formatManualCode(s)).toBe("NSU00077");
		s = setManualPrefix(s, "SRV");
		expect(formatManualCode(s)).toBe("SRV00077");
	});

	it("clear resets digits only", () => {
		let s = setManualPrefix(createManualCodeState(), "NSU");
		s = enterManualDigit(s, 9);
		s = clearManualDigits(s);
		expect(formatManualCode(s)).toBe("NSU00000");
	});

	it("backspace drops last entered digit", () => {
		let s = createManualCodeState();
		s = enterManualDigit(s, 1);
		s = enterManualDigit(s, 2);
		expect(formatManualCode(s)).toBe("SKU00012");
		s = backspaceManualDigit(s);
		expect(formatManualCode(s)).toBe("SKU00001");
		s = backspaceManualDigit(s);
		expect(formatManualCode(s)).toBe("SKU00000");
	});
});
