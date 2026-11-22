package me.brainwise.posnext.scanner;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.activity.EdgeToEdge;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebViewAssetLoader;

import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Fullscreen WebView shell that loads the Vue scanner from APK assets
 * via {@link WebViewAssetLoader} (secure https origin for camera/WASM/workers).
 *
 * <p>Server URL in settings is for Frappe/POSNext <strong>API only</strong> —
 * the UI, OCR tessdata, tesseract workers, and zxing WASM are bundled offline.
 */
public class WebViewScannerActivity extends AppCompatActivity implements ShellBridge.Host {
	private static final String TAG = "POSNextScanner";
	private static final String PREFS = "posnext_scanner_shell";
	private static final String KEY_SERVER_URL = "server_url";
	private static final String KEY_SCANNER_PATH = "scanner_path";
	private static final String KEY_CACHE_BUST = "asset_cache_bust";

	/** Virtual HTTPS origin served from android_asset/www/ (same-origin for workers). */
	private static final String ASSET_DOMAIN = "appassets.androidplatform.net";
	private static final String LOCAL_SCANNER_URL =
			"https://" + ASSET_DOMAIN + "/www/index.html";

	private static final String BOOTSTRAP_URL = "file:///android_asset/bootstrap/index.html";
	private static final String ERROR_URL = "file:///android_asset/error/index.html";
	private static final String LOADING_URL = "file:///android_asset/loading/index.html";

	private final Handler mainHandler = new Handler(Looper.getMainLooper());
	private WebView webView;
	private WebViewAssetLoader assetLoader;
	private final ExecutorService probeExecutor = Executors.newSingleThreadExecutor();
	private final AtomicInteger probeGeneration = new AtomicInteger(0);
	private volatile boolean suppressNextHttpError = false;

	@Nullable private PermissionRequest pendingWebPermission;
	private final ActivityResultLauncher<String> cameraPermissionLauncher =
			registerForActivityResult(
					new ActivityResultContracts.RequestPermission(),
					granted -> {
						if (pendingWebPermission == null) {
							return;
						}
						PermissionRequest request = pendingWebPermission;
						pendingWebPermission = null;
						try {
							if (granted) {
								request.grant(request.getResources());
							} else {
								request.deny();
							}
						} catch (Exception e) {
							Log.w(TAG, "Failed to settle web camera permission", e);
						}
					});

