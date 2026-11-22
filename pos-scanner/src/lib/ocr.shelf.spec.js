/**
 * @vitest-environment node
 *
 * Still-image fixtures for Hotel Life shelf price tags (no barcode).
 * Expect printed SKU##### from the same OCR pipeline used in-app.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { recognizeSkuFromStillBytes, terminateOcr } from "./ocr.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "../../fixtures/ocr-shelf-tags");

const CASES = [
	{ file: "sku00776-a.png", expect: "SKU00776" },
	{ file: "sku00776-b.png", expect: "SKU00776" },
	{ file: "sku00668-prija.png", expect: "SKU00668" },
];

describe("shelf-tag OCR fixtures", () => {
	afterAll(async () => {
		await terminateOcr();
	});

	for (const c of CASES) {
		it(
			`detects ${c.expect} in ${c.file}`,
			async () => {
				const bytes = readFileSync(join(fixturesDir, c.file));
				const result = await recognizeSkuFromStillBytes(bytes, {
					crop: true,
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
