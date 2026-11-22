# POSNext Scanner

Mobile camera scanner for [POSNext](https://github.com/evghenin/POSNext) / ERPNext: 1D/2D barcodes (zxing-wasm) plus OCR for printed `SKU#####` labels.

**Repository:** https://github.com/evghenin/POSNext_scanner

This app is **separate from** the POSNext Frappe app. POSNext keeps backend pairing / command-journal APIs; this repo owns the PWA and Android shells.

## Contents

| Path | Purpose |
|------|---------|
| `pos-scanner/` | Vue 3 + Vite PWA (camera, decode, settings, connection probe) |
| `android-scanner/` | Android TWA + demo WebView APK wrapper |
| `pos_next/www/` | Optional Frappe website page sources to host the PWA at `/pos-scanner` |
| `releases/` | Versioned ready-to-sideload APK builds |
| `docs/` | Hosting / hooks notes |

## Version

Current release: **0.1.2**

- Demo APK: [`releases/posnext-scanner-demo-0.1.2.apk`](./releases/posnext-scanner-demo-0.1.2.apk)
- Previous: [`releases/posnext-scanner-demo-0.1.1.apk`](./releases/posnext-scanner-demo-0.1.1.apk), [`0.1.0`](./releases/posnext-scanner-demo-0.1.0.apk)
- GitHub Release: tag `vMAJOR.MINOR.PATCH` when published

Bump the version in release filenames and git tags together (`vMAJOR.MINOR.PATCH`).

## Run the PWA (`pos-scanner`)

```bash
cd pos-scanner
npm ci
npm run dev          # local Vite; open the printed URL (HTTPS or localhost for camera)
npm test             # vitest
npm run build        # production assets → dist/
```

Camera needs a secure context (HTTPS or localhost). Configure server URL / path in the in-app **Настройки** panel (or via the Android demo bootstrap screen).

## Build Android APKs

Requirements: JDK 17+, Android SDK (API 35).

```bash
cd android-scanner
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"

# Demo WebView shell (sideload; in-app server URL; camera permission bridge)
./gradlew :app:assembleDemoDebug \
  -Pscanner.host=https://YOUR.SITE \
  -Pscanner.path=/pos-scanner

# Output:
# app/build/outputs/apk/demo/debug/app-demo-debug.apk

# TWA (needs Digital Asset Links on the host)
./gradlew :app:assembleTwaDebug -Pscanner.host=https://YOUR.SITE
```

Helper: `./scripts/build-debug-apk.sh https://YOUR.SITE`

Copy a release build into `releases/posnext-scanner-demo-X.Y.Z.apk` when shipping.

## How it talks to POSNext

1. **Hosted PWA route (optional)** — publish built assets and the www page so `https://your-site/pos-scanner` serves the scanner. Add routes in the site’s `hooks.py` (see `docs/POSNEXT_HOST_HOOKS.md`). Those routes are **not** shipped inside POSNext git anymore.
2. **Demo APK** — bootstrap / `PosNextShell` bridge stores HTTPS origin + path, probes the scanner URL (native HTTP), then loads the remote PWA or a local RU error page. No external barcode Intent apps.
3. **Pairing / cart APIs** — live in POSNext (`pos_next/api/mobile_scanner.py`, DocTypes `pos_mobile_*`). The phone pairs to a POS session and pushes scan operations through those whitelisted endpoints; this repo does not re-implement the backend.

Typical flow: open scanner → configure ERPNext host → open camera → decode barcode/SKU → (later phases) search item → send to paired POS cart via POSNext APIs.

## Install notes

- **Sideload demo APK:** enable install from unknown sources; grant **Camera** when prompted.
- Prefer **HTTPS** ERPNext hosts with a valid certificate.
- If `/pos-scanner` is missing on the server, the app shows a local Russian error screen (not ERPNext’s raw 404).
- TWA production builds need `assetlinks.json` for the release signing cert (template: `android-scanner/digital-asset-links.template.json`).

## License

Same project context as POSNext / Hotel Life mobile scanner work. See POSNext repository for app license unless otherwise noted.
