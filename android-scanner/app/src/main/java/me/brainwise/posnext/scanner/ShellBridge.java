package me.brainwise.posnext.scanner;

import android.webkit.JavascriptInterface;

import androidx.annotation.NonNull;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * JS bridge for the WebView shell. Lets the Vue UI change API server URL and
 * run a native reachability probe (no CORS). Offline builds keep the Vue UI
 * in assets — server URL is API-only.
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

		/** Native frappe.ping probe; result delivered via {@code window.__posNextProbeDone}. */
		void probeApi(@NonNull String serverUrl, @NonNull String callbackId);
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
		host.applyServerConfig(
				serverUrl == null ? "" : serverUrl.trim(),
				scannerPath == null ? "" : scannerPath.trim());
	}

	@JavascriptInterface
	public void retryLastServer() {
		host.retryLastServer();
	}

	@JavascriptInterface
	public void probeApi(String serverUrl, String callbackId) {
		host.probeApi(
				serverUrl == null ? "" : serverUrl.trim(),
				callbackId == null ? "" : callbackId.trim());
	}
}
