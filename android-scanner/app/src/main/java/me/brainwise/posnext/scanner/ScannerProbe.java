package me.brainwise.posnext.scanner;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.MalformedURLException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.net.URL;
import java.security.cert.CertPathValidatorException;
import java.util.ArrayList;
import java.util.List;
import javax.net.ssl.SSLException;
import javax.net.ssl.SSLHandshakeException;

/**
 * Native HTTP probe for the configured scanner route. Runs off the UI thread.
 */
public final class ScannerProbe {
	public static final int TIMEOUT_MS = 12000;

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
		HttpURLConnection conn = null;
		try {
			conn = open(url, "HEAD");
			int code = conn.getResponseCode();
			return mapStatus(code, url);
		} catch (Exception headErr) {
			closeQuietly(conn);
			conn = null;
			try {
				conn = open(url, "GET");
				int code = conn.getResponseCode();
				return mapStatus(code, url);
			} catch (Exception e) {
				return mapException(e, url);
			} finally {
				closeQuietly(conn);
			}
		} finally {
			closeQuietly(conn);
		}
	}

	private static HttpURLConnection open(String url, String method) throws IOException {
		HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
		conn.setInstanceFollowRedirects(true);
		conn.setConnectTimeout(TIMEOUT_MS);
		conn.setReadTimeout(TIMEOUT_MS);
		conn.setRequestMethod(method);
		conn.setRequestProperty("Accept", "text/html,application/json,*/*");
		conn.setRequestProperty("User-Agent", "POSNextScannerAPK/0.1");
		conn.connect();
		return conn;
	}

	private static Result mapStatus(int code, String url) {
		if (code >= 200 && code < 400) {
			return new Result(true, "ok", code, url);
		}
		if (code == 404 || code == 410) {
			return new Result(false, "not_found", code, url);
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
		String msg = String.valueOf(e.getMessage()).toLowerCase();
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
