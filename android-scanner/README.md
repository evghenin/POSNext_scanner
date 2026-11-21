# POSNext Scanner — Android APK wrapper

Sideloadable Android shell for the recognition PWA at **`/pos-scanner`**.

Decoding stays **inside the page** (zxing-wasm + tesseract). This APK does **not** call Barcode Scanner / ZXing Intent or any external scan app.

## Why TWA (+ demo WebView)

| Flavor | Shell | When to use |
|--------|--------|-------------|
| **`twa`** | Chrome [Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity) via `androidbrowserhelper` | Production: verified HTTPS host + Digital Asset Links → fullscreen Chrome, shared PWA cache/SW |
| **`demo`** | In-app `WebView` + camera permission bridge | Sideload / CI debug **before** Asset Links exist — still fullscreen, same URL |

Capacitor was not chosen: we do not need a second JS runtime or offline asset bundle yet; the PWA remains the source of truth.

## Package

- Application id: `me.brainwise.posnext.scanner`
- Demo debug id: `me.brainwise.posnext.scanner.demo.debug`
- TWA debug id: `me.brainwise.posnext.scanner.debug`

## Build debug APK

Requirements: JDK 17+, Android SDK (API 35), network for Gradle deps.

```bash
# one-time SDK (example paths — see docs/android-apk-wrapper.md)
export ANDROID_HOME=$HOME/Android/Sdk
export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools"

cd android-scanner

# Point at your HTTPS ERPNext / POSNext site that serves /pos-scanner
./gradlew :app:assembleDemoDebug \
  -Pscanner.host=https://YOUR.SITE \
  -Pscanner.path=/pos-scanner

# APK:
# app/build/outputs/apk/demo/debug/app-demo-debug.apk
```

Install:

```bash
adb install -r app/build/outputs/apk/demo/debug/app-demo-debug.apk
```

TWA flavor (needs Digital Asset Links on the host or Chrome shows a URL bar):

```bash
./gradlew :app:assembleTwaDebug -Pscanner.host=https://YOUR.SITE
```

### Helper script

```bash
./scripts/build-debug-apk.sh https://YOUR.SITE
```

## Release signing (no Play secrets in repo)

```bash
# Generate a local upload key (keep outside git)
keytool -genkeypair -v -keystore posnext-scanner-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias posnext-scanner

# app/build.gradle.kts: wire signingConfigs.release from env or local.properties
# Then:
./gradlew :app:assembleTwaRelease -Pscanner.host=https://YOUR.SITE
```

Publish `/.well-known/assetlinks.json` from `digital-asset-links.template.json` with the **release** (and optionally debug) cert SHA-256.

Get fingerprint:

```bash
keytool -list -v -keystore posnext-scanner-upload.jks -alias posnext-scanner
# or for debug:
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

## Camera

- Manifest: `CAMERA` (+ optional camera features not required)
- Demo WebView: grants `PermissionRequest.RESOURCE_VIDEO_CAPTURE` after runtime permission
- TWA: Chrome handles getUserMedia; site must be HTTPS

## iOS

Out of scope (no App Store wrapper in this PR).
