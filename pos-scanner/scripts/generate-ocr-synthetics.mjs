#!/usr/bin/env node
/**
 * Generate synthetic NSU/SRV shelf-code PNGs for OCR fixture tests.
 * Real SKU photos live under tests/fixtures/ocr/ (copied from media/ocr-shelf-tags).
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Jimp, loadFont } from "jimp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../tests/fixtures/ocr");
const fontCandidates = [
	path.resolve(__dirname, "../node_modules/@jimp/plugin-print/fonts/open-sans/open-sans-64-black/open-sans-64-black.fnt"),
	path.resolve(__dirname, "../node_modules/@jimp/plugin-print/fonts/open-sans/open-sans-32-black/open-sans-32-black.fnt"),
];

const fontPath = fontCandidates.find((p) => existsSync(p));
if (!fontPath) {
	console.error("No jimp open-sans font found under node_modules");
	process.exit(1);
}

const font = await loadFont(fontPath);
for (const [code, file] of [
	["NSU00001", "nsu00001-synthetic.png"],
	["SRV00001", "srv00001-synthetic.png"],
]) {
	const img = new Jimp({ width: 900, height: 240, color: 0xffffffff });
	img.print({ font, x: 60, y: 80, text: code });
	const dest = path.join(outDir, file);
	await img.write(dest);
	console.log("wrote", dest);
}
