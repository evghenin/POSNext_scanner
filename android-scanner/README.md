# POSNext Scanner — Android APK wrapper

Sideloadable Android shell with the **Vue scanner UI + OCR/WASM bundled inside the APK**.

Decoding stays **inside the page** (zxing-wasm + tesseract). Assets load via
`WebViewAssetLoader` (`https://appassets.androidplatform.net/www/…`) — not from
`/pos-scanner` on the ERP host. The in-app **server URL is API-only** (pairing / cart).

## Flavors

| Flavor | Shell | When to use |
|--------|--------|-------------|
| **`prod`** | In-app `WebView`, package `me.brainwise.posnext.scanner` | **Production sideload** (default) |
| **`demo`** | Same WebView + `.demo` / `.debug` suffixes | Optional debug sideload |
| **`twa`** | Chrome Trusted Web Activity | Optional if hosting a PWA + Asset Links |

## Package

- Production id: `me.brainwise.posnext.scanner`
- Version: see `app/build.gradle.kts` (`0.3.0+`)
- Default API: `https://erp.hotel-life.md`
- Asset mapping: `/www/` → `assets/www/` via `BundledWwwAssetsHandler`
- Live frames coerced to ImageData/canvas before zxing / tesseract

## Build production APK

```bash
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
cd android-scanner
./scripts/build-prod-apk.sh https://erp.hotel-life.md
# → app/build/outputs/apk/prod/release/app-prod-release.apk
```

## Build demo debug APK (optional)

```bash
./scripts/build-debug-apk.sh https://erp.hotel-life.md
# → app/build/outputs/apk/demo/debug/app-demo-debug.apk
```

## What is bundled

Under `app/src/main/assets/www/` (generated, not committed):

- Vue app (`index.html`, JS chunks)
- `ocr/` — tesseract worker, LSTM wasm/js, `eng.traineddata.gz(.js)`
- zxing WASM (via Vite chunk)

## Server URL

SharedPreferences + `PosNextShell` store the ERPNext **API origin** (default Hotel Life).
Camera/OCR work without a reachable server; pairing/cart need network later.

## Camera

- Manifest: `CAMERA`
- WebView: grants `RESOURCE_VIDEO_CAPTURE` after runtime permission
- Secure context: `appassets.androidplatform.net` (AssetLoader)

## iOS

Out of scope.
