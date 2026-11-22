package me.brainwise.posnext.scanner;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
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

import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Fullscreen WebView shell that loads the POSNext /pos-scanner PWA.
 * Probes the remote scanner URL before navigation and never leaves the user
 * on Frappe's raw 404 HTML ("Здесь ничего нет").
 */
public class WebViewScannerActivity extends AppCompatActivity implements ShellBridge.Host {
	private static final String PREFS = "posnext_scanner_shell";
	private static final String KEY_SERVER_URL = "server_url";
	private static final String KEY_SCANNER_PATH = "scanner_path";
	private static final String BOOTSTRAP_URL = "file:///android_asset/bootstrap/index.html";
	private static final String ERROR_URL = "file:///android_asset/error/index.html";
	private static final String LOADING_URL = "file:///android_asset/loading/index.html";

	private WebView webView;
	private final ExecutorService probeExecutor = Executors.newSingleThreadExecutor();
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
						if (granted) {
							request.grant(request.getResources());
						} else {
							request.deny();
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

		WebSettings settings = webView.getSettings();
		settings.setJavaScriptEnabled(true);
		settings.setDomStorageEnabled(true);
		settings.setMediaPlaybackRequiresUserGesture(false);
		settings.setAllowFileAccess(true);
		settings.setAllowContentAccess(false);
		settings.setCacheMode(WebSettings.LOAD_DEFAULT);
		settings.setUserAgentString(settings.getUserAgentString() + " POSNextScannerAPK/0.1");

		webView.addJavascriptInterface(new ShellBridge(this), "PosNextShell");

		webView.setWebViewClient(
				new WebViewClient() {
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
						int code = errorResponse != null ? errorResponse.getStatusCode() : 0;
						String url = request.getUrl() != null ? request.getUrl().toString() : "";
						if (isLocalAsset(url)) {
							return;
						}
						String kind = code == 404 || code == 410 ? "not_found" : "server_error";
						if (code >= 500) {
							kind = "server_error";
						}
						// Never leave Frappe 404 HTML on screen
						showConnectionError(kind, url, code);
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
						String kind = "unknown";
						if (error != null) {
							int code = error.getErrorCode();
							if (code == ERROR_HOST_LOOKUP) {
								kind = "dns";
							} else if (code == ERROR_TIMEOUT) {
								kind = "timeout";
							} else if (code == ERROR_FAILED_SSL_HANDSHAKE || code == ERROR_UNSUPPORTED_SCHEME) {
								kind = "tls";
							} else if (code == ERROR_CONNECT || code == ERROR_IO) {
								kind = "unknown";
							}
						}
						showConnectionError(kind, url, null);
					}

					@Override
					public void onPageStarted(WebView view, String url, Bitmap favicon) {
						super.onPageStarted(view, url, favicon);
					}
				});

		webView.setWebChromeClient(
				new WebChromeClient() {
					@Override
					public void onPermissionRequest(final PermissionRequest request) {
						runOnUiThread(() -> handleWebPermissionRequest(request));
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

		startInitialNavigation();
	}

	private void startInitialNavigation() {
		Uri data = getIntent() != null ? getIntent().getData() : null;
		if (data != null && isAllowedUrl(data) && !"file".equalsIgnoreCase(data.getScheme())) {
			probeAndOpen(normalizeOrigin(data.toString()), getScannerPath());
			return;
		}

		String storedOrigin = prefs().getString(KEY_SERVER_URL, "");
		if (storedOrigin != null && !storedOrigin.isEmpty()) {
			probeAndOpen(storedOrigin, getScannerPath());
			return;
		}

		String baked = BuildConfig.SCANNER_ORIGIN;
		if (baked.contains("example.com") || baked.isEmpty()) {
			loadLocal(BOOTSTRAP_URL);
			return;
		}
		probeAndOpen(baked, getScannerPath());
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
		return BuildConfig.SCANNER_ORIGIN;
	}

	@NonNull
	@Override
	public String getScannerPath() {
		String stored = prefs().getString(KEY_SCANNER_PATH, "");
		if (stored != null && !stored.isEmpty()) {
			return stored;
		}
		try {
			String path = Uri.parse(BuildConfig.SCANNER_URL).getPath();
			return path == null || path.isEmpty() ? "/pos-scanner" : path;
		} catch (Exception e) {
			return "/pos-scanner";
		}
	}

	@Override
	public void applyServerConfig(@NonNull String serverUrl, @NonNull String scannerPath) {
		String origin = normalizeOrigin(serverUrl);
		String path = normalizePath(scannerPath);
		if (origin.isEmpty()) {
			showConnectionError("invalid_url", serverUrl, null);
			return;
		}
		prefs().edit().putString(KEY_SERVER_URL, origin).putString(KEY_SCANNER_PATH, path).apply();
		probeAndOpen(origin, path);
	}

	@Override
	public void retryLastServer() {
		String origin = getServerUrl();
		if (origin.isEmpty() || origin.contains("example.com")) {
			loadLocal(BOOTSTRAP_URL);
			return;
		}
		probeAndOpen(origin, getScannerPath());
	}

	private void probeAndOpen(@NonNull String origin, @NonNull String path) {
		loadLocal(LOADING_URL);
		probeExecutor.execute(
				() -> {
					ScannerProbe.Result result = ScannerProbe.probe(origin, path);
					runOnUiThread(
							() -> {
								if (result.ok) {
									suppressNextHttpError = false;
									if (webView != null) {
										webView.loadUrl(result.url);
									}
								} else {
									showConnectionError(result.kind, result.url, result.status);
								}
							});
				});
	}

	private void showConnectionError(
			@NonNull String kind, @Nullable String url, @Nullable Integer status) {
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
		if (webView != null) {
			webView.loadUrl(url);
		}
	}

	private boolean isLocalAsset(@Nullable String url) {
		return url != null && url.startsWith("file:///android_asset/");
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
							|| path.contains("/android_asset/loading"));
		}
		if (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme)) {
			return false;
		}
		return uri.getHost() != null && !uri.getHost().isEmpty();
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
			if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) {
				wantsCamera = true;
				break;
			}
		}
		if (!wantsCamera) {
			request.deny();
			return;
		}
		if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
				== PackageManager.PERMISSION_GRANTED) {
			request.grant(request.getResources());
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
