package me.brainwise.posnext.scanner;

import android.content.Context;
import android.content.res.AssetManager;
import android.util.Log;
import android.webkit.MimeTypeMap;
import android.webkit.WebResourceResponse;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.webkit.WebViewAssetLoader;

import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;

/**
 * Serves {@code android_asset/www/**} for URLs under {@code /www/}.
 *
 * <p>{@link WebViewAssetLoader.AssetsPathHandler} strips the matched path prefix and opens the
 * remainder from the assets <em>root</em>. Registering {@code /www/} therefore looked for {@code
 * assets/index.html} instead of {@code assets/www/index.html}, and a missing open returns an empty
 * {@link WebResourceResponse} that surfaces as {@code net::ERR_INVALID_RESPONSE}.
 *
 * <p>This handler re-prefixes {@code www/}, sets MIME types (including {@code application/wasm}),
 * and returns {@code null} when the asset is missing so WebView does not treat an empty body as a
 * successful intercept.
 */
final class BundledWwwAssetsHandler implements WebViewAssetLoader.PathHandler {
	private static final String TAG = "POSNextScanner";
	private static final String ASSET_ROOT = "www";

	private final AssetManager assetManager;

	BundledWwwAssetsHandler(@NonNull Context context) {
		this.assetManager = context.getApplicationContext().getAssets();
	}

	@Nullable
	@Override
	public WebResourceResponse handle(@NonNull String path) {
		String relative = path.startsWith("/") ? path.substring(1) : path;
		// Reject path traversal; AssetManager alone is not enough to refuse ".." segments.
		if (relative.contains("..")) {
			Log.w(TAG, "Rejected asset path traversal: " + path);
			return null;
		}
		String assetPath = relative.isEmpty() ? ASSET_ROOT + "/index.html" : ASSET_ROOT + "/" + relative;
		try {
			InputStream stream = assetManager.open(assetPath, AssetManager.ACCESS_STREAMING);
			String mime = guessMimeType(assetPath);
			return new WebResourceResponse(
					mime,
					/* encoding */ null,
					/* statusCode */ 200,
					/* reasonPhrase */ "OK",
					/* responseHeaders */ Collections.singletonMap("Cache-Control", "no-cache"),
					stream);
		} catch (IOException e) {
			Log.w(TAG, "Bundled asset missing: " + assetPath, e);
			return null;
		}
	}

	@NonNull
	private static String guessMimeType(@NonNull String assetPath) {
		String lower = assetPath.toLowerCase();
		if (lower.endsWith(".html") || lower.endsWith(".htm")) {
			return "text/html";
		}
		if (lower.endsWith(".js") || lower.endsWith(".mjs")) {
			return "text/javascript";
		}
		if (lower.endsWith(".css")) {
			return "text/css";
		}
		if (lower.endsWith(".json") || lower.endsWith(".map")) {
			return "application/json";
		}
		if (lower.endsWith(".wasm")) {
			return "application/wasm";
		}
		if (lower.endsWith(".svg")) {
			return "image/svg+xml";
		}
		if (lower.endsWith(".png")) {
			return "image/png";
		}
		if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
			return "image/jpeg";
		}
		if (lower.endsWith(".webp")) {
			return "image/webp";
		}
		if (lower.endsWith(".woff2")) {
			return "font/woff2";
		}
		if (lower.endsWith(".woff")) {
			return "font/woff";
		}
		if (lower.endsWith(".ttf")) {
			return "font/ttf";
		}
		if (lower.endsWith(".gz")) {
			return "application/gzip";
		}
		String ext = MimeTypeMap.getFileExtensionFromUrl(assetPath.replace(' ', '_'));
		if (ext != null && !ext.isEmpty()) {
			String mapped = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
			if (mapped != null && !mapped.isEmpty()) {
				return mapped;
			}
		}
		return "application/octet-stream";
	}
}
