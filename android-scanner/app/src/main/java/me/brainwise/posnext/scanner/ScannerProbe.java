package me.brainwise.posnext.scanner;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.MalformedURLException;
import java.net.ProtocolException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.cert.CertPathValidatorException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import javax.net.ssl.SSLException;
import javax.net.ssl.SSLHandshakeException;

/**
 * Native HTTP probe for the configured scanner route. Runs off the UI thread.
 * Treats Frappe soft-404 HTML ("Здесь ничего нет") as not_found even on HTTP 200.
 */
public final class ScannerProbe {
	public static final int TIMEOUT_MS = 10000;
	private static final int BODY_PEEK_BYTES = 8192;

	public static final class Result {
		public final boolean ok;
		@NonNull public final String kind;
		@Nullable public final Integer status;
		@NonNull public final String url;

		public Result(boolean ok, @NonNull String kind, @Nullable Integer status, @NonNull String url) {
			this.ok = ok;
			this.kind = kind;
			this.status = status;
			this.url = url;
		}
	}

	private ScannerProbe() {}

	@NonNull
	public static Result probe(@NonNull String origin, @NonNull String path) {
		String base = origin.replaceAll("/+$", "") + (path.startsWith("/") ? path : "/" + path);
		base = base.replaceAll("/+$", "");
		List<String> candidates = new ArrayList<>();
		candidates.add(base);
		candidates.add(base + "/");
		try {
			URL u = new URL(base);
			String root = u.getProtocol() + "://" + u.getAuthority();
			candidates.add(root + "/assets/pos_next/pos_scanner/manifest.webmanifest");
			candidates.add(root + "/assets/pos_next/pos_scanner/index.html");
		} catch (MalformedURLException ignored) {
			return new Result(false, "invalid_url", null, base);
		}

		boolean sawNotFound = false;
		boolean sawServerError = false;
		Integer lastStatus = null;
		Result firstTransport = null;

		for (int i = 0; i < candidates.size(); i++) {
			String candidate = candidates.get(i);
			Result one = probeOne(candidate);
			if (one.ok) {
				return new Result(true, "ok", one.status, base);
			}
			if ("not_found".equals(one.kind)) {
				sawNotFound = true;
				lastStatus = one.status;
				continue;
			}
			if ("server_error".equals(one.kind)) {
				sawServerError = true;
				lastStatus = one.status;
				continue;
			}
			if (i == 0) {
				firstTransport = one;
			}
		}

		if (sawNotFound) {
			return new Result(false, "not_found", lastStatus, base);
		}
		if (sawServerError) {
			return new Result(false, "server_error", lastStatus, base);
		}
		if (firstTransport != null) {
			return new Result(false, firstTransport.kind, firstTransport.status, base);
		}
		return new Result(false, "unknown", lastStatus, base);
	}

	@NonNull
	private static Result probeOne(@NonNull String url) {
		// Always GET + body peek: HEAD cannot detect Frappe soft-404 HTML
		// served with HTTP 200, and many hosts reject HEAD with 405.
		return request(url, "GET", true);
	}

	@NonNull
	private static Result request(@NonNull String url, @NonNull String method, boolean peekBody) {
		HttpURLConnection conn = null;
		try {
			conn = open(url, method);
			int code = conn.getResponseCode();
			if (code >= 200 && code < 400) {
				if (peekBody && looksLikeFrappeNotFound(peekBody(conn))) {
					return new Result(false, "not_found", code, url);
				}
				return new Result(true, "ok", code, url);
			}
			return mapStatus(code, url);
		} catch (Exception e) {
			return mapException(e, url);
		} finally {
			closeQuietly(conn);
		}
	}

	private static HttpURLConnection open(String url, String method) throws IOException {
		HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
		conn.setInstanceFollowRedirects(true);
		conn.setConnectTimeout(TIMEOUT_MS);
		conn.setReadTimeout(TIMEOUT_MS);
		try {
			conn.setRequestMethod(method);
		} catch (ProtocolException e) {
			throw e;
		}
		conn.setRequestProperty("Accept", "text/html,application/json,*/*");
		conn.setRequestProperty("User-Agent", "POSNextScannerAPK/0.1");
		conn.connect();
		return conn;
	}

	@NonNull
	private static String peekBody(@NonNull HttpURLConnection conn) {
		InputStream in = null;
		try {
			in = conn.getErrorStream();
			if (in == null) {
				in = conn.getInputStream();
			}
			if (in == null) {
				return "";
			}
			ByteArrayOutputStream buf = new ByteArrayOutputStream();
			byte[] tmp = new byte[1024];
			int total = 0;
			int n;
			while (total < BODY_PEEK_BYTES && (n = in.read(tmp, 0, Math.min(tmp.length, BODY_PEEK_BYTES - total))) > 0) {
				buf.write(tmp, 0, n);
				total += n;
			}
			return buf.toString(StandardCharsets.UTF_8.name());
		} catch (Exception e) {
			return "";
		} finally {
			if (in != null) {
				try {
					in.close();
				} catch (IOException ignored) {
					/* ignore */
				}
			}
		}
	}

	static boolean looksLikeFrappeNotFound(@NonNull String body) {
		if (body.isEmpty()) {
			return false;
		}
		String lower = body.toLowerCase(Locale.ROOT);
		boolean frappe =
				lower.contains("powered by erpnext")
						|| lower.contains("powered by frappe")
						|| lower.contains("frappe");
		boolean missing =
				body.contains("Здесь ничего нет")
						|| lower.contains("not found")
						|| lower.contains("page not found")
						|| lower.contains("не найдено");
		return missing && (frappe || body.contains("Здесь ничего нет"));
	}

	private static Result mapStatus(int code, String url) {
		if (code >= 200 && code < 400) {
			return new Result(true, "ok", code, url);
		}
		if (code == 404 || code == 410) {
			return new Result(false, "not_found", code, url);
		}
		if (code == 405 || code == 501) {
			// Method not allowed — caller may retry GET
			return new Result(false, "unknown", code, url);
		}
		if (code >= 500) {
			return new Result(false, "server_error", code, url);
		}
		return new Result(false, "unknown", code, url);
	}

	private static Result mapException(Exception e, String url) {
		Throwable t = e;
		while (t != null) {
			if (t instanceof UnknownHostException) {
				return new Result(false, "dns", null, url);
			}
			if (t instanceof SocketTimeoutException) {
				return new Result(false, "timeout", null, url);
			}
			if (t instanceof SSLHandshakeException
					|| t instanceof SSLException
					|| t instanceof CertPathValidatorException) {
				return new Result(false, "tls", null, url);
			}
			t = t.getCause();
		}
		String msg = String.valueOf(e.getMessage()).toLowerCase(Locale.ROOT);
		if (msg.contains("ssl") || msg.contains("cert")) {
			return new Result(false, "tls", null, url);
		}
		if (msg.contains("unable to resolve") || msg.contains("unknown host")) {
			return new Result(false, "dns", null, url);
		}
		return new Result(false, "unknown", null, url);
	}

	private static void closeQuietly(@Nullable HttpURLConnection conn) {
		if (conn != null) {
			conn.disconnect();
		}
	}
}
