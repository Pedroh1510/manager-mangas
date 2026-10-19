import { describe, expect, test } from 'vitest';
import { NotFoundError } from '../../../../infra/errors.js';
import { createCoverSyncRequest } from '../../../../service/coverSuggestions/syncRequest.js';
import FakeBackgroundQueue from '../../../fakes/FakeBackgroundQueue.js';

function arrange() {
	const queue = new FakeBackgroundQueue();
	const requestSync = createCoverSyncRequest({
		hasConnector: (idPlugin) => idPlugin === 'nexustoons',
		enqueue: queue.enqueue,
	});
	return { requestSync, queue };
}

describe('cover index sync request', () => {
	test('enqueues the sync of every connector when no idPlugin is given', async () => {
		const { requestSync, queue } = arrange();

		const response = await requestSync({});

		expect(response).toStrictEqual({ idPlugin: null });
		expect(queue.jobs).toStrictEqual([
			{
				operation: 'syncCoverHashIndex',
				data: {},
				jobId: 'sync-cover-index-all',
			},
		]);
	});

	test('enqueues the sync of one connector with the catalog refresh job id', async () => {
		const { requestSync, queue } = arrange();

		const response = await requestSync({ idPlugin: 'nexustoons' });

		expect(response).toStrictEqual({ idPlugin: 'nexustoons' });
		expect(queue.jobs).toStrictEqual([
			{
				operation: 'syncConnectorCoverIndex',
				data: { idPlugin: 'nexustoons' },
				jobId: 'sync-cover-index-nexustoons',
			},
		]);
	});

	test('rejects an unknown idPlugin without enqueueing', async () => {
		const { requestSync, queue } = arrange();

		await expect(requestSync({ idPlugin: 'missing' })).rejects.toBeInstanceOf(
			NotFoundError,
		);
		expect(queue.jobs).toStrictEqual([]);
	});
});
