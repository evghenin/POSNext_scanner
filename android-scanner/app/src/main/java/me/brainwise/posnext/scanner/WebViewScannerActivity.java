package me.brainwise.posnext.scanner;

import android.Manifest;
import android.annotation.SuppressLint;
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
 */
public class WebViewScannerActivity extends AppCompatActivity {
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

	@SuppressLint("SetJavaScriptEnabled")
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
		settings.setAllowFileAccess(false);
		settings.setAllowContentAccess(false);
		settings.setCacheMode(WebSettings.LOAD_DEFAULT);
		settings.setUserAgentString(settings.getUserAgentString() + " POSNextScannerAPK/0.1");

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

		String url = resolveStartUrl();
		webView.loadUrl(url);
	}

	private String resolveStartUrl() {
		Uri data = getIntent() != null ? getIntent().getData() : null;
		if (data != null && isAllowedUrl(data)) {
			return data.toString();
		}
		return BuildConfig.SCANNER_URL;
	}

	private boolean isAllowedUrl(@Nullable Uri uri) {
		if (uri == null) {
			return false;
		}
		String scheme = uri.getScheme();
		if (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme)) {
			return false;
		}
		Uri origin = Uri.parse(BuildConfig.SCANNER_ORIGIN);
		String host = uri.getHost();
		return host != null && host.equalsIgnoreCase(origin.getHost());
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
