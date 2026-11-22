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

import org.json.JSONException;
import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Fullscreen WebView shell that loads the Vue scanner from APK assets
 * via {@link WebViewAssetLoader} (secure https origin for camera/WASM/workers).
 *
 * <p>Server URL in settings is for Frappe/POSNext <strong>API only</strong> —
 * the UI, OCR tessdata, tesseract workers, and zxing WASM are bundled offline.
 * The shell never navigates to a remote {@code /pos-scanner} page.
 */
public class WebViewScannerActivity extends AppCompatActivity implements ShellBridge.Host {
	private static final String TAG = "POSNextScanner";
	private static final String PREFS = "posnext_scanner_shell";
	private static final String KEY_SERVER_URL = "server_url";
	private static final String KEY_CACHE_BUST = "asset_cache_bust";

	/** Virtual HTTPS origin served from android_asset/www/ (same-origin for workers). */
	private static final String ASSET_DOMAIN = "appassets.androidplatform.net";
	private static final String LOCAL_SCANNER_URL =
			"https://" + ASSET_DOMAIN + "/www/index.html";

	private static final String BOOTSTRAP_URL = "file:///android_asset/bootstrap/index.html";

	private final Handler mainHandler = new Handler(Looper.getMainLooper());
	private WebView webView;
	private WebViewAssetLoader assetLoader;
	private final ExecutorService probeExecutor = Executors.newSingleThreadExecutor();

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

		// Path prefix /www/ must map to assets/www/… — stock AssetsPathHandler strips the
		// prefix and opens from the assets root, which caused ERR_INVALID_RESPONSE on launch.
		assetLoader =
				new WebViewAssetLoader.Builder()
						.setDomain(ASSET_DOMAIN)
						.setHttpAllowed(false)
						.addPathHandler("/www/", new BundledWwwAssetsHandler(this))
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
							// Never return an empty intercept (null stream) — that is
							// net::ERR_INVALID_RESPONSE in Chromium WebView.
							if (local != null && local.getData() != null) {
								return local;
							}
							if (local != null) {
								Log.w(TAG, "AssetLoader empty response for " + request.getUrl());
							}
						}
						return super.shouldInterceptRequest(view, request);
					}

					@Override
					public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
						Uri uri = request.getUrl();
						// Never leave the bundled UI for a remote /pos-scanner (or any remote page).
						if (isRemoteUiNavigation(uri)) {
							Log.i(TAG, "Blocked remote UI navigation: " + uri);
							openBundledScanner();
							return true;
						}
						return !isAllowedUrl(uri);
					}

					@Override
					public void onReceivedHttpError(
							WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
						if (!request.isForMainFrame()) {
							return;
						}
						String url = request.getUrl() != null ? request.getUrl().toString() : "";
						if (isLocalAsset(url) || isBundledScannerUrl(url)) {
							return;
						}
						// Remote main-frame errors should not hijack the offline UI.
						Log.w(TAG, "Ignoring remote HTTP error on " + url);
						openBundledScanner();
					}

					@Override
					public void onReceivedError(
							WebView view, WebResourceRequest request, WebResourceError error) {
						if (!request.isForMainFrame()) {
							return;
						}
						String url = request.getUrl() != null ? request.getUrl().toString() : "";
						if (isLocalAsset(url)) {
							return;
						}
						if (isBundledScannerUrl(url)) {
							String desc =
									error != null && error.getDescription() != null
											? error.getDescription().toString()
											: "unknown";
							Log.e(TAG, "Bundled scanner failed to load: " + url + " (" + desc + ")");
							loadLocal(BOOTSTRAP_URL);
							Toast.makeText(
											WebViewScannerActivity.this,
											"Ошибка загрузки локального UI (" + desc + ")",
											Toast.LENGTH_LONG)
									.show();
							return;
						}
						Log.w(TAG, "Ignoring remote load error on " + url);
						openBundledScanner();
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
		// Empty until the user saves settings (UX v2). Baked BuildConfig is only a UI placeholder.
		String stored = prefs().getString(KEY_SERVER_URL, "");
		return stored != null ? stored : "";
	}

	@NonNull
	@Override
	public String getScannerPath() {
		// Offline APK does not use a hosted PWA path.
		return "";
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
					SharedPreferences.Editor edit = prefs().edit();
					if (origin.isEmpty()) {
						edit.remove(KEY_SERVER_URL);
					} else {
						edit.putString(KEY_SERVER_URL, origin);
					}
					edit.apply();
					// Never navigate to remote /pos-scanner; keep (or restore) local UI.
					String current = webView != null ? webView.getUrl() : null;
					if (!isBundledScannerUrl(current) && !isLocalAsset(current)) {
						openBundledScanner();
					}
				});
	}

	@Override
	public void retryLastServer() {
		runOnMain(this::openBundledScanner);
	}

	@Override
	public void probeApi(@NonNull String serverUrl, @NonNull String callbackId) {
		final String origin = normalizeOrigin(serverUrl.isEmpty() ? getServerUrl() : serverUrl);
		final String cb = callbackId;
		if (cb.isEmpty()) {
			return;
		}
		probeExecutor.execute(
				() -> {
					ScannerProbe.Result result;
					try {
						result =
								origin.isEmpty()
										? new ScannerProbe.Result(false, "invalid_url", null, "")
										: ScannerProbe.probeApi(origin);
					} catch (Throwable t) {
						Log.e(TAG, "API probe crashed", t);
						result = new ScannerProbe.Result(false, "unknown", null, origin);
					}
					deliverProbeResult(cb, result);
				});
	}

	private void deliverProbeResult(@NonNull String callbackId, @NonNull ScannerProbe.Result result) {
		JSONObject o = new JSONObject();
		try {
			o.put("ok", result.ok);
			o.put("kind", result.kind);
			if (result.status != null) {
				o.put("status", result.status.intValue());
			} else {
				o.put("status", JSONObject.NULL);
			}
			o.put("url", result.url);
		} catch (JSONException ignored) {
			/* empty */
		}
		final String json = o.toString();
		final String idEsc = callbackId.replace("\\", "\\\\").replace("'", "\\'");
		final String jsonEsc = json.replace("\\", "\\\\").replace("'", "\\'");
		runOnMain(
				() -> {
					if (webView == null) {
						return;
					}
					webView.evaluateJavascript(
							"window.__posNextProbeDone && window.__posNextProbeDone('"
									+ idEsc
									+ "','"
									+ jsonEsc
									+ "')",
							null);
				});
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

	/** True for any http(s) main-frame navigation that is not the AssetLoader UI. */
	private boolean isRemoteUiNavigation(@Nullable Uri uri) {
		if (uri == null) {
			return false;
		}
		String scheme = uri.getScheme();
		if (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme)) {
			return false;
		}
		String host = uri.getHost();
		if (host == null || host.isEmpty()) {
			return false;
		}
		return !ASSET_DOMAIN.equalsIgnoreCase(host);
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
		// Block remote main-frame loads (API traffic uses XHR, not navigation).
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
