#!/usr/bin/env bash
# Build a sideloadable demo debug APK that loads https://HOST/pos-scanner in-app.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${1:-}"
PATH_SUFFIX="${2:-/pos-scanner}"

if [[ -z "$HOST" ]]; then
	echo "Usage: $0 https://your.erpnext.site [/pos-scanner]" >&2
	exit 1
fi

if [[ -z "${ANDROID_HOME:-}${ANDROID_SDK_ROOT:-}" ]]; then
	echo "Set ANDROID_HOME (or ANDROID_SDK_ROOT) to your Android SDK." >&2
	exit 1
fi

cd "$ROOT"
chmod +x ./gradlew 2>/dev/null || true

./gradlew :app:assembleDemoDebug \
	-Pscanner.host="$HOST" \
	-Pscanner.path="$PATH_SUFFIX"

APK="$ROOT/app/build/outputs/apk/demo/debug/app-demo-debug.apk"
echo ""
echo "Built: $APK"
echo "Install: adb install -r \"$APK\""
ls -lh "$APK"
