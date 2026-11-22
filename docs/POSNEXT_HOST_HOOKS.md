# Host `/pos-scanner` on a POSNext / ERPNext site

These website routes are **not** in `evghenin/POSNext` git (scanner UI lives here: https://github.com/evghenin/POSNext_scanner).

Add to the site app `hooks.py` when serving this PWA:

```python
website_route_rules = [
    {"from_route": "/pos/<path:app_path>", "to_route": "pos"},
    {"from_route": "/pos-scanner", "to_route": "pos_scanner"},
    {"from_route": "/pos-scanner/<path:app_path>", "to_route": "pos_scanner"},
]
```

Copy `pos_next/www/pos_scanner.html` and `pos_scanner.py` from this repo into the installed app, build `pos-scanner` (`npm run build`), and publish assets (e.g. under `public/pos_scanner/`).
