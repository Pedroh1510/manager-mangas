import { ServiceUnavailableError } from '../infra/errors.js';

const COUNT_TYPES = [
	'active',
	'waiting',
	'delayed',
	'failed',
	'completed',
	'paused',
];
// BullMQ commands never reject while Redis is down (lesson L-001), so the
// summary bounds the whole read instead of hanging the Status screen.
const SUMMARY_TIMEOUT_MS = 3000;

function rejectAfter(ms) {
	let timer;
	const promise = new Promise((_, reject) => {
		timer = setTimeout(
			() =>
				reject(
					new ServiceUnavailableError({
						message: 'Queue backend unavailable',
						action: 'Check the Redis connection',
					}),
				),
			ms,
		);
	});
	return { promise, cancel: () => clearTimeout(timer) };
}

async function readCounts(queue) {
	const counts = await queue.getJobCounts(...COUNT_TYPES);
	return { name: queue.name, counts };
}

/**
 * Job counts per state for each queue, sorted by queue name.
 * @example await buildQueuesSummary([getDownloadQueue()])
 */
export async function buildQueuesSummary(queues) {
	const timeout = rejectAfter(SUMMARY_TIMEOUT_MS);
	try {
		const summary = await Promise.race([
			Promise.all(queues.map(readCounts)),
			timeout.promise,
		]);
		return summary.toSorted((a, b) => a.name.localeCompare(b.name));
	} finally {
		timeout.cancel();
	}
}
