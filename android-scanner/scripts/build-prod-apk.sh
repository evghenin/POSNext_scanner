#!/usr/bin/env bash
# Build production sideload APK (prodRelease): no .demo.debug suffixes.
# Default API origin: https://erp.hotel-life.md (overridable).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/.." && pwd)"
HOST="${1:-https://erp.hotel-life.md}"

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

printf '%s\n' '# Built by npm run build:android (dist not committed).' \
	> "$ROOT/app/src/main/assets/www/.gitkeep"

if [[ ! -f "$ROOT/app/src/main/assets/www/index.html" ]]; then
	echo "Missing assets/www/index.html after build:android" >&2
	exit 1
fi

echo "==> Assembling production release APK…"
cd "$ROOT"
chmod +x ./gradlew 2>/dev/null || true

./gradlew :app:assembleProdRelease \
	-Pscanner.host="$HOST" \
	-Pscanner.path=

APK="$ROOT/app/build/outputs/apk/prod/release/app-prod-release.apk"
echo ""
echo "Built: $APK"
echo "Package: me.brainwise.posnext.scanner (prodRelease)"
echo "Default API host: $HOST"
echo "Install: adb install -r \"$APK\""
ls -lh "$APK"
