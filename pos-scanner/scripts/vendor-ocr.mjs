#!/usr/bin/env node
/**
 * Download Tesseract worker / LSTM SIMD core / eng traineddata into public/ocr/
 * so production and Android WebView do not depend on broken or blocked CDN paths.
 */
import { createWriteStream } from "node:fs";
import { mkdir, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "../public/ocr");

const ASSETS = [
	{
		url: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
		file: "worker.min.js",
	},
	{
		url: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd-lstm.wasm.js",
		file: "tesseract-core-simd-lstm.wasm.js",
	},
	{
		url: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd-lstm.wasm",
		file: "tesseract-core-simd-lstm.wasm",
	},
	{
		url: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz",
		file: "eng.traineddata.gz",
	},
];

async function download(url, dest) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
	await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

async function main() {
	await mkdir(outDir, { recursive: true });
	const force = process.argv.includes("--force");
	for (const asset of ASSETS) {
		const dest = join(outDir, asset.file);
		if (!force) {
			try {
				await access(dest);
				console.log(`skip (exists) ${asset.file}`);
				continue;
			} catch {
				/* download */
			}
		}
		process.stdout.write(`fetch ${asset.file}… `);
		await download(asset.url, dest);
		console.log("ok");
	}
	console.log(`OCR assets in ${outDir}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
