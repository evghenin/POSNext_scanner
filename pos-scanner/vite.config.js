import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../pos_next/public/pos_scanner");
const wwwHtml = path.resolve(__dirname, "../pos_next/www/pos_scanner.html");

/**
 * After build, emit a Frappe www shell that loads hashed (or stable) assets
 * from /assets/pos_next/pos_scanner/.
 */
function emitFrappeWww() {
	return {
		name: "pos-scanner-frappe-www",
		apply: "build",
		async closeBundle() {
			const indexPath = path.join(outDir, "index.html");
			let html = await fs.readFile(indexPath, "utf8");
			// Built index already has absolute /assets/... links when base is set.
			await fs.mkdir(path.dirname(wwwHtml), { recursive: true });
			await fs.writeFile(wwwHtml, html, "utf8");
			console.log(`\n✓ Wrote Frappe www page: ${wwwHtml}`);
		},
	};
}

export default defineConfig({
	plugins: [vue(), emitFrappeWww()],
	base: process.env.POS_SCANNER_BASE || "/",
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
		},
	},
	server: {
		port: 5174,
		host: true,
	},
	build: {
		outDir,
		emptyOutDir: true,
		sourcemap: true,
		assetsDir: "assets",
		rollupOptions: {
			output: {
				entryFileNames: "assets/[name].js",
				chunkFileNames: "assets/[name].js",
				assetFileNames: "assets/[name][extname]",
				manualChunks: {
					zxing: ["zxing-wasm"],
					tesseract: ["tesseract.js"],
				},
			},
		},
	},
	test: {
		environment: "jsdom",
		include: ["src/**/*.spec.js"],
	},
	optimizeDeps: {
		exclude: ["zxing-wasm"],
	},
});
