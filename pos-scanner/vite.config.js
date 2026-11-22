import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const androidOut = path.resolve(__dirname, "../android-scanner/app/src/main/assets/www");
const frappeOut = path.resolve(__dirname, "../pos_next/public/pos_scanner");
const wwwHtml = path.resolve(__dirname, "../pos_next/www/pos_scanner.html");

const isAndroidBuild = process.env.POS_SCANNER_ANDROID === "1";
const outDir = process.env.POS_SCANNER_OUT
	? path.resolve(process.env.POS_SCANNER_OUT)
	: isAndroidBuild
		? androidOut
		: frappeOut;

/**
 * After Frappe-hosted builds, emit a www shell that loads assets from
 * /assets/pos_next/pos_scanner/. Skipped for Android APK asset bundles.
 */
function emitFrappeWww() {
	return {
		name: "pos-scanner-frappe-www",
		apply: "build",
		async closeBundle() {
			if (isAndroidBuild || process.env.POS_SCANNER_SKIP_FRAPPE_WWW === "1") {
				console.log("\n✓ Android/offline build — skipped Frappe www emit");
				return;
			}
			const indexPath = path.join(outDir, "index.html");
			const html = await fs.readFile(indexPath, "utf8");
			await fs.mkdir(path.dirname(wwwHtml), { recursive: true });
			await fs.writeFile(wwwHtml, html, "utf8");
			console.log(`\n✓ Wrote Frappe www page: ${wwwHtml}`);
		},
	};
}

export default defineConfig({
	plugins: [vue(), emitFrappeWww()],
	base: process.env.POS_SCANNER_BASE || (isAndroidBuild ? "/www/" : "/"),
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
		sourcemap: !isAndroidBuild,
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
		include: ["src/**/*.spec.js", "tests/**/*.spec.js"],
	},
	optimizeDeps: {
		exclude: ["zxing-wasm"],
	},
});
