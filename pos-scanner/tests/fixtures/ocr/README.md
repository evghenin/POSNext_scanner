# OCR recognition fixtures

Still images for `tests/ocr-fixtures.spec.js` (also run via `npm test` / CI).

| File | Expected | Source |
|------|----------|--------|
| `sku00776-a.png` | `SKU00776` | Hotel Life shelf tag (Project store `media/ocr-shelf-tags/`) |
| `sku00776-b.png` | `SKU00776` | same |
| `sku00668-prija.png` | `SKU00668` | same |
| `nsu00001-synthetic.png` | `NSU00001` | Generated print (no phone photo) |
| `srv00001-synthetic.png` | `SRV00001` | Generated print (no phone photo) |

Regenerate synthetics (optional):

```bash
node scripts/generate-ocr-synthetics.mjs
```
