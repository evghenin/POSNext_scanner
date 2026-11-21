# POSNext Mobile Scanner — recognition prototype

Isolated PWA-style Vue app that proves **camera barcode decode + OCR for printed `SKU#####`** without pairing or cart modes.

Path: `pos-scanner/` (separate from the `/pos` till SPA per [fork audit](../docs) recommendation).

## Stack

| Concern | Choice | Why |
|--------|--------|-----|
| 1D/2D | **`zxing-wasm`** (ZXing-C++ WASM) | Covers EAN-8/13, UPC-A/E, Code 39/128, QR, Data Matrix, PDF417 in one engine; works where native `BarcodeDetector` is missing or broken (Safari/iOS). |
| Fast path | Native **`BarcodeDetector`** when `getSupportedFormats()` includes retail formats | Chrome Android only in practice; never relied on alone. |
| OCR | **`tesseract.js` v5** (eng) | Browser WASM OCR; crop to reticle; regex `\bSKU\d{5}\b` → uppercase; multi-match → picker. |
| UI | Vue 3 + Vite | Matches POSNext frontend toolchain; tiny surface area. |
| Lookup | Mock catalog | Swap later for `pos_next.api.items.search_by_barcode`. |

## Run locally

```bash
cd pos-scanner
npm install
npm run dev
```

Open the printed URL (default `http://localhost:5174`). Camera requires **localhost or HTTPS**.

```bash
npm test          # unit tests (SKU regex, dedupe)
npm run build     # → ../pos_next/public/pos_scanner
```

### Frappe / bench (optional)

After `npm run build`, copy or Jinja-serve the page:

- Assets: `pos_next/public/pos_scanner/`
- Website page: `pos_next/www/pos_scanner.html`
- Route rule in `pos_next/hooks.py`: `/pos-scanner` → `pos_scanner`

```bash
cd pos-scanner
POS_SCANNER_BASE=/assets/pos_next/pos_scanner/ npm run build
# then: bench clear-cache / reload
# open https://<site>/pos-scanner
```

## Behaviour (TZ §5 / A03–A05)

1. Camera preview + center **reticle**; optional **torch** via `MediaTrackConstraints.torch` when supported (often Android Chrome; often missing on iOS Safari).
2. Decode loop (~180 ms): barcode in reticle first; **OCR only if no barcode**.
3. One match → mock lookup card; **several matches → user picker** (never silent pick).
4. **Dedupe** ~2.8 s so one physical code does not spam; intentional rescan after dismiss/add.
5. Feedback stubs: short beep + `navigator.vibrate` for recognized / added / error.
6. Manual entry fallback if camera denied.

## Offline / cache size (expected)

| Asset | Approx size | Notes |
|-------|-------------|--------|
| App JS/CSS | ~50–150 KB gzip | Without engines |
| `zxing-wasm` reader | ~1 MB WASM | Same-origin; precache in SW |
| Tesseract core + eng | ~5–9 MB | **Must precache** worker + core + `eng.traineddata` before offline OCR |
| Total cold cache | ~8–12 MB | Acceptable for staff PWA; gate OCR behind “download language pack” if needed |

Dev currently loads Tesseract assets from jsDelivr — **production must vendor them** under `public/ocr/` and list them in Workbox `globPatterns` / `additionalManifestEntries`.

## Safari / iOS constraints (honest)

- **`BarcodeDetector`**: not usable as sole engine (flagged / broken on iOS WebKit). Prototype always has zxing-wasm fallback.
- **Camera**: `getUserMedia` works on HTTPS / installed PWA; prefer Safari (third-party browsers on iOS use WebKit with historical camera quirks).
- **Torch**: commonly unsupported in Safari — UI hides the control when `getCapabilities().torch` is absent.
- **Autoplay / playsinline**: video uses `playsinline` + `muted`.
- **PDF417 / Data Matrix**: expected via zxing-wasm; **must be confirmed on device matrix (A03/A20)** — not proven in CI.
- **OCR performance**: heavier than barcode; throttled; expect hundreds of ms–1 s+ per pass on older phones.

## Out of scope here

Pairing, cart modes, POS ACK, service-worker production hardening, real `search_by_barcode` session auth.
