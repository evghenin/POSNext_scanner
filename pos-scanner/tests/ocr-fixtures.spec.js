/**
 * @vitest-environment node
 *
 * Recognition regression: still images must yield SKU / NSU / SRV codes.
 * Real shelf-tag photos + synthetic NSU/SRV prints (no phone photos for those prefixes).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { recognizeSkuFromStillBytes, terminateOcr } from "../src/lib/ocr.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "fixtures/ocr");

/** @type {{ file: string, expect: string, crop: boolean }[]} */
const CASES = [
	{ file: "sku00776-a.png", expect: "SKU00776", crop: true },
	{ file: "sku00776-b.png", expect: "SKU00776", crop: true },
	{ file: "sku00668-prija.png", expect: "SKU00668", crop: true },
	{ file: "nsu00001-synthetic.png", expect: "NSU00001", crop: false },
	{ file: "srv00001-synthetic.png", expect: "SRV00001", crop: false },
];

describe("OCR fixture recognition (SKU / NSU / SRV)", () => {
	afterAll(async () => {
		await terminateOcr();
	});

	it("fixture set covers all three prefixes", () => {
		const prefixes = new Set(CASES.map((c) => c.expect.slice(0, 3)));
		expect([...prefixes].sort()).toEqual(["NSU", "SKU", "SRV"]);
	});

	for (const c of CASES) {
		it(
			`detects ${c.expect} in ${c.file}`,
			async () => {
				const bytes = readFileSync(join(fixturesDir, c.file));
				const result = await recognizeSkuFromStillBytes(bytes, {
					crop: c.crop,
					widthRatio: 0.78,
					heightRatio: 0.36,
					scale: 2,
				});
				expect(result.codes, `raw=${JSON.stringify(result.rawText)}`).toContain(c.expect);
			},
			60_000
		);
	}
});
