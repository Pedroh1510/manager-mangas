/**
 * Returns a runner that executes at most `limit` tasks at once. A finished
 * task hands its slot straight to the next waiter, so nothing polls.
 * @example const runLimited = createConcurrencyLimiter(2); await runLimited(() => work());
 * @param {number} limit
 * @returns {<T>(task: () => Promise<T>) => Promise<T>}
 */
export function createConcurrencyLimiter(limit) {
	let active = 0;
	const waiters = [];

	function release() {
		const next = waiters.shift();
		if (next) {
			next();
			return;
		}
		active--;
	}

	async function acquire() {
		if (active < limit) {
			active++;
			return;
		}
		await new Promise((resolvePromise) => waiters.push(resolvePromise));
	}

	return async function runLimited(task) {
		await acquire();
		try {
			return await task();
		} finally {
			release();
		}
	};
}
