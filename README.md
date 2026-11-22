# POSNext Mobile Scanner

Camera recognition PWA (`pos-scanner/`) and Android APK wrapper (`android-scanner/`) for POSNext / ERPNext.

Split out of [`evghenin/POSNext`](https://github.com/evghenin/POSNext) so scanner UI/APK source is not part of the Frappe app history.

## Contents

| Path | Description |
|------|-------------|
| `pos-scanner/` | Vue/Vite PWA — zxing-wasm + tesseract OCR SKU |
| `android-scanner/` | TWA + demo WebView APK shell |
| `pos_next/www/pos_scanner.*` | Optional Frappe website page to host the built PWA at `/pos-scanner` |

Backend pairing / command journal APIs stay in **POSNext** (`pos_next/api/mobile_scanner.py`, `pos_mobile_*` DocTypes).

## Host on POSNext / ERPNext

1. Build the PWA: `cd pos-scanner && npm ci && npm run build`
2. Publish assets to the site (e.g. `pos_next/public/pos_scanner/`)
3. Copy `pos_next/www/pos_scanner.html` + `pos_scanner.py` into the installed POSNext app (or your site app)
4. Add website routes in `hooks.py`:

```python
website_route_rules = [
    {"from_route": "/pos/<path:app_path>", "to_route": "pos"},
    {"from_route": "/pos-scanner", "to_route": "pos_scanner"},
    {"from_route": "/pos-scanner/<path:app_path>", "to_route": "pos_scanner"},
]
```

## Android demo APK

```bash
cd android-scanner
./gradlew :app:assembleDemoDebug -Pscanner.host=https://YOUR.SITE -Pscanner.path=/pos-scanner
```

See `android-scanner/README.md` and `pos-scanner/README.md`.
