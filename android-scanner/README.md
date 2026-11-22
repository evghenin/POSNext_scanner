# POSNext Scanner — Android APK wrapper

Sideloadable Android shell with the **Vue scanner UI + OCR/WASM bundled inside the APK**.

Decoding stays **inside the page** (zxing-wasm + tesseract). Assets load via
`WebViewAssetLoader` (`https://appassets.androidplatform.net/www/…`) — not from
`/pos-scanner` on the ERP host. The in-app **server URL is API-only** (pairing / cart).

## Flavors

| Flavor | Shell | When to use |
|--------|--------|-------------|
| **`demo`** | In-app `WebView` + camera bridge + offline assets | Sideload / day-to-day phone use |
| **`twa`** | Chrome Trusted Web Activity | Optional production path if you still host a PWA + Asset Links |

## Package

- Application id: `me.brainwise.posnext.scanner`
- Demo debug id: `me.brainwise.posnext.scanner.demo.debug`
- Version: see `app/build.gradle.kts` (`0.2.2+`)
- Asset mapping: `/www/` → `assets/www/` via `BundledWwwAssetsHandler` (not stock `AssetsPathHandler`)

## Build debug APK

Requirements: JDK 17+, Android SDK (API 35), Node 20+ (to build `pos-scanner` assets).

```bash
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
cd android-scanner

# Builds Vue → assets/www, then assembles the APK
# Optional arg: default API origin (overridable in settings)
./scripts/build-debug-apk.sh https://YOUR.SITE

# or manually:
cd ../pos-scanner && npm ci && npm run build:android
cd ../android-scanner
./gradlew :app:assembleDemoDebug -Pscanner.host=https://YOUR.SITE
```

APK: `app/build/outputs/apk/demo/debug/app-demo-debug.apk`

## What is bundled

Under `app/src/main/assets/www/` (generated, not committed):

- Vue app (`index.html`, JS chunks)
- `ocr/` — tesseract worker, LSTM wasm/js, `eng.traineddata.gz(.js)`
- zxing WASM (via Vite chunk)
- PWA manifest / icon

## Server URL

SharedPreferences + `PosNextShell` store the ERPNext **API origin**. Saving it never
navigates to `/pos-scanner`; the WebView stays on bundled `www/`. An optional background
`frappe.ping` may toast if the API is down. Camera/OCR work without a reachable server.

## Camera

- Manifest: `CAMERA`
- Demo WebView: grants `RESOURCE_VIDEO_CAPTURE` after runtime permission
- Secure context: `appassets.androidplatform.net` (AssetLoader)

## iOS

Out of scope.
