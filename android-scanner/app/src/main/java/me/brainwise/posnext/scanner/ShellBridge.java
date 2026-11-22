package me.brainwise.posnext.scanner;

import android.webkit.JavascriptInterface;

import androidx.annotation.NonNull;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * JS bridge for the demo WebView shell. Lets the PWA / bootstrap change
 * API server URL without rebuilding the APK. Offline builds keep the Vue UI
 * in assets — server URL is API-only (never a remote /pos-scanner load).
 */
public final class ShellBridge {
	public interface Host {
		@NonNull
		String getServerUrl();

		@NonNull
		String getScannerPath();

		boolean isOfflineBundle();

		void applyServerConfig(@NonNull String serverUrl, @NonNull String scannerPath);

		void retryLastServer();
	}

	private final Host host;

	public ShellBridge(@NonNull Host host) {
		this.host = host;
	}

	@JavascriptInterface
	public String getServerConfigJson() {
		JSONObject o = new JSONObject();
		try {
			o.put("serverUrl", host.getServerUrl());
			o.put("scannerPath", host.getScannerPath());
			o.put("offlineBundle", host.isOfflineBundle());
		} catch (JSONException ignored) {
			/* empty */
		}
		return o.toString();
	}

	@JavascriptInterface
	public void applyServerConfig(String serverUrl, String scannerPath) {
		// scannerPath ignored for offline bundle (API origin only).
		host.applyServerConfig(
				serverUrl == null ? "" : serverUrl.trim(),
				scannerPath == null ? "" : scannerPath.trim());
	}

	@JavascriptInterface
	public void retryLastServer() {
		host.retryLastServer();
	}
}
