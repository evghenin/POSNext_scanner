# Host `/pos-scanner` on a POSNext / ERPNext site (optional)

These website routes are **not** in `evghenin/POSNext` git (scanner UI lives here: https://github.com/evghenin/POSNext_scanner).

**Phone APK 0.2.0+** bundles the scanner UI/OCR offline and does **not** need this host.
Keep `/pos-scanner` only if you want a browser/TWA entry point. Server minimum for the
phone remains pairing/session + cart APIs.

Add to the site app `hooks.py` when serving this PWA:

```python
website_route_rules = [
    {"from_route": "/pos/<path:app_path>", "to_route": "pos"},
    {"from_route": "/pos-scanner", "to_route": "pos_scanner"},
    {"from_route": "/pos-scanner/<path:app_path>", "to_route": "pos_scanner"},
]
```

Copy `pos_next/www/pos_scanner.html` and `pos_scanner.py` from this repo into the installed app, build `pos-scanner` (`npm run build`), and publish assets (e.g. under `public/pos_scanner/`).
