import { describe, expect, test } from 'vitest';
import {
	createIndexSync,
	hashJobId,
} from '../../../../service/coverSuggestions/indexSync.js';
import FakeCatalogCoverHashes from '../../../fakes/FakeCatalogCoverHashes.js';
import FakeClock from '../../../fakes/FakeClock.js';
import FakeCoverSuggestions from '../../../fakes/FakeCoverSuggestions.js';
import FakeHashQueue from '../../../fakes/FakeHashQueue.js';

const PLUGIN = 'test-fixture';

function arrange({ catalog, rows = [], clock = new FakeClock() }) {
	const queue = new FakeHashQueue();
	const hashes = new FakeCatalogCoverHashes(rows);
	const suggestions = new FakeCoverSuggestions();
	const sync = createIndexSync({
		loadCatalog: async (id) => (id === PLUGIN ? catalog : null),
		hashes,
		suggestions,
		getHashQueue: () => queue,
		now: clock.now,
	});
	return { sync, queue, hashes, suggestions };
}

const hashedRow = (idMangaPlugin, coverUrl) => ({
	idPlugin: PLUGIN,
	idMangaPlugin,
	coverUrl,
	dHash: 1n,
	pHash: 2n,
});

describe('cover hash index sync', () => {
	test('enqueues items without hash or with a changed coverUrl', async () => {
		const { sync, queue } = arrange({
			catalog: [
				{ id: 'a', coverUrl: 'u1' },
				{ id: 'b', coverUrl: 'u2' },
				{ id: 'c', coverUrl: 'u3' },
				{ id: 'd' },
			],
			rows: [hashedRow('a', 'u1'), hashedRow('b', 'old')],
		});

		await sync.syncConnector(PLUGIN);

		expect(queue.jobs).toEqual([
			{
				name: 'hashCover',
				data: { idPlugin: PLUGIN, idMangaPlugin: 'b', coverUrl: 'u2' },
				opts: { jobId: hashJobId(PLUGIN, 'b') },
			},
			{
				name: 'hashCover',
				data: { idPlugin: PLUGIN, idMangaPlugin: 'c', coverUrl: 'u3' },
				opts: { jobId: hashJobId(PLUGIN, 'c') },
			},
		]);
		expect(hashJobId(PLUGIN, 'b')).toMatch(/^hash-test-fixture-[0-9a-f]{40}$/);
	});

	test('applies the 1/3/7 day backoff and stops at 4 failures', async () => {
		const cases = [
			{
				failureCount: 1,
				hoursAgo: 23 + 59 / 60,
				coverUrl: 'u',
				expected: false,
			},
			{ failureCount: 1, hoursAgo: 24 + 1 / 60, coverUrl: 'u', expected: true },
			{
				failureCount: 2,
				hoursAgo: 2 * 24 + 23,
				coverUrl: 'u',
				expected: false,
			},
			{ failureCount: 2, hoursAgo: 3 * 24 + 1, coverUrl: 'u', expected: true },
			{
				failureCount: 3,
				hoursAgo: 6 * 24 + 23,
				coverUrl: 'u',
				expected: false,
			},
			{ failureCount: 3, hoursAgo: 7 * 24 + 1, coverUrl: 'u', expected: true },
			{ failureCount: 4, hoursAgo: 30 * 24, coverUrl: 'u', expected: false },
			{ failureCount: 4, hoursAgo: 1, coverUrl: 'other', expected: true },
		];
		for (const { failureCount, hoursAgo, coverUrl, expected } of cases) {
			const clock = new FakeClock();
			const { sync, queue } = arrange({
				clock,
				catalog: [{ id: 'a', coverUrl: 'u' }],
				rows: [
					{
						idPlugin: PLUGIN,
						idMangaPlugin: 'a',
						coverUrl,
						dHash: null,
						pHash: null,
						failureCount,
						failedAt: clock.hoursAgo(hoursAgo),
					},
				],
			});

			await sync.syncConnector(PLUGIN);

			expect(
				queue.jobs.length,
				`failureCount ${failureCount}, ${hoursAgo}h ago, ${coverUrl}`,
			).toBe(expected ? 1 : 0);
		}
	});

	test('skips a connector with no catalog', async () => {
		const { sync, queue } = arrange({ catalog: [] });

		await expect(sync.syncConnector('mangeek')).resolves.toEqual({
			enqueued: 0,
			removed: 0,
		});
		expect(queue.jobs).toEqual([]);
	});

	test('drops index rows and pending suggestions of removed items', async () => {
		const { sync, hashes, suggestions } = arrange({
			catalog: [{ id: 'a', coverUrl: 'u1' }],
			rows: [hashedRow('a', 'u1'), hashedRow('x', 'ux')],
		});

		await sync.syncConnector(PLUGIN);

		expect(hashes.row(PLUGIN, 'x')).toBeNull();
		expect(hashes.row(PLUGIN, 'a')).not.toBeNull();
		expect(suggestions.deletedItems).toEqual([
			{ idPlugin: PLUGIN, idMangaPlugins: ['x'] },
		]);
	});
});

describe('cover hash index sync of every connector', () => {
	test('syncAll syncs each connector id in turn', async () => {
		const synced = [];
		const sync = createIndexSync({
			loadCatalog: async (id) => {
				synced.push(id);
				return null;
			},
			hashes: new FakeCatalogCoverHashes(),
			suggestions: new FakeCoverSuggestions(),
			getHashQueue: () => new FakeHashQueue(),
		});

		await sync.syncAll(['mangeek', 'nexustoons']);

		expect(synced).toEqual(['mangeek', 'nexustoons']);
	});
});
