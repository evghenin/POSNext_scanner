/**
 * Frame / recognition dedupe so one physical code does not fire many adds.
 * Same value within `ttlMs` is suppressed; intentional rescan after TTL is allowed.
 */
export function createDedupe({ ttlMs = 2500 } = {}) {
	/** @type {Map<string, number>} */
	const lastSeen = new Map();

	function prune(now) {
		for (const [key, ts] of lastSeen) {
			if (now - ts > ttlMs) lastSeen.delete(key);
		}
	}

	/**
	 * @param {string} value
	 * @param {number} [now]
	 * @returns {boolean} true if this is a fresh recognition worth emitting
	 */
	function accept(value, now = Date.now()) {
		const key = String(value || "").trim().toUpperCase();
		if (!key) return false;
		prune(now);
		const prev = lastSeen.get(key);
		if (prev != null && now - prev < ttlMs) return false;
		lastSeen.set(key, now);
		return true;
	}

	function clear() {
		lastSeen.clear();
	}

	/** Allow the same code again immediately (e.g. after user dismisses / adds). */
	function forget(value) {
		lastSeen.delete(String(value || "").trim().toUpperCase());
	}

	return { accept, clear, forget, ttlMs };
}
