package me.brainwise.posnext.scanner;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.CookieHandler;
import java.net.CookieManager;
import java.net.HttpCookie;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Cookie-aware HttpURLConnection helper for Frappe API calls from the APK
 * (avoids CORS from appassets.androidplatform.net).
 */
public final class NativeHttp {
	private static final int TIMEOUT_MS = 20000;
	private static final CookieManager COOKIES = new CookieManager();

	static {
		CookieHandler.setDefault(COOKIES);
	}

	private NativeHttp() {}

	public static final class Response {
		public final int status;
		@NonNull public final String body;
		@NonNull public final String url;
		@Nullable public final String csrfToken;

		Response(int status, @NonNull String body, @NonNull String url, @Nullable String csrf) {
			this.status = status;
			this.body = body;
			this.url = url;
			this.csrfToken = csrf;
		}
	}

	/**
	 * @param method GET/POST
	 * @param url absolute URL
	 * @param body nullable request body (JSON or form)
	 * @param contentType e.g. application/json or application/x-www-form-urlencoded
	 * @param headersJson optional JSON object of extra headers
	 */
	@NonNull
	public static Response request(
			@NonNull String method,
			@NonNull String url,
			@Nullable String body,
			@Nullable String contentType,
			@Nullable String headersJson)
			throws Exception {
		HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
		conn.setInstanceFollowRedirects(true);
		conn.setConnectTimeout(TIMEOUT_MS);
		conn.setReadTimeout(TIMEOUT_MS);
		conn.setRequestMethod(method.toUpperCase());
		conn.setRequestProperty("Accept", "application/json");
		conn.setRequestProperty("User-Agent", "POSNextScannerAPK/" + BuildConfig.VERSION_NAME);

		if (headersJson != null && !headersJson.isEmpty()) {
			JSONObject headers = new JSONObject(headersJson);
			JSONArray names = headers.names();
			if (names != null) {
				for (int i = 0; i < names.length(); i++) {
					String key = names.getString(i);
					conn.setRequestProperty(key, headers.getString(key));
				}
			}
		}

		String csrf = findCookieValue(url, "csrf_token");
		if (csrf != null && !csrf.isEmpty() && conn.getRequestProperty("X-Frappe-CSRF-Token") == null) {
			conn.setRequestProperty("X-Frappe-CSRF-Token", csrf);
		}

		byte[] payload = null;
		if (body != null && !body.isEmpty() && !"GET".equalsIgnoreCase(method) && !"HEAD".equalsIgnoreCase(method)) {
			payload = body.getBytes(StandardCharsets.UTF_8);
			conn.setDoOutput(true);
			if (contentType != null && !contentType.isEmpty()) {
				conn.setRequestProperty("Content-Type", contentType);
			}
			conn.setRequestProperty("Content-Length", String.valueOf(payload.length));
		}

		conn.connect();
		if (payload != null) {
			try (OutputStream os = conn.getOutputStream()) {
				os.write(payload);
			}
		}

		int code = conn.getResponseCode();
		InputStream stream = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
		String text = readStream(stream);
		conn.disconnect();
		return new Response(code, text, url, findCookieValue(url, "csrf_token"));
	}

	@Nullable
	private static String findCookieValue(@NonNull String url, @NonNull String name) {
		try {
			URI uri = URI.create(url);
			List<HttpCookie> list = COOKIES.getCookieStore().get(uri);
			if (list != null) {
				for (HttpCookie c : list) {
					if (name.equals(c.getName())) {
						return c.getValue();
					}
				}
			}
			for (HttpCookie c : COOKIES.getCookieStore().getCookies()) {
				if (name.equals(c.getName())) {
					return c.getValue();
				}
			}
		} catch (Exception ignored) {
			/* ignore */
		}
		return null;
	}

	@NonNull
	private static String readStream(@Nullable InputStream stream) throws Exception {
		if (stream == null) {
			return "";
		}
		StringBuilder sb = new StringBuilder();
		try (BufferedReader br =
				new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
			char[] buf = new char[4096];
			int n;
			while ((n = br.read(buf)) >= 0) {
				sb.append(buf, 0, n);
				if (sb.length() > 1_000_000) {
					break;
				}
			}
		}
		return sb.toString();
	}
}
