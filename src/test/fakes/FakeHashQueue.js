/**
 * Records `add` calls like a BullMQ queue, keyed by queue name.
 * @example const queue = new FakeHashQueue('cover-hash-x'); await queue.add('hashCover', {}, { jobId: 'a' }); queue.jobs // [{ name, data, opts }]
 */
export default class FakeHashQueue {
	constructor(name = 'cover-hash-test-fixture') {
		this.name = name;
		this.jobs = [];
	}

	async add(name, data, opts) {
		this.jobs.push({ name, data, opts });
	}
}
