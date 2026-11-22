# POSNext host hooks (not shipped inside POSNext git)

These routes were removed from `evghenin/POSNext` when the scanner app moved here.
Add them only on sites that serve this PWA:

```python
{"from_route": "/pos-scanner", "to_route": "pos_scanner"},
{"from_route": "/pos-scanner/<path:app_path>", "to_route": "pos_scanner"},
```

Website page sources: `pos_next/www/pos_scanner.html`, `pos_next/www/pos_scanner.py`.
