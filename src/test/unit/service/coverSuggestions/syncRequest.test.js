import { describe, expect, test } from 'vitest';
import { ConflictError, NotFoundError } from '../../../../infra/errors.js';
import { createCoverSyncRequest } from '../../../../service/coverSuggestions/syncRequest.js';
import FakeBackgroundQueue from '../../../fakes/FakeBackgroundQueue.js';

function arrange({ disabledIds = [] } = {}) {
	const queue = new FakeBackgroundQueue();
	const requestSync = createCoverSyncRequest({
		hasConnector: (idPlugin) => ['nexustoons', 'wicomix'].includes(idPlugin),
		assertConnectorEnabled: async (idPlugin) => {
			if (!disabledIds.includes(idPlugin)) return;
			throw new ConflictError({ message: `Connector ${idPlugin} is disabled` });
		},
		enqueue: queue.enqueue,
	});
	return { requestSync, queue };
}

describe('cover index sync request', () => {
	test('refuses a disabled connector without enqueueing', async () => {
		const { requestSync, queue } = arrange({ disabledIds: ['wicomix'] });

		await expect(requestSync({ idPlugin: 'wicomix' })).rejects.toMatchObject({
			statusCode: 409,
		});
		expect(queue.jobs).toStrictEqual([]);
	});

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