	@SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
	@Override
	protected void onCreate(@Nullable Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		EdgeToEdge.enable(this);

		FrameLayout root = new FrameLayout(this);
		root.setLayoutParams(
				new FrameLayout.LayoutParams(
						ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
		root.setBackgroundColor(Color.parseColor("#0B1220"));
		setContentView(root);

		webView = new WebView(this);
		root.addView(
				webView,
				new FrameLayout.LayoutParams(
						ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

		ViewCompat.setOnApplyWindowInsetsListener(
				root,
				(v, insets) -> {
					Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
					v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
					return insets;
				});

		assetLoader =
				new WebViewAssetLoader.Builder()
						.setDomain(ASSET_DOMAIN)
						.setHttpAllowed(false)
						.addPathHandler("/www/", new WebViewAssetLoader.AssetsPathHandler(this))
						.build();

		WebSettings settings = webView.getSettings();
		settings.setJavaScriptEnabled(true);
		settings.setDomStorageEnabled(true);
		settings.setDatabaseEnabled(true);
		settings.setMediaPlaybackRequiresUserGesture(false);
		settings.setAllowFileAccess(true);
		settings.setAllowContentAccess(false);
		settings.setCacheMode(WebSettings.LOAD_DEFAULT);
		settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
		settings.setUserAgentString(
				settings.getUserAgentString() + " POSNextScannerAPK/" + BuildConfig.VERSION_NAME);

		maybeClearWebViewCacheForUpgrade();

		webView.addJavascriptInterface(new ShellBridge(this), "PosNextShell");

		webView.setWebViewClient(
				new WebViewClient() {
					@Nullable
					@Override
					public WebResourceResponse shouldInterceptRequest(
							WebView view, WebResourceRequest request) {
						if (assetLoader != null && request != null && request.getUrl() != null) {
							WebResourceResponse local =
									assetLoader.shouldInterceptRequest(request.getUrl());
							if (local != null) {
								return local;
							}
						}
						return super.shouldInterceptRequest(view, request);
					}

					@Override
					public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
						Uri uri = request.getUrl();
						return !isAllowedUrl(uri);
					}

					@Override
					public void onReceivedHttpError(
							WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
						if (!request.isForMainFrame() || suppressNextHttpError) {
							return;
						}
						String url = request.getUrl() != null ? request.getUrl().toString() : "";
						if (isLocalAsset(url) || isBundledScannerUrl(url)) {
							return;
						}
						int code = errorResponse != null ? errorResponse.getStatusCode() : 0;
						String kind = code == 404 || code == 410 ? "not_found" : "server_error";
						if (code >= 500) {
							kind = "server_error";
						}
						showConnectionError(kind, url, code);
					}

					@Override
					public void onReceivedError(
							WebView view, WebResourceRequest request, WebResourceError error) {
						if (!request.isForMainFrame()) {
							return;
						}
						String url = request.getUrl() != null ? request.getUrl().toString() : "";
						if (isLocalAsset(url) || isBundledScannerUrl(url)) {
							return;
						}
						String kind = "unknown";
						if (error != null) {
							int code = error.getErrorCode();
							if (code == ERROR_HOST_LOOKUP) {
								kind = "dns";
							} else if (code == ERROR_TIMEOUT) {
								kind = "timeout";
							} else if (code == ERROR_FAILED_SSL_HANDSHAKE) {
								kind = "tls";
							} else if (code == ERROR_CONNECT || code == ERROR_IO) {
								kind = "unknown";
							}
						}
						showConnectionError(kind, url, null);
					}
				});

		webView.setWebChromeClient(
				new WebChromeClient() {
					@Override
					public void onPermissionRequest(final PermissionRequest request) {
						mainHandler.post(() -> handleWebPermissionRequest(request));
					}

					@Override
					public void onPermissionRequestCanceled(PermissionRequest request) {
						if (pendingWebPermission == request) {
							pendingWebPermission = null;
						}
					}
				});

		getOnBackPressedDispatcher()
				.addCallback(
						this,
						new OnBackPressedCallback(true) {
							@Override
							public void handleOnBackPressed() {
								if (webView != null && webView.canGoBack()) {
									webView.goBack();
								} else {
									setEnabled(false);
									getOnBackPressedDispatcher().onBackPressed();
								}
							}
						});

		ensureAndroidCameraPermission();
		startInitialNavigation();
	}

	private void startInitialNavigation() {
		// Always load bundled scanner UI. Deep links / remote /pos-scanner are not used for UI.
		if (!hasBundledScanner()) {
			loadLocal(BOOTSTRAP_URL);
			Toast.makeText(
							this,
							"Сборка без www-ассетов. Запустите npm run build:android.",
							Toast.LENGTH_LONG)
					.show();
			return;
		}
		openBundledScanner();
	}

	private boolean hasBundledScanner() {
		try {
			String[] list = getAssets().list("www");
			if (list == null) {
				return false;
			}
			for (String name : list) {
				if ("index.html".equals(name)) {
					return true;
				}
			}
		} catch (Exception e) {
			Log.w(TAG, "assets/www missing", e);
		}
		return false;
	}

	private void openBundledScanner() {
		assertMainThread();
		suppressNextHttpError = false;
		ensureAndroidCameraPermission();
		if (webView != null) {
			webView.loadUrl(withCacheBust(LOCAL_SCANNER_URL));
		}
	}

	private SharedPreferences prefs() {
		return getSharedPreferences(PREFS, MODE_PRIVATE);
	}

	@NonNull
	@Override
	public String getServerUrl() {
		String stored = prefs().getString(KEY_SERVER_URL, "");
		if (stored != null && !stored.isEmpty()) {
			return stored;
		}
		String baked = BuildConfig.SCANNER_ORIGIN;
		if (baked.contains("example.com") || baked.isEmpty()) {
			return "";
		}
		return baked;
	}

	@NonNull
	@Override
	public String getScannerPath() {
		String stored = prefs().getString(KEY_SCANNER_PATH, "");
		if (stored != null && !stored.isEmpty()) {
			return stored;
		}
		return "/pos-scanner";
	}

	@Override
	public boolean isOfflineBundle() {
		return true;
	}

	@Override
	public void applyServerConfig(@NonNull String serverUrl, @NonNull String scannerPath) {
		runOnMain(
				() -> {
					String origin = normalizeOrigin(serverUrl);
					String path = normalizePath(scannerPath);
					if (origin.isEmpty()) {
						prefs().edit().remove(KEY_SERVER_URL).putString(KEY_SCANNER_PATH, path).apply();
						openBundledScanner();
						return;
					}
					prefs()
							.edit()
							.putString(KEY_SERVER_URL, origin)
							.putString(KEY_SCANNER_PATH, path)
							.apply();
					// Soft API probe — UI stays local either way
					probeApiThenStayLocal(origin);
				});
	}

	@Override
	public void retryLastServer() {
		runOnMain(
				() -> {
					String origin = getServerUrl();
					if (origin.isEmpty() || origin.contains("example.com")) {
						openBundledScanner();
						return;
					}
					probeApiThenStayLocal(origin);
				});
	}

	private void probeApiThenStayLocal(@NonNull String origin) {
		assertMainThread();
		final int gen = probeGeneration.incrementAndGet();
		loadLocal(LOADING_URL);
		probeExecutor.execute(
				() -> {
					ScannerProbe.Result result;
					try {
						result = ScannerProbe.probeApi(origin);
					} catch (Throwable t) {
						Log.e(TAG, "API probe crashed", t);
						result = new ScannerProbe.Result(false, "unknown", null, origin);
					}
					final ScannerProbe.Result finalResult = result;
					runOnMain(
							() -> {
								if (gen != probeGeneration.get()) {
									return;
								}
								// Always return to bundled UI — OCR must not depend on remote assets.
								openBundledScanner();
								if (!finalResult.ok) {
									Toast.makeText(
													this,
													"API недоступен ("
															+ finalResult.kind
															+ "). OCR работает офлайн.",
													Toast.LENGTH_LONG)
											.show();
								}
							});
				});
	}

	private void showConnectionError(
			@NonNull String kind, @Nullable String url, @Nullable Integer status) {
		assertMainThread();
		suppressNextHttpError = true;
		String encodedUrl = "";
		try {
			encodedUrl = URLEncoder.encode(url == null ? "" : url, "UTF-8");
		} catch (UnsupportedEncodingException ignored) {
			encodedUrl = "";
		}
		String target =
				ERROR_URL
						+ "?kind="
						+ Uri.encode(kind)
						+ "&url="
						+ encodedUrl
						+ (status != null ? "&status=" + status : "");
		loadLocal(target);
	}

	private void loadLocal(@NonNull String url) {
		assertMainThread();
		if (webView != null) {
			webView.loadUrl(url);
		}
	}

	/** Drop HTTP cache when APK version changes so bundled assets refresh cleanly. */
	private void maybeClearWebViewCacheForUpgrade() {
		String current = BuildConfig.VERSION_NAME;
		String previous = prefs().getString(KEY_CACHE_BUST, "");
		if (current.equals(previous)) {
			return;
		}
		try {
			webView.clearCache(true);
			webView.clearHistory();
		} catch (Exception e) {
			Log.w(TAG, "WebView cache clear failed", e);
		}
		prefs().edit().putString(KEY_CACHE_BUST, current).apply();
	}

	@NonNull
	private static String withCacheBust(@NonNull String url) {
		String marker = "apk=" + Uri.encode(BuildConfig.VERSION_NAME);
		if (url.contains(marker)) {
			return url;
		}
		return url + (url.contains("?") ? "&" : "?") + marker;
	}

	private void runOnMain(@NonNull Runnable r) {
		if (Looper.myLooper() == Looper.getMainLooper()) {
			r.run();
		} else {
			mainHandler.post(r);
		}
	}

	private void assertMainThread() {
		if (Looper.myLooper() != Looper.getMainLooper()) {
			throw new IllegalStateException("WebView ops must run on main thread");
		}
	}

	private void ensureAndroidCameraPermission() {
		if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
				!= PackageManager.PERMISSION_GRANTED) {
			cameraPermissionLauncher.launch(Manifest.permission.CAMERA);
		}
	}

	private boolean isLocalAsset(@Nullable String url) {
		return url != null && url.startsWith("file:///android_asset/");
	}

	private boolean isBundledScannerUrl(@Nullable String url) {
		return url != null && url.contains(ASSET_DOMAIN);
	}

	private boolean isAllowedUrl(@Nullable Uri uri) {
		if (uri == null) {
			return false;
		}
		String scheme = uri.getScheme();
		if ("file".equalsIgnoreCase(scheme)) {
			String path = uri.getPath();
			return path != null
					&& (path.contains("/android_asset/bootstrap")
							|| path.contains("/android_asset/error")
							|| path.contains("/android_asset/loading")
							|| path.contains("/android_asset/www"));
		}
		if ("https".equalsIgnoreCase(scheme) && ASSET_DOMAIN.equalsIgnoreCase(uri.getHost())) {
			return true;
		}
		// Allow navigating to the configured API host only for completeness; UI stays local.
		if ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) {
			return uri.getHost() != null && !uri.getHost().isEmpty();
		}
		return false;
	}

	private static String normalizeOrigin(String raw) {
		String t = raw == null ? "" : raw.trim().replaceAll("/+$", "");
		if (t.isEmpty()) {
			return "";
		}
		if (!t.contains("://")) {
			t = "https://" + t;
		}
		try {
			Uri u = Uri.parse(t);
			String scheme = u.getScheme();
			String host = u.getHost();
			if (host == null || host.isEmpty()) {
				return "";
			}
			if (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme)) {
				return "";
			}
			if (ASSET_DOMAIN.equalsIgnoreCase(host)) {
				return "";
			}
			return scheme + "://" + host;
		} catch (Exception e) {
			return "";
		}
	}

	private static String normalizePath(String raw) {
		String p = raw == null || raw.trim().isEmpty() ? "/pos-scanner" : raw.trim();
		if (!p.startsWith("/")) {
			p = "/" + p;
		}
		p = p.replaceAll("/+$", "");
		return p.isEmpty() ? "/pos-scanner" : p;
	}

	private void handleWebPermissionRequest(PermissionRequest request) {
		boolean wantsCamera = false;
		for (String resource : request.getResources()) {
			if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)
					|| PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
				wantsCamera = wantsCamera || PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource);
			}
		}
		if (!wantsCamera) {
			request.deny();
			return;
		}
		if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
				== PackageManager.PERMISSION_GRANTED) {
			try {
				request.grant(new String[] {PermissionRequest.RESOURCE_VIDEO_CAPTURE});
			} catch (Exception e) {
				Log.w(TAG, "grant camera web permission failed", e);
				request.deny();
			}
			return;
		}
		pendingWebPermission = request;
		cameraPermissionLauncher.launch(Manifest.permission.CAMERA);
	}

	@Override
	protected void onDestroy() {
		probeExecutor.shutdownNow();
		if (webView != null) {
			webView.destroy();
			webView = null;
		}
		super.onDestroy();
	}
}
