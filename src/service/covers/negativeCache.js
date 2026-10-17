/**
 * Remembers failed keys for `ttlMs`, so a broken cover is not re-fetched on
 * every render. In memory: a restart costs one retry per key.
 * @example const failures = createNegativeCache({ ttlMs: 1000 }); failures.add('k'); failures.has('k') // true
 * @param {{ ttlMs: number, now?: () => number }} options
 */
export function createNegativeCache({ ttlMs, now = Date.now }) {
	const failedAt = new Map();
	return {
		has(key) {
			const at = failedAt.get(key);
			if (at === undefined) return false;
			if (now() - at < ttlMs) return true;
			failedAt.delete(key);
			return false;
		},
		add(key) {
			failedAt.set(key, now());
		},
		forget(key) {
			failedAt.delete(key);
		},
	};
}
