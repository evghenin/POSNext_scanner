# POSNext Scanner

Mobile camera scanner for [POSNext](https://github.com/evghenin/POSNext) / ERPNext: 1D/2D barcodes (zxing-wasm) plus OCR for printed `SKU#####` labels.

**Repository:** https://github.com/evghenin/POSNext_scanner

This app is **separate from** the POSNext Frappe app. POSNext keeps backend pairing / command-journal APIs; this repo owns the PWA and Android shells.

## Contents

| Path | Purpose |
|------|---------|
| `pos-scanner/` | Vue 3 + Vite PWA (camera, decode, settings, connection probe) |
| `android-scanner/` | Demo WebView APK with **bundled** UI/OCR + optional TWA flavor |
| `pos_next/www/` | Optional Frappe website page sources to host the PWA at `/pos-scanner` |
| `releases/` | Versioned ready-to-sideload APK builds |
| `docs/` | Hosting / hooks notes |

## Version

Current release: **0.2.0**

- Demo APK: [`releases/posnext-scanner-demo-0.2.0.apk`](./releases/posnext-scanner-demo-0.2.0.apk) — **offline UI + OCR inside APK**; server URL is API-only
- Previous: [`0.1.3`](./releases/posnext-scanner-demo-0.1.3.apk), [`0.1.2`](./releases/posnext-scanner-demo-0.1.2.apk), …

Bump the version in release filenames and git tags together (`vMAJOR.MINOR.PATCH`).

## Run the PWA (`pos-scanner`)

```bash
cd pos-scanner
npm ci
npm run dev          # local Vite; open the printed URL (HTTPS or localhost for camera)
npm test             # vitest
npm run build        # production assets → pos_next/public (optional host)
npm run build:android  # → android-scanner/app/src/main/assets/www
```

Camera needs a secure context (HTTPS or localhost). Configure **API** server URL in **Настройки**.

## Build Android APKs

Requirements: JDK 17+, Android SDK (API 35), Node 20+.

```bash
cd android-scanner
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"

# Builds Vue+OCR into assets, then the demo APK
./scripts/build-debug-apk.sh https://YOUR.SITE

# Output:
# app/build/outputs/apk/demo/debug/app-demo-debug.apk
```

Copy a release build into `releases/posnext-scanner-demo-X.Y.Z.apk` when shipping.

The demo WebView loads `https://appassets.androidplatform.net/www/` via `WebViewAssetLoader` — **not** `{host}/pos-scanner`. `-Pscanner.host` only sets a default API origin.

## How it talks to POSNext

1. **Offline APK (preferred on phone)** — UI, tessdata, tesseract workers, zxing WASM ship inside the package. Settings store the ERPNext **API** origin; native probe uses `frappe.ping`.
2. **Optional hosted PWA** — publish built assets + www page for browsers at `/pos-scanner` (see `docs/POSNEXT_HOST_HOOKS.md`). Not required for the APK.
3. **Pairing / cart APIs** — live in POSNext (`pos_next/api/mobile_scanner.py`). This repo does not re-implement the backend.

Typical flow: open APK → (optional) set API URL → open camera → decode barcode/SKU → (later) send to paired POS cart via POSNext APIs.

## Install notes

- **Sideload demo APK:** enable install from unknown sources; grant **Camera** when prompted.
- Prefer **HTTPS** ERPNext hosts with a valid certificate for API calls.
- OCR must show **OCR готов** without downloading language packs from the ERP CDN/WAF.
- TWA production builds need `assetlinks.json` if you still use a hosted PWA.

## License

Same project context as POSNext / Hotel Life mobile scanner work. See POSNext repository for app license unless otherwise noted.
