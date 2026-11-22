package me.brainwise.posnext.scanner;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
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

/**
 * Fullscreen WebView shell that loads the POSNext /pos-scanner PWA.
 * Used by the {@code demo} flavor for sideload without Digital Asset Links,
 * and as an optional fallback for the {@code twa} flavor.
 * Camera stays in-process via getUserMedia — no ZXing Intent / external apps.
 *
 * <p>Server URL / path can be changed in-app (SharedPreferences + JS bridge)
 * so admins do not rebuild the APK for every site.
 */
public class WebViewScannerActivity extends AppCompatActivity implements ShellBridge.Host {
	private static final String PREFS = "posnext_scanner_shell";
	private static final String KEY_SERVER_URL = "server_url";
	private static final String KEY_SCANNER_PATH = "scanner_path";
	private static final String BOOTSTRAP_URL = "file:///android_asset/bootstrap/index.html";

	private WebView webView;
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

		webView.loadUrl(resolveStartUrl());
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
			return;
		}
		prefs().edit().putString(KEY_SERVER_URL, origin).putString(KEY_SCANNER_PATH, path).apply();
		final String target = origin + path;
		runOnUiThread(
				() -> {
					if (webView != null) {
						webView.loadUrl(target);
					}
				});
	}

	private String resolveStartUrl() {
		Uri data = getIntent() != null ? getIntent().getData() : null;
		if (data != null && isAllowedUrl(data)) {
			return data.toString();
		}

		String storedOrigin = prefs().getString(KEY_SERVER_URL, "");
		if (storedOrigin != null && !storedOrigin.isEmpty()) {
			return storedOrigin + getScannerPath();
		}

		// Build-time placeholder or missing site → local bootstrap settings
		String baked = BuildConfig.SCANNER_ORIGIN;
		if (baked.contains("example.com") || baked.isEmpty()) {
			return BOOTSTRAP_URL;
		}
		return BuildConfig.SCANNER_URL;
	}

	private boolean isAllowedUrl(@Nullable Uri uri) {
		if (uri == null) {
			return false;
		}
		String scheme = uri.getScheme();
		if ("file".equalsIgnoreCase(scheme)) {
			String path = uri.getPath();
			return path != null && path.contains("/android_asset/bootstrap");
		}
		if (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme)) {
			return false;
		}
		// Demo shell: allow any http(s) host after admin configures settings (sideload trust model).
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
		if (webView != null) {
			webView.destroy();
			webView = null;
		}
		super.onDestroy();
	}
}
