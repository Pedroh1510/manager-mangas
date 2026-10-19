/**
 * Records `enqueueBackgroundTask(operation, data, jobId)` calls.
 * @example const queue = new FakeBackgroundQueue(); await queue.enqueue('x', {}, 'id'); queue.jobs // [{ operation: 'x', ... }]
 */
export default class FakeBackgroundQueue {
	jobs = [];

	enqueue = async (operation, data, jobId) => {
		this.jobs.push({ operation, data, jobId });
	};
}
