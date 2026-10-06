import { afterEach, describe, expect, test, vi } from 'vitest';
import { buildQueuesSummary } from '../../../service/queuesSummary.js';

const COUNTS = {
	active: 1,
	waiting: 2,
	delayed: 0,
	failed: 3,
	completed: 4,
	paused: 0,
};

class FakeQueue {
	constructor(name, getJobCounts = () => Promise.resolve(COUNTS)) {
		this.name = name;
		this.getJobCounts = vi.fn(getJobCounts);
		this.add = vi.fn();
		this.remove = vi.fn();
		this.clean = vi.fn();
		this.drain = vi.fn();
		this.obliterate = vi.fn();
		this.pause = vi.fn();
		this.resume = vi.fn();
	}
}

describe('buildQueuesSummary', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	test('sorts queues by name', async () => {
		const queues = ['download', 'connector-b', 'background-tasks'].map(
			(name) => new FakeQueue(name),
		);

		const summary = await buildQueuesSummary(queues);

		expect(summary.map((item) => item.name)).toEqual([
			'background-tasks',
			'connector-b',
			'download',
		]);
		expect(summary[0].counts).toEqual(COUNTS);
	});

	test('rejects when getJobCounts does not answer within 3000ms', async () => {
		vi.useFakeTimers();
		const queues = [new FakeQueue('download', () => new Promise(() => {}))];
		let settled = null;
		buildQueuesSummary(queues).then(
			() => {
				settled = 'resolved';
			},
			(error) => {
				settled = error;
			},
		);

		await vi.advanceTimersByTimeAsync(2999);
		expect(settled).toBeNull();

		await vi.advanceTimersByTimeAsync(1);
		expect(settled).toMatchObject({
			statusCode: 503,
			message: 'Queue backend unavailable',
		});
	});

	test('only reads job counts', async () => {
		const queue = new FakeQueue('download');

		await buildQueuesSummary([queue]);

		expect(queue.getJobCounts).toHaveBeenCalledTimes(1);
		for (const method of [
			'add',
			'remove',
			'clean',
			'drain',
			'obliterate',
			'pause',
			'resume',
		]) {
			expect(queue[method]).not.toHaveBeenCalled();
		}
	});
});
