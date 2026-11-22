#!/usr/bin/env bash
# Build a sideloadable demo debug APK with the Vue scanner + OCR bundled offline.
# Optional arg: API origin baked as default (still changeable in-app).
# Does NOT load remote /pos-scanner — UI comes from assets/www via WebViewAssetLoader.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/.." && pwd)"
HOST="${1:-https://example.com}"

if [[ -z "${ANDROID_HOME:-}${ANDROID_SDK_ROOT:-}" ]]; then
	echo "Set ANDROID_HOME (or ANDROID_SDK_ROOT) to your Android SDK." >&2
	exit 1
fi

echo "==> Building Vue scanner into android assets (offline OCR/WASM)…"
cd "$REPO/pos-scanner"
if [[ ! -d node_modules ]]; then
	npm ci
fi
npm run build:android

# Vite emptyOutDir removes .gitkeep; restore the tracked placeholder.
printf '%s\n' '# Built by npm run build:android (dist not committed).' \
	> "$ROOT/app/src/main/assets/www/.gitkeep"

if [[ ! -f "$ROOT/app/src/main/assets/www/index.html" ]]; then
	echo "Missing assets/www/index.html after build:android" >&2
	exit 1
fi

echo "==> Assembling demo debug APK…"
cd "$ROOT"
chmod +x ./gradlew 2>/dev/null || true

./gradlew :app:assembleDemoDebug \
	-Pscanner.host="$HOST" \
	-Pscanner.path=

APK="$ROOT/app/build/outputs/apk/demo/debug/app-demo-debug.apk"
echo ""
echo "Built: $APK"
echo "UI: bundled android_asset/www (WebViewAssetLoader) — not /pos-scanner"
echo "Default API host property: $HOST (overridable in settings)"
echo "Install: adb install -r \"$APK\""
ls -lh "$APK"
