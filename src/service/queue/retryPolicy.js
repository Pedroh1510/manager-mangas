/**
 * Retry options shared by the download and background queues. Exponential
 * backoff from 30s keeps a failing chapter from being re-downloaded and
 * re-encoded back to back; the 11h/19h update re-enqueues what is left.
 * @example await queue.add(name, data, { ...RETRY_WITH_BACKOFF, jobId });
 */
export const RETRY_WITH_BACKOFF = Object.freeze({
	attempts: 10,
	backoff: Object.freeze({ type: 'exponential', delay: 30000 }),
});
